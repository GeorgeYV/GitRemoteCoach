import { withTransaction } from '../lib/db.js';
import * as bookingRepository from '../repositories/bookingRepository.js';
import * as settlementRepository from '../repositories/settlementRepository.js';
import * as tournamentRepository from '../repositories/tournamentRepository.js';
import type { ClubSettlement } from '../types.js';

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
