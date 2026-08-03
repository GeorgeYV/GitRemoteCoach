import { pool, withTransaction } from '../lib/db.js';
import { businessRules } from '../config.js';
import { ConflictError, ValidationError } from '../lib/errors.js';
import * as bookingRepository from '../repositories/bookingRepository.js';
import * as bookingMessageRepository from '../repositories/bookingMessageRepository.js';
import type { Booking } from '../types.js';

const BOOKING_CONFIRMED_SYSTEM_MESSAGE = 'Reserva confirmada · usa este chat para coordinar el punto de encuentro';

export interface RequestBookingParams {
  playerId: string;
  coachId: string;
  tournamentId: string;
  matchDatetime: string;
  agreedRate: number;
  /** Nota libre del padre para el entrenador (CoachRequestInboxScreen, CoachPreMatchReminderScreen). */
  note?: string;
}

export async function requestBooking(params: RequestBookingParams): Promise<Booking> {
  if (new Date(params.matchDatetime).getTime() <= Date.now()) {
    throw new ValidationError('match_datetime debe ser en el futuro');
  }
  const responseDeadline = new Date(Date.now() + businessRules.coachResponseWindowHours * 3600_000);
  const { note, ...rest } = params;
  return bookingRepository.createBookingRequest(
    { ...rest, responseDeadline, parentNote: note },
    pool,
  );
}

/**
 * Al aceptar se abre el hilo de chat con un mensaje de sistema (mismo texto
 * que ya se mostraba en el mock de CoachChatScreen) — ambas cosas atómicas
 * para no dejar una reserva "accepted" sin su mensaje de apertura.
 */
export async function acceptBooking(bookingId: string): Promise<Booking> {
  const paymentDeadline = new Date(Date.now() + businessRules.paymentWindowHours * 3600_000);
  return withTransaction(async (client) => {
    const updated = await bookingRepository.updateStatus(
      bookingId,
      ['requested'],
      'accepted',
      { decided_at: new Date(), payment_deadline: paymentDeadline },
      client,
    );
    if (!updated) {
      throw new ConflictError(
        'La reserva ya no está en estado "requested" (puede haber expirado o ya fue decidida)',
        'invalid_transition',
      );
    }
    await bookingMessageRepository.createMessage(
      { bookingId, senderType: 'system', body: BOOKING_CONFIRMED_SYSTEM_MESSAGE },
      client,
    );
    return updated;
  });
}

export async function rejectBooking(bookingId: string): Promise<Booking> {
  const updated = await bookingRepository.updateStatus(
    bookingId,
    ['requested'],
    'rejected',
    { decided_at: new Date() },
  );
  if (!updated) {
    throw new ConflictError(
      'La reserva ya no está en estado "requested" (puede haber expirado o ya fue decidida)',
      'invalid_transition',
    );
  }
  return updated;
}

/**
 * Placeholder de sugerencia de alternativas: entrenadores del mismo torneo,
 * distintos del original, sin lógica real de matching/disponibilidad todavía.
 * No es el foco de este trabajo — ver resumen de flujo acordado.
 */
export async function suggestAlternativeCoaches(bookingId: string): Promise<Array<{ coachId: string; ratingAvg: number }>> {
  const booking = await bookingRepository.getBookingById(bookingId);
  const { rows } = await pool.query(
    `SELECT DISTINCT cp.user_id AS coach_id, cp.rating_avg
     FROM coach_profiles cp
     JOIN tournament_coach_tags tct ON tct.coach_id = cp.user_id
     WHERE tct.tournament_id = $1 AND cp.user_id != $2
     ORDER BY cp.rating_avg DESC
     LIMIT 5`,
    [booking.tournamentId, booking.coachId],
  );
  return rows.map((r: any) => ({ coachId: r.coach_id, ratingAvg: Number(r.rating_avg) }));
}
