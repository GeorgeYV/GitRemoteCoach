import * as settlementService from '../services/settlementService.js';

/**
 * Job periódico (ej. diario), espejo de settleClubs.ts pero para el pago agregado a
 * entrenadores: para cada torneo cuya end_date ya pasó y tiene reservas 'completed' sin incluir
 * en un coach_payout, corre el batch de liquidación (un coach_payout por entrenador con reservas
 * en ese torneo). Job separado de settleClubs.ts porque las listas de "torneos listos" son
 * distintas — ver findTournamentsReadyForCoachPayout.
 */
export async function runSettleCoachPayoutsJob(): Promise<
  Array<{ tournamentId: string; payoutIds: string[] }>
> {
  const tournamentIds = await settlementService.findTournamentsReadyForCoachPayout();
  const results = [];
  for (const tournamentId of tournamentIds) {
    const payouts = await settlementService.settleTournamentCoachPayouts(tournamentId);
    results.push({ tournamentId, payoutIds: payouts.map((p) => p.id) });
  }
  return results;
}
