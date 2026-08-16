import type { MatchPlayerSlot, PointDetail } from '../types.js';

/**
 * Espeja lib/scoringEngine.ts + lib/statsEngine.ts del frontend (mismo algoritmo puro, sin
 * dependencias de React) — necesario para poder reconstruir sets/games y calcular estadísticas
 * agregadas del lado del servidor (coachProfileService.getCoachReportSummary), ya que exponer los
 * puntos crudos de un partido a un visitante público filtraría datos de un niño específico.
 * Recorta lo que no hace falta para agregar stats (getGamePointLabels, snapshots de UI en vivo).
 */

export function otherPlayer(p: MatchPlayerSlot): MatchPlayerSlot {
  return p === 'player1' ? 'player2' : 'player1';
}

export interface StatsPointEvent {
  timestamp: number;
  wonBy: MatchPlayerSlot;
  detail: PointDetail | null;
  firstServeIn: boolean;
}

export interface StatsScoreAdjustment {
  timestamp: number;
  gamesPlayer1: number;
  gamesPlayer2: number;
  pointsPlayer1: number;
  pointsPlayer2: number;
  server: MatchPlayerSlot;
}

export interface StatsMatchConfig {
  bestOf: 1 | 3;
  noAd: boolean;
  initialServer: MatchPlayerSlot;
}

interface GameRecord {
  server: MatchPlayerSlot;
  winner: MatchPlayerSlot;
  isTiebreak: boolean;
}

interface SetRecord {
  games: GameRecord[];
  winner: MatchPlayerSlot;
  gamesPlayer1: number;
  gamesPlayer2: number;
}

interface PointSnapshot {
  event: StatsPointEvent;
  server: MatchPlayerSlot;
}

interface MatchState {
  completedSets: SetRecord[];
  currentSetGames: GameRecord[];
  currentGamePoints: { player1: number; player2: number };
  inTiebreak: boolean;
  tiebreakPoints: { player1: number; player2: number };
  server: MatchPlayerSlot;
  tiebreakInitialServer: MatchPlayerSlot | null;
  setsWon: { player1: number; player2: number };
  matchEnded: boolean;
  winner: MatchPlayerSlot | null;
  pointHistory: PointSnapshot[];
}

const setsToWin = (bestOf: 1 | 3) => (bestOf === 1 ? 1 : 2);

function createInitialMatchState(config: StatsMatchConfig): MatchState {
  return {
    completedSets: [],
    currentSetGames: [],
    currentGamePoints: { player1: 0, player2: 0 },
    inTiebreak: false,
    tiebreakPoints: { player1: 0, player2: 0 },
    server: config.initialServer,
    tiebreakInitialServer: null,
    setsWon: { player1: 0, player2: 0 },
    matchEnded: false,
    winner: null,
    pointHistory: [],
  };
}

function countGames(games: GameRecord[]): { player1: number; player2: number } {
  return {
    player1: games.filter((g) => g.winner === 'player1').length,
    player2: games.filter((g) => g.winner === 'player2').length,
  };
}

function tiebreakServerForPoint(pointIndex: number, initialServer: MatchPlayerSlot): MatchPlayerSlot {
  if (pointIndex === 0) return initialServer;
  const block = Math.floor((pointIndex - 1) / 2);
  return block % 2 === 0 ? otherPlayer(initialServer) : initialServer;
}

function gameWinner(points: { player1: number; player2: number }, noAd: boolean): MatchPlayerSlot | null {
  const { player1: a, player2: b } = points;
  const marginNeeded = noAd ? 1 : 2;
  if (a >= 4 && a - b >= marginNeeded) return 'player1';
  if (b >= 4 && b - a >= marginNeeded) return 'player2';
  return null;
}

function tiebreakWinner(points: { player1: number; player2: number }): MatchPlayerSlot | null {
  const { player1: a, player2: b } = points;
  if (a >= 7 && a - b >= 2) return 'player1';
  if (b >= 7 && b - a >= 2) return 'player2';
  return null;
}

function setWinner(games: { player1: number; player2: number }): MatchPlayerSlot | null {
  const { player1: a, player2: b } = games;
  if (a >= 6 && a - b >= 2) return 'player1';
  if (b >= 6 && b - a >= 2) return 'player2';
  return null;
}

function processPoint(state: MatchState, event: StatsPointEvent, config: StatsMatchConfig): MatchState {
  if (state.matchEnded) return state;

  const server: MatchPlayerSlot = state.inTiebreak
    ? tiebreakServerForPoint(
        state.tiebreakPoints.player1 + state.tiebreakPoints.player2,
        state.tiebreakInitialServer as MatchPlayerSlot,
      )
    : state.server;

  if (state.inTiebreak) {
    const tiebreakPoints = {
      ...state.tiebreakPoints,
      [event.wonBy]: state.tiebreakPoints[event.wonBy] + 1,
    };
    const tbWinner = tiebreakWinner(tiebreakPoints);

    if (!tbWinner) {
      return { ...state, tiebreakPoints, pointHistory: [...state.pointHistory, { event, server }] };
    }

    const game: GameRecord = { server, winner: tbWinner, isTiebreak: true };
    const currentSetGames = [...state.currentSetGames, game];
    const gamesCount = countGames(currentSetGames);
    const setRecord: SetRecord = {
      games: currentSetGames,
      winner: tbWinner,
      gamesPlayer1: gamesCount.player1,
      gamesPlayer2: gamesCount.player2,
    };
    const completedSets = [...state.completedSets, setRecord];
    const setsWon = { ...state.setsWon, [tbWinner]: state.setsWon[tbWinner] + 1 };
    const nextGameServer = otherPlayer(state.tiebreakInitialServer as MatchPlayerSlot);
    const matchEnded = setsWon[tbWinner] >= setsToWin(config.bestOf);

    return {
      ...state,
      completedSets,
      currentSetGames: [],
      currentGamePoints: { player1: 0, player2: 0 },
      inTiebreak: false,
      tiebreakPoints: { player1: 0, player2: 0 },
      tiebreakInitialServer: null,
      server: nextGameServer,
      setsWon,
      matchEnded,
      winner: matchEnded ? tbWinner : null,
      pointHistory: [...state.pointHistory, { event, server }],
    };
  }

  const currentGamePoints = {
    ...state.currentGamePoints,
    [event.wonBy]: state.currentGamePoints[event.wonBy] + 1,
  };
  const gWinner = gameWinner(currentGamePoints, config.noAd);

  if (!gWinner) {
    return { ...state, currentGamePoints, pointHistory: [...state.pointHistory, { event, server }] };
  }

  const game: GameRecord = { server, winner: gWinner, isTiebreak: false };
  const currentSetGames = [...state.currentSetGames, game];
  const gamesCount = countGames(currentSetGames);
  const nextGameServer = otherPlayer(state.server);

  if (gamesCount.player1 === 6 && gamesCount.player2 === 6) {
    return {
      ...state,
      currentSetGames,
      currentGamePoints: { player1: 0, player2: 0 },
      inTiebreak: true,
      tiebreakInitialServer: nextGameServer,
      pointHistory: [...state.pointHistory, { event, server }],
    };
  }

  const stWinner = setWinner(gamesCount);

  if (!stWinner) {
    return {
      ...state,
      currentSetGames,
      currentGamePoints: { player1: 0, player2: 0 },
      server: nextGameServer,
      pointHistory: [...state.pointHistory, { event, server }],
    };
  }

  const setRecord: SetRecord = {
    games: currentSetGames,
    winner: stWinner,
    gamesPlayer1: gamesCount.player1,
    gamesPlayer2: gamesCount.player2,
  };
  const completedSets = [...state.completedSets, setRecord];
  const setsWon = { ...state.setsWon, [stWinner]: state.setsWon[stWinner] + 1 };
  const matchEnded = setsWon[stWinner] >= setsToWin(config.bestOf);

  return {
    ...state,
    completedSets,
    currentSetGames: [],
    currentGamePoints: { player1: 0, player2: 0 },
    server: nextGameServer,
    setsWon,
    matchEnded,
    winner: matchEnded ? stWinner : null,
    pointHistory: [...state.pointHistory, { event, server }],
  };
}

/** Contingencia "Ajuste manual del marcador" — ver lib/scoringEngine.ts#processAdjustment (misma
 * lógica: fija el set en curso, nunca toca sets ya completados, no deja pointHistory). */
function resizeGamesFor(
  games: GameRecord[],
  player: MatchPlayerSlot,
  target: number,
  fallbackServer: MatchPlayerSlot,
): GameRecord[] {
  const current = games.filter((g) => g.winner === player).length;
  if (target === current) return games;

  if (target > current) {
    const additions: GameRecord[] = Array.from({ length: target - current }, () => ({
      server: fallbackServer,
      winner: player,
      isTiebreak: false,
    }));
    return [...games, ...additions];
  }

  let toRemove = current - target;
  const kept: GameRecord[] = [];
  for (let i = games.length - 1; i >= 0; i--) {
    const g = games[i];
    if (g.winner === player && toRemove > 0) {
      toRemove -= 1;
      continue;
    }
    kept.unshift(g);
  }
  return kept;
}

function processAdjustment(state: MatchState, adj: StatsScoreAdjustment, config: StatsMatchConfig): MatchState {
  if (state.matchEnded) return state;

  let currentSetGames = resizeGamesFor(state.currentSetGames, 'player1', adj.gamesPlayer1, adj.server);
  currentSetGames = resizeGamesFor(currentSetGames, 'player2', adj.gamesPlayer2, adj.server);
  const gamesCount = countGames(currentSetGames);

  if (gamesCount.player1 === 6 && gamesCount.player2 === 6) {
    return {
      ...state,
      currentSetGames,
      currentGamePoints: { player1: 0, player2: 0 },
      inTiebreak: true,
      tiebreakPoints: { player1: 0, player2: 0 },
      tiebreakInitialServer: adj.server,
    };
  }

  const stWinner = setWinner(gamesCount);
  if (stWinner) {
    const setRecord: SetRecord = {
      games: currentSetGames,
      winner: stWinner,
      gamesPlayer1: gamesCount.player1,
      gamesPlayer2: gamesCount.player2,
    };
    const completedSets = [...state.completedSets, setRecord];
    const setsWon = { ...state.setsWon, [stWinner]: state.setsWon[stWinner] + 1 };
    const matchEnded = setsWon[stWinner] >= setsToWin(config.bestOf);
    return {
      ...state,
      completedSets,
      currentSetGames: [],
      currentGamePoints: { player1: 0, player2: 0 },
      inTiebreak: false,
      server: adj.server,
      setsWon,
      matchEnded,
      winner: matchEnded ? stWinner : null,
    };
  }

  return {
    ...state,
    currentSetGames,
    currentGamePoints: { player1: adj.pointsPlayer1, player2: adj.pointsPlayer2 },
    inTiebreak: false,
    server: adj.server,
  };
}

function computeMatchState(
  events: StatsPointEvent[],
  config: StatsMatchConfig,
  adjustments: StatsScoreAdjustment[],
): MatchState {
  type LogItem =
    | { kind: 'point'; ts: number; event: StatsPointEvent }
    | { kind: 'adjustment'; ts: number; adjustment: StatsScoreAdjustment };

  const log: LogItem[] = [
    ...events.map((event) => ({ kind: 'point' as const, ts: event.timestamp, event })),
    ...adjustments.map((adjustment) => ({ kind: 'adjustment' as const, ts: adjustment.timestamp, adjustment })),
  ];
  log.sort((a, b) => a.ts - b.ts);

  let state = createInitialMatchState(config);
  for (const item of log) {
    state = item.kind === 'point' ? processPoint(state, item.event, config) : processAdjustment(state, item.adjustment, config);
  }
  return state;
}

function getAllGames(state: MatchState): GameRecord[] {
  return [...state.completedSets.flatMap((s) => s.games), ...state.currentSetGames];
}

export interface PlayerMatchStats {
  winners: number;
  unforcedErrors: number;
  firstServePct: number | null;
  breaksConverted: number;
  returnGamesPlayed: number;
}

function emptyStats(): PlayerMatchStats {
  return { winners: 0, unforcedErrors: 0, firstServePct: null, breaksConverted: 0, returnGamesPlayed: 0 };
}

/** Reconstruye el partido a partir de sus puntos crudos + ajustes manuales y devuelve las stats
 * del jugador seguido por el coach (player1 — player2 es el rival, un texto libre sin cuenta propia). */
export function computePlayer1MatchStats(
  events: StatsPointEvent[],
  config: StatsMatchConfig,
  adjustments: StatsScoreAdjustment[] = [],
): PlayerMatchStats {
  const state = computeMatchState(events, config, adjustments);
  const stats: Record<MatchPlayerSlot, PlayerMatchStats> = { player1: emptyStats(), player2: emptyStats() };
  const firstServeAttempts: Record<MatchPlayerSlot, number> = { player1: 0, player2: 0 };
  const firstServesIn: Record<MatchPlayerSlot, number> = { player1: 0, player2: 0 };

  for (const { event, server } of state.pointHistory) {
    switch (event.detail) {
      case 'winner_derecha':
      case 'winner_reves':
      case 'winner_volea':
      case 'winner':
      case 'ace':
        stats[event.wonBy].winners += 1;
        break;
      case 'error_no_forzado':
      case 'error_no_forzado_derecha':
      case 'error_no_forzado_reves':
        stats[otherPlayer(event.wonBy)].unforcedErrors += 1;
        break;
      default:
        break;
    }

    // "Punto no visto": el marcador ya avanzó, pero no hay dato real de saque que promediar.
    if (event.detail === 'dato_no_capturado') continue;

    firstServeAttempts[server] += 1;
    if (event.firstServeIn) firstServesIn[server] += 1;
  }

  (['player1', 'player2'] as MatchPlayerSlot[]).forEach((p) => {
    stats[p].firstServePct = firstServeAttempts[p] > 0 ? Math.round((firstServesIn[p] / firstServeAttempts[p]) * 100) : null;
  });

  for (const game of getAllGames(state)) {
    if (game.isTiebreak) continue;
    const returner = otherPlayer(game.server);
    stats[returner].returnGamesPlayed += 1;
    if (game.winner === returner) stats[returner].breaksConverted += 1;
  }

  return stats.player1;
}
