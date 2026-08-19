import { withTransaction } from '../lib/db.js';
import { stripe } from '../lib/stripe.js';
import { businessRules } from '../config.js';
import { ConflictError, ValidationError } from '../lib/errors.js';
import * as bookingRepository from '../repositories/bookingRepository.js';
import * as paymentRepository from '../repositories/paymentRepository.js';
import * as coachRepository from '../repositories/coachRepository.js';
import type { Booking, CancelActor } from '../types.js';

const CURRENCY = 'mxn';
// 'payment_submitted' cuenta como "sin pago capturado todavía": el padre mandó un comprobante,
// pero platform_admin todavía no lo verificó, así que no hay ningún cargo real que reembolsar.
const NON_TERMINAL_UNPAID_STATUSES: Booking['status'][] = ['requested', 'accepted', 'payment_submitted', 'payment_failed'];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface CancelBookingParams {
  bookingId: string;
  actor: CancelActor;
  actorUserId: string;
  reason?: string;
}

export async function cancelBooking(params: CancelBookingParams): Promise<Booking> {
  const { bookingId, actor, actorUserId, reason } = params;

  return withTransaction(async (client) => {
    const booking = await bookingRepository.getBookingByIdForUpdate(bookingId, client);

    if (booking.status === 'completed') {
      // Caso borde de carrera (requisito 5): el partido ya se jugó (completeBooking ya corrió).
      // No se revierte automáticamente — se rechaza y se enruta a revisión manual/soporte.
      throw new ConflictError(
        'La reserva ya fue completada; no se puede cancelar automáticamente. Contactar soporte.',
        'already_completed',
      );
    }
    if (booking.status === 'cancelled') {
      throw new ConflictError('La reserva ya está cancelada', 'already_cancelled');
    }
    if (booking.status === 'rejected' || booking.status === 'expired') {
      throw new ConflictError(`No se puede cancelar una reserva en estado "${booking.status}"`, 'invalid_transition');
    }

    // Sin pago capturado todavía: cancelación simple, sin reembolso que procesar.
    if (NON_TERMINAL_UNPAID_STATUSES.includes(booking.status)) {
      const updated = await bookingRepository.updateStatus(
        bookingId,
        NON_TERMINAL_UNPAID_STATUSES,
        'cancelled',
        {
          cancelled_by: actorUserId,
          cancellation_reason: reason ?? null,
          refund_amount: 0,
          coach_compensation_amount: 0,
          flagged_for_coach_penalty: actor === 'coach',
          cancelled_at: new Date(),
        },
        client,
      );
      if (!updated) throw new ConflictError('La reserva cambió de estado antes de poder cancelarse', 'invalid_transition');
      return updated;
    }

    // booking.status === 'paid': hay dinero retenido, hay que reembolsar.
    if (!booking.paymentReference) {
      throw new ValidationError('La reserva está pagada pero no tiene payment_reference; estado inconsistente');
    }
    // Reserva pagada manual (paymentProvider no nulo): payment_reference es el código de
    // operación que escribió el padre, no un payment_intent real — no hay nada que reembolsar
    // vía Stripe. El reembolso real (Deuna/Yape/Plin) lo hace el admin por fuera de la app,
    // usando estos mismos montos calculados acá.
    const isManualPayment = booking.paymentProvider !== null;
    const totalPaid = Number(booking.totalAmountPaid);
    const hoursUntilMatch = (new Date(booking.matchDatetime).getTime() - Date.now()) / 3600_000;

    let refundAmount: number;
    let coachCompensationAmount = 0;

    if (actor === 'coach') {
      // El entrenador cancela: reembolso completo al padre, sin excepción.
      refundAmount = totalPaid;
    } else if (hoursUntilMatch > businessRules.lateCancellationWindowHours) {
      // Padre cancela con más de 24h de anticipación: reembolso completo.
      refundAmount = totalPaid;
    } else {
      // Padre cancela con menos de 24h: reembolso parcial + compensación
      // al entrenador por el tiempo bloqueado, tomada de la porción no
      // reembolsada (se le aplica la misma tasa de comisión de plataforma
      // que en el flujo normal, sin comisión de club porque el servicio
      // nunca se prestó y el torneo no se factura por esto).
      refundAmount = round2(totalPaid * businessRules.lateCancellationRefundPct);
      const retained = round2(totalPaid - refundAmount);
      coachCompensationAmount = round2(retained * (1 - businessRules.platformCommissionRate));
    }

    if (isManualPayment) {
      await paymentRepository.recordTransaction(
        { bookingId, type: 'refund', status: 'succeeded', amount: refundAmount },
        client,
      );
      if (coachCompensationAmount > 0) {
        await paymentRepository.recordTransaction(
          { bookingId, type: 'transfer', status: 'succeeded', amount: coachCompensationAmount },
          client,
        );
      }
    } else {
      const refund = await stripe.refunds.create({
        payment_intent: booking.paymentReference,
        amount: Math.round(refundAmount * 100),
      });
      await paymentRepository.recordTransaction(
        { bookingId, type: 'refund', status: 'succeeded', amount: refundAmount, stripeObjectId: refund.id, rawResponse: refund },
        client,
      );

      if (coachCompensationAmount > 0) {
        const coach = await coachRepository.getCoachPayoutInfo(booking.coachId, client);
        if (coach.stripeConnectedAccountId) {
          const transfer = await stripe.transfers.create({
            amount: Math.round(coachCompensationAmount * 100),
            currency: CURRENCY,
            destination: coach.stripeConnectedAccountId,
            transfer_group: bookingId,
            metadata: { bookingId, reason: 'late_cancellation_compensation' },
          });
          await paymentRepository.recordTransaction(
            { bookingId, type: 'transfer', status: 'succeeded', amount: coachCompensationAmount, stripeObjectId: transfer.id, rawResponse: transfer },
            client,
          );
        }
      }
    }

    const updated = await bookingRepository.updateStatus(
      bookingId,
      ['paid'],
      'cancelled',
      {
        cancelled_by: actorUserId,
        cancellation_reason: reason ?? null,
        refund_amount: refundAmount,
        coach_compensation_amount: coachCompensationAmount,
        flagged_for_coach_penalty: actor === 'coach',
        cancelled_at: new Date(),
      },
      client,
    );
    if (!updated) throw new ConflictError('La reserva cambió de estado durante el reembolso', 'invalid_transition');
    return updated;
  });
}
