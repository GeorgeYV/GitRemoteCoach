import Stripe from 'stripe';
import { withTransaction } from '../lib/db.js';
import { stripe } from '../lib/stripe.js';
import { businessRules } from '../config.js';
import { ConflictError, ValidationError } from '../lib/errors.js';
import * as bookingRepository from '../repositories/bookingRepository.js';
import * as paymentRepository from '../repositories/paymentRepository.js';
import * as coachRepository from '../repositories/coachRepository.js';
import * as tournamentRepository from '../repositories/tournamentRepository.js';
import type { Booking } from '../types.js';

const CURRENCY = 'mxn';

interface SplitAmounts {
  totalAmountPaid: number;
  platformCommissionAmount: number;
  clubCommissionAmount: number;
  coachNetAmount: number;
}

/** Split de tres partes sobre el mismo monto total (ver requisito de negocio: no se suma comisión encima de la tarifa). */
function computeSplit(agreedRate: number, clubCommissionRate: number): SplitAmounts {
  const platformCommissionAmount = round2(agreedRate * businessRules.platformCommissionRate);
  const clubCommissionAmount = round2(agreedRate * clubCommissionRate);
  const coachNetAmount = round2(agreedRate - platformCommissionAmount - clubCommissionAmount);
  return { totalAmountPaid: agreedRate, platformCommissionAmount, clubCommissionAmount, coachNetAmount };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * El padre paga tras la aceptación del entrenador. Captura inmediata hacia
 * el balance de la plataforma (patrón "separate charges and transfers" —
 * ver decisión de diseño #8 en db/schema.sql). El monto se retiene hasta
 * completeBooking().
 */
export async function initiatePayment(
  bookingId: string,
  paymentMethodId: string,
): Promise<{ booking: Booking; requiresAction?: { clientSecret: string } }> {
  return withTransaction(async (client) => {
    const booking = await bookingRepository.getBookingByIdForUpdate(bookingId, client);

    if (booking.status === 'payment_failed') {
      // reintento permitido
    } else if (booking.status !== 'accepted') {
      throw new ConflictError(`No se puede pagar una reserva en estado "${booking.status}"`, 'invalid_transition');
    }
    if (booking.paymentDeadline && new Date(booking.paymentDeadline).getTime() < Date.now()) {
      throw new ConflictError('La ventana de pago para esta reserva ya venció', 'payment_window_expired');
    }

    const { clubCommissionRate } = await tournamentRepository.getTournamentCommissionInfo(booking.tournamentId, client);
    const split = computeSplit(Number(booking.agreedRate), clubCommissionRate);

    let intent: Stripe.PaymentIntent;
    try {
      intent = await stripe.paymentIntents.create({
        amount: Math.round(split.totalAmountPaid * 100),
        currency: CURRENCY,
        payment_method: paymentMethodId,
        confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        metadata: { bookingId },
      });
    } catch (err) {
      if (err instanceof Stripe.errors.StripeCardError) {
        await paymentRepository.recordTransaction(
          {
            bookingId,
            type: 'charge_failed',
            status: 'failed',
            amount: split.totalAmountPaid,
            rawResponse: { message: (err as Error).message },
          },
          client,
        );
        await bookingRepository.updateStatus(bookingId, ['accepted', 'payment_failed'], 'payment_failed', {}, client);
        throw new ConflictError('El pago fue rechazado por la pasarela', 'payment_declined');
      }
      throw err;
    }

    if (intent.status === 'requires_action') {
      await paymentRepository.recordTransaction(
        { bookingId, type: 'charge', status: 'pending', amount: split.totalAmountPaid, stripeObjectId: intent.id },
        client,
      );
      return { booking, requiresAction: { clientSecret: intent.client_secret! } };
    }

    if (intent.status !== 'succeeded') {
      await bookingRepository.updateStatus(bookingId, ['accepted', 'payment_failed'], 'payment_failed', {}, client);
      throw new ConflictError(`Pago no completado, estado de Stripe: ${intent.status}`, 'payment_declined');
    }

    await paymentRepository.recordTransaction(
      { bookingId, type: 'charge', status: 'succeeded', amount: split.totalAmountPaid, stripeObjectId: intent.id, rawResponse: intent },
      client,
    );

    const updated = await bookingRepository.updateStatus(
      bookingId,
      ['accepted', 'payment_failed'],
      'paid',
      {
        total_amount_paid: split.totalAmountPaid,
        platform_commission_amount: split.platformCommissionAmount,
        club_commission_amount: split.clubCommissionAmount,
        coach_net_amount: split.coachNetAmount,
        payment_reference: intent.id,
      },
      client,
    );
    if (!updated) throw new ConflictError('La reserva cambió de estado durante el pago', 'invalid_transition');

    return { booking: updated };
  });
}

/**
 * Confirma un pago que requirió acción adicional (3DS) vía webhook
 * `payment_intent.succeeded` / `payment_intent.payment_failed`. Idempotente:
 * si ya existe una transacción 'succeeded' para este payment intent, no hace nada.
 */
export async function handlePaymentIntentWebhook(event: Stripe.Event): Promise<void> {
  const intent = event.data.object as Stripe.PaymentIntent;
  const bookingId = intent.metadata.bookingId;
  if (!bookingId) return;

  await withTransaction(async (client) => {
    const existing = await paymentRepository.findByStripeObjectId(intent.id, client);
    if (existing?.status === 'succeeded' || existing?.status === 'failed') return;

    const booking = await bookingRepository.getBookingByIdForUpdate(bookingId, client);
    if (booking.status !== 'accepted' && booking.status !== 'payment_failed') return;

    if (event.type === 'payment_intent.succeeded') {
      const { clubCommissionRate } = await tournamentRepository.getTournamentCommissionInfo(booking.tournamentId, client);
      const split = computeSplit(Number(booking.agreedRate), clubCommissionRate);

      await paymentRepository.recordTransaction(
        { bookingId, type: 'charge', status: 'succeeded', amount: split.totalAmountPaid, stripeObjectId: intent.id, rawResponse: intent },
        client,
      );
      await bookingRepository.updateStatus(
        bookingId,
        ['accepted', 'payment_failed'],
        'paid',
        {
          total_amount_paid: split.totalAmountPaid,
          platform_commission_amount: split.platformCommissionAmount,
          club_commission_amount: split.clubCommissionAmount,
          coach_net_amount: split.coachNetAmount,
          payment_reference: intent.id,
        },
        client,
      );
    } else if (event.type === 'payment_intent.payment_failed') {
      await paymentRepository.recordTransaction(
        { bookingId, type: 'charge_failed', status: 'failed', amount: intent.amount / 100, stripeObjectId: intent.id, rawResponse: intent },
        client,
      );
      await bookingRepository.updateStatus(bookingId, ['accepted', 'payment_failed'], 'payment_failed', {}, client);
    }
  });
}

/** Libera los fondos retenidos al entrenador y marca el servicio como completado. */
export async function completeBooking(bookingId: string): Promise<Booking> {
  return withTransaction(async (client) => {
    const booking = await bookingRepository.getBookingByIdForUpdate(bookingId, client);
    if (booking.status !== 'paid') {
      throw new ConflictError(`No se puede completar una reserva en estado "${booking.status}"`, 'invalid_transition');
    }

    const coach = await coachRepository.getCoachPayoutInfo(booking.coachId, client);
    if (!coach.stripeConnectedAccountId) {
      throw new ValidationError('El entrenador no tiene una cuenta de Stripe Connect configurada');
    }

    const transfer = await stripe.transfers.create({
      amount: Math.round(Number(booking.coachNetAmount) * 100),
      currency: CURRENCY,
      destination: coach.stripeConnectedAccountId,
      transfer_group: bookingId,
      metadata: { bookingId },
    });

    await paymentRepository.recordTransaction(
      { bookingId, type: 'transfer', status: 'succeeded', amount: Number(booking.coachNetAmount), stripeObjectId: transfer.id, rawResponse: transfer },
      client,
    );

    const updated = await bookingRepository.updateStatus(
      bookingId,
      ['paid'],
      'completed',
      { completed_at: new Date() },
      client,
    );
    if (!updated) throw new ConflictError('La reserva cambió de estado durante la liberación de fondos', 'invalid_transition');
    return updated;
  });
}
