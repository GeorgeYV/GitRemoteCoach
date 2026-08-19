import { withTransaction } from '../lib/db.js';
import * as bookingRepository from '../repositories/bookingRepository.js';
import * as coachPayoutRepository from '../repositories/coachPayoutRepository.js';
import * as settlementRepository from '../repositories/settlementRepository.js';
import * as tournamentRepository from '../repositories/tournamentRepository.js';
import type { ClubSettlement, CoachPayout } from '../types.js';

/**
 * Liquida a un club/federación las comisiones "generated" de un torneo ya
 * finalizado, en un solo batch. Simula el pago real (requisito 4): solo
 * calcula y marca como liquidado, sin integrar transferencia bancaria.
 * Devuelve null si no había comisiones pendientes para ese torneo.
 */
export async function settleTournamentCommissions(tournamentId: string): Promise<ClubSettlement | null> {
  return withTransaction(async (client) => {
    const tournament = await tournamentRepository.getTournamentCommissionInfo(tournamentId, client);
    // Sin club (torneo sin reclamar, ver decisión #36 en db/schema.sql) no hay a quién liquidar —
    // sus bookings quedan con club_commission_amount 0 y club_commission_status 'generated' hasta
    // que alguien lo reclame; este job los vuelve a intentar en cada corrida sin efecto, lo cual
    // es aceptable (no hay volumen esperado de torneos que queden sin reclamar indefinidamente).
    if (tournament.clubId === null) return null;
    const pendingBookings = await bookingRepository.findPendingCommissionsForTournament(tournamentId, client);

    if (pendingBookings.length === 0) return null;

    const totalCommissionAmount = pendingBookings.reduce(
      (sum, b) => sum + Number(b.clubCommissionAmount ?? 0),
      0,
    );

    const settlement = await settlementRepository.createSettlement(
      {
        clubId: tournament.clubId,
        tournamentId,
        periodStart: tournament.startDate,
        periodEnd: tournament.endDate,
        totalCommissionAmount: Math.round(totalCommissionAmount * 100) / 100,
      },
      client,
    );

    await bookingRepository.markBookingsSettled(
      pendingBookings.map((b) => b.id),
      settlement.id,
      client,
    );

    return settlement;
  });
}

/** Torneos cuya end_date ya pasó y todavía tienen comisiones sin liquidar. */
export async function findTournamentsReadyForSettlement(): Promise<string[]> {
  return tournamentRepository.findTournamentsEndedWithoutFullSettlement();
}

/**
 * Agrega cuánto se le debe a cada entrenador de un torneo ya finalizado — un coach_payout por
 * entrenador (a diferencia de club_settlements, que es uno solo por torneo/club, acá puede haber
 * varios entrenadores distintos con reservas 'completed' en el mismo torneo). A diferencia de
 * settleTournamentCommissions, NO hace bail si el torneo no tiene club — los entrenadores cobran
 * igual, tenga o no dueño el torneo. Simula el pago real, mismo criterio que club_settlements:
 * solo calcula y marca como pagado, sin integrar transferencia bancaria (ver
 * PlatformAdminPayoutsScreen — el admin le paga por fuera de la app usando este cálculo).
 */
export async function settleTournamentCoachPayouts(tournamentId: string): Promise<CoachPayout[]> {
  return withTransaction(async (client) => {
    const tournament = await tournamentRepository.getTournamentCommissionInfo(tournamentId, client);
    const pendingBookings = await bookingRepository.findPendingCoachPayoutsForTournament(tournamentId, client);
    if (pendingBookings.length === 0) return [];

    const bookingsByCoach = new Map<string, typeof pendingBookings>();
    for (const booking of pendingBookings) {
      const existing = bookingsByCoach.get(booking.coachId);
      if (existing) existing.push(booking);
      else bookingsByCoach.set(booking.coachId, [booking]);
    }

    const payouts: CoachPayout[] = [];
    for (const [coachId, bookings] of bookingsByCoach) {
      const totalNetAmount = bookings.reduce((sum, b) => sum + Number(b.coachNetAmount ?? 0), 0);
      const payout = await coachPayoutRepository.createCoachPayout(
        {
          coachId,
          tournamentId,
          periodStart: tournament.startDate,
          periodEnd: tournament.endDate,
          totalNetAmount: Math.round(totalNetAmount * 100) / 100,
        },
        client,
      );
      await bookingRepository.markBookingsPaidOut(
        bookings.map((b) => b.id),
        payout.id,
        client,
      );
      payouts.push(payout);
    }

    return payouts;
  });
}

/** Torneos cuya end_date ya pasó y todavía le deben un pago agregado a algún entrenador —
 * lista propia, no la de findTournamentsReadyForSettlement (ver comentario en
 * tournamentRepository.findTournamentsEndedWithoutCoachPayout). */
export async function findTournamentsReadyForCoachPayout(): Promise<string[]> {
  return tournamentRepository.findTournamentsEndedWithoutCoachPayout();
}
