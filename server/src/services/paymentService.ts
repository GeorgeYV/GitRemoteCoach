import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import { withTransaction } from '../lib/db.js';
import { stripe } from '../lib/stripe.js';
import { businessRules } from '../config.js';
import { ConflictError, ValidationError } from '../lib/errors.js';
import * as bookingRepository from '../repositories/bookingRepository.js';
import * as paymentRepository from '../repositories/paymentRepository.js';
import * as coachRepository from '../repositories/coachRepository.js';
import * as matchRepository from '../repositories/matchRepository.js';
import * as tournamentRepository from '../repositories/tournamentRepository.js';
import * as notificationService from './notificationService.js';
import type { Booking, PaymentProvider } from '../types.js';

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

/** IDs de mock/parentFlow.ts#mockPaymentMethods ("card-1"/"card-2") — nunca fueron tokens reales
 * de Stripe (esos llegan con prefijo "pm_"). Mandárselos tal cual a la API real de Stripe la hace
 * rechazarlos con un error que no es StripeCardError, así que no lo captura el catch de abajo y
 * termina como un 500 sin manejar. Como todavía no hay un proveedor de pago real conectado (Stripe
 * quedó despriorizado para esta fase, ver decisión de producto), se simula el cobro en su lugar. */
function isMockPaymentMethod(paymentMethodId: string): boolean {
  return !paymentMethodId.startsWith('pm_');
}

function simulatedSucceededIntent(): Stripe.PaymentIntent {
  return { id: `sim_${randomUUID()}`, status: 'succeeded' } as Stripe.PaymentIntent;
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
    if (isMockPaymentMethod(paymentMethodId)) {
      intent = simulatedSucceededIntent();
    } else {
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
 *
 * Cubre tanto un pago individual (metadata.bookingId, ver initiatePayment) como un pago
 * combinado de varios días (metadata.bookingIds separado por comas, ver initiatePaymentBatch) —
 * el primero se trata como un lote de tamaño 1 en vez de duplicar esta lógica.
 */
export async function handlePaymentIntentWebhook(event: Stripe.Event): Promise<void> {
  const intent = event.data.object as Stripe.PaymentIntent;
  const bookingIds = intent.metadata.bookingIds
    ? intent.metadata.bookingIds.split(',')
    : intent.metadata.bookingId
      ? [intent.metadata.bookingId]
      : [];
  if (bookingIds.length === 0) return;

  await withTransaction(async (client) => {
    const existing = await paymentRepository.findByStripeObjectId(intent.id, client);
    if (existing?.status === 'succeeded' || existing?.status === 'failed') return;

    const bookings = await bookingRepository.getBookingsByIdsForUpdate(bookingIds, client);
    const payable = bookings.filter((b) => b.status === 'accepted' || b.status === 'payment_failed');
    if (payable.length === 0) return;

    if (event.type === 'payment_intent.succeeded') {
      const commissionRateByTournament = new Map<string, number>();
      for (const booking of payable) {
        let clubCommissionRate = commissionRateByTournament.get(booking.tournamentId);
        if (clubCommissionRate === undefined) {
          clubCommissionRate = (
            await tournamentRepository.getTournamentCommissionInfo(booking.tournamentId, client)
          ).clubCommissionRate;
          commissionRateByTournament.set(booking.tournamentId, clubCommissionRate);
        }
        const split = computeSplit(Number(booking.agreedRate), clubCommissionRate);

        await paymentRepository.recordTransaction(
          { bookingId: booking.id, type: 'charge', status: 'succeeded', amount: split.totalAmountPaid, stripeObjectId: intent.id, rawResponse: intent },
          client,
        );
        await bookingRepository.updateStatus(
          booking.id,
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
      }
    } else if (event.type === 'payment_intent.payment_failed') {
      // El monto total del intent se reparte por igual entre las reservas pagables solo para
      // fines de registro (payment_transactions.amount) — no vuelve a tocar agreed_rate/los
      // montos de split, que ya quedaron congelados en cada booking al crearla.
      const perBookingAmount = round2(intent.amount / 100 / payable.length);
      for (const booking of payable) {
        await paymentRepository.recordTransaction(
          { bookingId: booking.id, type: 'charge_failed', status: 'failed', amount: perBookingAmount, stripeObjectId: intent.id, rawResponse: intent },
          client,
        );
        await bookingRepository.updateStatus(booking.id, ['accepted', 'payment_failed'], 'payment_failed', {}, client);
      }
    }
  });
}

/**
 * Igual que initiatePayment pero para varias reservas a la vez, cobradas en un solo Stripe
 * PaymentIntent (ver decisión de negocio: "reservar más de 1 día" — el padre paga una sola vez
 * por el total en vez de N pagos separados). payment_transactions sigue teniendo una fila por
 * reserva (columna booking_id singular, ver paymentRepository), todas comparten el mismo
 * stripeObjectId — no hizo falta cambiar el schema.
 */
export async function initiatePaymentBatch(
  bookingIds: string[],
  paymentMethodId: string,
): Promise<{ bookings: Booking[]; requiresAction?: { clientSecret: string } }> {
  return withTransaction(async (client) => {
    const bookings = await bookingRepository.getBookingsByIdsForUpdate(bookingIds, client);

    for (const booking of bookings) {
      if (booking.status !== 'accepted' && booking.status !== 'payment_failed') {
        throw new ConflictError(`No se puede pagar una reserva en estado "${booking.status}"`, 'invalid_transition');
      }
      if (booking.paymentDeadline && new Date(booking.paymentDeadline).getTime() < Date.now()) {
        throw new ConflictError('La ventana de pago para esta reserva ya venció', 'payment_window_expired');
      }
    }

    const commissionRateByTournament = new Map<string, number>();
    const splitByBookingId = new Map<string, SplitAmounts>();
    let totalAmount = 0;
    for (const booking of bookings) {
      let clubCommissionRate = commissionRateByTournament.get(booking.tournamentId);
      if (clubCommissionRate === undefined) {
        clubCommissionRate = (
          await tournamentRepository.getTournamentCommissionInfo(booking.tournamentId, client)
        ).clubCommissionRate;
        commissionRateByTournament.set(booking.tournamentId, clubCommissionRate);
      }
      const split = computeSplit(Number(booking.agreedRate), clubCommissionRate);
      splitByBookingId.set(booking.id, split);
      totalAmount += split.totalAmountPaid;
    }
    totalAmount = round2(totalAmount);

    let intent: Stripe.PaymentIntent;
    if (isMockPaymentMethod(paymentMethodId)) {
      intent = simulatedSucceededIntent();
    } else {
      try {
        intent = await stripe.paymentIntents.create({
          amount: Math.round(totalAmount * 100),
          currency: CURRENCY,
          payment_method: paymentMethodId,
          confirm: true,
          automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
          metadata: { bookingIds: bookingIds.join(',') },
        });
      } catch (err) {
        if (err instanceof Stripe.errors.StripeCardError) {
          for (const booking of bookings) {
            await paymentRepository.recordTransaction(
              {
                bookingId: booking.id,
                type: 'charge_failed',
                status: 'failed',
                amount: splitByBookingId.get(booking.id)!.totalAmountPaid,
                rawResponse: { message: (err as Error).message },
              },
              client,
            );
            await bookingRepository.updateStatus(booking.id, ['accepted', 'payment_failed'], 'payment_failed', {}, client);
          }
          throw new ConflictError('El pago fue rechazado por la pasarela', 'payment_declined');
        }
        throw err;
      }
    }

    if (intent.status === 'requires_action') {
      for (const booking of bookings) {
        await paymentRepository.recordTransaction(
          {
            bookingId: booking.id,
            type: 'charge',
            status: 'pending',
            amount: splitByBookingId.get(booking.id)!.totalAmountPaid,
            stripeObjectId: intent.id,
          },
          client,
        );
      }
      return { bookings, requiresAction: { clientSecret: intent.client_secret! } };
    }

    if (intent.status !== 'succeeded') {
      for (const booking of bookings) {
        await bookingRepository.updateStatus(booking.id, ['accepted', 'payment_failed'], 'payment_failed', {}, client);
      }
      throw new ConflictError(`Pago no completado, estado de Stripe: ${intent.status}`, 'payment_declined');
    }

    const updatedBookings: Booking[] = [];
    for (const booking of bookings) {
      const split = splitByBookingId.get(booking.id)!;
      await paymentRepository.recordTransaction(
        { bookingId: booking.id, type: 'charge', status: 'succeeded', amount: split.totalAmountPaid, stripeObjectId: intent.id, rawResponse: intent },
        client,
      );
      const updated = await bookingRepository.updateStatus(
        booking.id,
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
      updatedBookings.push(updated);
    }

    return { bookings: updatedBookings };
  });
}

/**
 * Fase 1 sin Stripe: el padre paga por fuera de la app (Deuna/Yape/Plin) y manda un código de
 * operación con esta función — solo registra la intención, sin mover plata ni calcular el split
 * todavía (eso pasa recién al verificar, ver verifyPayment). Mismo criterio de reintento que
 * initiatePayment: válido desde 'accepted' o 'payment_failed'.
 */
export async function submitPaymentProof(
  bookingIds: string[],
  params: { provider: PaymentProvider; referenceCode: string },
): Promise<Booking[]> {
  return withTransaction(async (client) => {
    const bookings = await bookingRepository.getBookingsByIdsForUpdate(bookingIds, client);
    for (const booking of bookings) {
      if (booking.status !== 'accepted' && booking.status !== 'payment_failed') {
        throw new ConflictError(`No se puede pagar una reserva en estado "${booking.status}"`, 'invalid_transition');
      }
      if (booking.paymentDeadline && new Date(booking.paymentDeadline).getTime() < Date.now()) {
        throw new ConflictError('La ventana de pago para esta reserva ya venció', 'payment_window_expired');
      }
    }

    const updated: Booking[] = [];
    for (const booking of bookings) {
      const result = await bookingRepository.updateStatus(
        booking.id,
        ['accepted', 'payment_failed'],
        'payment_submitted',
        {
          payment_provider: params.provider,
          payment_reference: params.referenceCode,
          payment_submitted_at: new Date(),
        },
        client,
      );
      if (!result) throw new ConflictError('La reserva cambió de estado antes de enviar el comprobante', 'invalid_transition');
      updated.push(result);
    }
    return updated;
  });
}

/**
 * platform_admin confirma o rechaza un pago manual enviado con submitPaymentProof
 * (PlatformAdminPaymentsScreen). Al verificar, recién acá se calcula el split — misma
 * matemática que initiatePayment/Batch, sin Stripe — y se registra como 'charge' succeeded
 * (stripeObjectId ausente: no hay objeto real de Stripe detrás de este cobro). Al rechazar,
 * vuelve a 'accepted' con payment_deadline re-armado — si no, el job de expiración podría matarla
 * antes de que el padre pueda reintentar con otro comprobante.
 */
/** Orden inverso a matchService#maybeCompleteBookingForFinishedMatch: ahí el partido ya había
 * terminado cuando se verifica el pago (el entrenador y la jugadora ya jugaron, el comprobante
 * quedó esperando revisión del admin). Sin esto, esa reserva se quedaría "paid" para siempre — el
 * botón manual "Marcar sesión como completada" seguiría sirviendo, pero nadie se acordaría de
 * tocarlo. Corre DESPUÉS de que la transacción de verifyPayment ya confirmó (completeBooking abre
 * su propia transacción — anidarla acá adentro bloquearía sobre la misma fila `bookings`). */
async function maybeCompleteBookingForAlreadyFinishedMatch(bookingId: string): Promise<void> {
  try {
    const match = await matchRepository.findByBookingId(bookingId);
    if (match?.status === 'completed') {
      await completeBooking(bookingId);
    }
  } catch (err) {
    console.error(`No se pudo completar automáticamente la reserva ${bookingId} tras verificar el pago:`, err);
  }
}

export async function verifyPayment(
  bookingIds: string[],
  verifiedByUserId: string,
  decision: 'verified' | 'rejected',
): Promise<Booking[]> {
  const verifiedBookings = await withTransaction(async (client) => {
    const bookings = await bookingRepository.getBookingsByIdsForUpdate(bookingIds, client);
    for (const booking of bookings) {
      if (booking.status !== 'payment_submitted') {
        throw new ConflictError(`No se puede verificar una reserva en estado "${booking.status}"`, 'invalid_transition');
      }
    }

    const updated: Booking[] = [];

    if (decision === 'rejected') {
      for (const booking of bookings) {
        const result = await bookingRepository.updateStatus(
          booking.id,
          ['payment_submitted'],
          'accepted',
          {
            payment_provider: null,
            payment_reference: null,
            payment_submitted_at: null,
            payment_deadline: new Date(Date.now() + businessRules.paymentWindowHours * 60 * 60 * 1000),
          },
          client,
        );
        if (!result) throw new ConflictError('La reserva cambió de estado durante la revisión', 'invalid_transition');
        updated.push(result);
      }
      return updated;
    }

    const commissionRateByTournament = new Map<string, number>();
    for (const booking of bookings) {
      let clubCommissionRate = commissionRateByTournament.get(booking.tournamentId);
      if (clubCommissionRate === undefined) {
        clubCommissionRate = (
          await tournamentRepository.getTournamentCommissionInfo(booking.tournamentId, client)
        ).clubCommissionRate;
        commissionRateByTournament.set(booking.tournamentId, clubCommissionRate);
      }
      const split = computeSplit(Number(booking.agreedRate), clubCommissionRate);

      await paymentRepository.recordTransaction(
        { bookingId: booking.id, type: 'charge', status: 'succeeded', amount: split.totalAmountPaid },
        client,
      );
      const result = await bookingRepository.updateStatus(
        booking.id,
        ['payment_submitted'],
        'paid',
        {
          total_amount_paid: split.totalAmountPaid,
          platform_commission_amount: split.platformCommissionAmount,
          club_commission_amount: split.clubCommissionAmount,
          coach_net_amount: split.coachNetAmount,
          payment_verified_by: verifiedByUserId,
        },
        client,
      );
      if (!result) throw new ConflictError('La reserva cambió de estado durante la verificación', 'invalid_transition');
      updated.push(result);
    }
    return updated;
  });

  if (decision === 'verified') {
    for (const booking of verifiedBookings) {
      await maybeCompleteBookingForAlreadyFinishedMatch(booking.id);
    }
  }

  return verifiedBookings;
}

/** Libera los fondos retenidos al entrenador y marca el servicio como completado. Reserva pagada
 * manual (paymentProvider no nulo): solo bookkeeping, sin transfer real — no hay cuenta de Stripe
 * Connect de por medio. Reserva pagada por Stripe (paymentProvider null, camino dormido en esta
 * fase): comportamiento real sin cambios. */
export async function completeBooking(bookingId: string): Promise<Booking> {
  const updated = await withTransaction(async (client) => {
    const booking = await bookingRepository.getBookingByIdForUpdate(bookingId, client);
    if (booking.status !== 'paid') {
      throw new ConflictError(`No se puede completar una reserva en estado "${booking.status}"`, 'invalid_transition');
    }

    if (booking.paymentProvider) {
      await paymentRepository.recordTransaction(
        { bookingId, type: 'transfer', status: 'succeeded', amount: Number(booking.coachNetAmount) },
        client,
      );
    } else {
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
    }

    const result = await bookingRepository.updateStatus(
      bookingId,
      ['paid'],
      'completed',
      { completed_at: new Date() },
      client,
    );
    if (!result) throw new ConflictError('La reserva cambió de estado durante la liberación de fondos', 'invalid_transition');
    return result;
  });

  // Un solo lugar para avisar "tu reporte ya está listo" sin importar cómo se llegó acá — botón
  // manual del entrenador, o cualquiera de los dos casos automáticos (ver matchService y
  // verifyPayment más arriba). notifyUser nunca tira (token inválido/expirado es un no-op ahí).
  const parentUserId = await bookingRepository.getParentUserIdForBooking(updated.id);
  await notificationService.notifyUser(parentUserId, {
    title: 'Tu reporte ya está listo',
    body: 'El reporte del partido ya está disponible — entrá a la app para verlo.',
    data: { bookingId: updated.id },
  });

  return updated;
}
