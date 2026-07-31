import * as settlementService from '../services/settlementService.js';

/**
 * Job periódico (ej. diario): para cada torneo cuya end_date ya pasó y
 * tiene comisiones 'generated' sin liquidar, corre el batch de liquidación.
 */
export async function runSettleClubsJob(): Promise<Array<{ tournamentId: string; settlementId: string | null }>> {
  const tournamentIds = await settlementService.findTournamentsReadyForSettlement();
  const results = [];
  for (const tournamentId of tournamentIds) {
    const settlement = await settlementService.settleTournamentCommissions(tournamentId);
    results.push({ tournamentId, settlementId: settlement?.id ?? null });
  }
  return results;
}
