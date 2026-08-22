import { MatchState, getAllGames } from './scoringEngine';
import { PlayerId, otherPlayer } from './types';

export interface PlayerStats {
  winners: number;
  aces: number;
  unforcedErrors: number;
  forcedErrors: number;
  doubleFaults: number;
  firstServePct: number | null;
  serviceGamesPlayed: number;
  returnGamesPlayed: number;
  breaksConverted: number;
  breaksSuffered: number;
  /** "devoluciones regaladas": unforced errors made specifically on the return of serve. */
  returnErrorsGifted: number;
  /** points played while returning (server was the opponent) — denominator for the above. */
  returnPointsPlayed: number;
}

export interface MatchStats {
  player1: PlayerStats;
  player2: PlayerStats;
}

function emptyStats(): PlayerStats {
  return {
    winners: 0,
    aces: 0,
    unforcedErrors: 0,
    forcedErrors: 0,
    doubleFaults: 0,
    firstServePct: null,
    serviceGamesPlayed: 0,
    returnGamesPlayed: 0,
    breaksConverted: 0,
    breaksSuffered: 0,
    returnErrorsGifted: 0,
    returnPointsPlayed: 0,
  };
}

export function computeMatchStats(state: MatchState): MatchStats {
  const stats: Record<PlayerId, PlayerStats> = { player1: emptyStats(), player2: emptyStats() };
  const firstServeAttempts: Record<PlayerId, number> = { player1: 0, player2: 0 };
  const firstServesIn: Record<PlayerId, number> = { player1: 0, player2: 0 };

  for (const { event, server } of state.pointHistory) {
    const loser = otherPlayer(event.wonBy);

    switch (event.detail) {
      case 'winner_derecha':
      case 'winner_reves':
      case 'winner_volea':
      case 'winner':
        stats[event.wonBy].winners += 1;
        break;
      case 'ace':
        stats[event.wonBy].winners += 1;
        stats[event.wonBy].aces += 1;
        break;
      case 'doble_falta':
        stats[loser].doubleFaults += 1;
        break;
      case 'error_forzado':
        stats[loser].forcedErrors += 1;
        break;
      case 'error_no_forzado':
      case 'error_no_forzado_derecha':
      case 'error_no_forzado_reves':
      case 'error_no_forzado_volea':
        stats[loser].unforcedErrors += 1;
        break;
      default:
        break;
    }

    // "Punto no visto": el marcador ya avanzó al procesar el evento (scoringEngine no mira
    // `detail`), pero el punto queda fuera de todos los % — no hay dato real que promediar.
    if (event.detail === 'dato_no_capturado') continue;

    firstServeAttempts[server] += 1;
    if (event.firstServeIn) firstServesIn[server] += 1;

    const returner = otherPlayer(server);
    stats[returner].returnPointsPlayed += 1;
    if (event.isReturnError) stats[returner].returnErrorsGifted += 1;
  }

  (['player1', 'player2'] as PlayerId[]).forEach((p) => {
    stats[p].firstServePct =
      firstServeAttempts[p] > 0 ? Math.round((firstServesIn[p] / firstServeAttempts[p]) * 100) : null;
  });

  for (const game of getAllGames(state)) {
    if (game.isTiebreak) continue;
    const returner = otherPlayer(game.server);
    stats[game.server].serviceGamesPlayed += 1;
    stats[returner].returnGamesPlayed += 1;
    if (game.winner === returner) {
      stats[returner].breaksConverted += 1;
      stats[game.server].breaksSuffered += 1;
    }
  }

  return { player1: stats.player1, player2: stats.player2 };
}

export function returnErrorsGiftedPct(stats: PlayerStats): number | null {
  return stats.returnPointsPlayed > 0 ? Math.round((stats.returnErrorsGifted / stats.returnPointsPlayed) * 100) : null;
}
