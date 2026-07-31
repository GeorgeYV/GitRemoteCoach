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
  };
}

export function computeMatchStats(state: MatchState): MatchStats {
  const stats: Record<PlayerId, PlayerStats> = { player1: emptyStats(), player2: emptyStats() };
  const firstServeAttempts: Record<PlayerId, number> = { player1: 0, player2: 0 };
  const firstServesIn: Record<PlayerId, number> = { player1: 0, player2: 0 };

  for (const { event, server } of state.pointHistory) {
    switch (event.detail) {
      case 'winner_derecha':
      case 'winner_reves':
      case 'winner_volea':
        stats[event.wonBy].winners += 1;
        break;
      case 'ace':
        stats[event.wonBy].winners += 1;
        stats[event.wonBy].aces += 1;
        break;
      case 'doble_falta':
        stats[otherPlayer(event.wonBy)].doubleFaults += 1;
        break;
      case 'error_no_forzado':
        stats[otherPlayer(event.wonBy)].unforcedErrors += 1;
        break;
      case 'error_forzado':
        stats[otherPlayer(event.wonBy)].forcedErrors += 1;
        break;
      default:
        break;
    }

    firstServeAttempts[server] += 1;
    if (event.firstServeIn) firstServesIn[server] += 1;
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
