import { MATCH_FORMAT_RULES, MATCH_TIEBREAK_TARGET, deciderSetIndex, type MatchFormatRules } from './matchFormats';
import { MatchConfig, PlayerId, PointEvent, ScoreAdjustment, otherPlayer } from './types';

export interface GameRecord {
  server: PlayerId;
  winner: PlayerId;
  isTiebreak: boolean;
}

export interface SetRecord {
  games: GameRecord[];
  winner: PlayerId;
  gamesPlayer1: number;
  gamesPlayer2: number;
  tiebreak?: { player1: number; player2: number };
}

export interface PointSnapshot {
  event: PointEvent;
  /** who was serving when this specific point was played */
  server: PlayerId;
  gameWonBy?: PlayerId;
  setWonBy?: PlayerId;
  matchWonBy?: PlayerId;
}

export interface MatchState {
  completedSets: SetRecord[];
  currentSetGames: GameRecord[];
  currentGamePoints: { player1: number; player2: number };
  inTiebreak: boolean;
  tiebreakPoints: { player1: number; player2: number };
  /** server of the current (or next) regular game */
  server: PlayerId;
  /** who served the first point of the current tiebreak, null outside a tiebreak */
  tiebreakInitialServer: PlayerId | null;
  setsWon: { player1: number; player2: number };
  matchEnded: boolean;
  winner: PlayerId | null;
  pointHistory: PointSnapshot[];
}

/** true si el set en el índice completedSetsCount (0-based, el que está por arrancar o en curso)
 * es el set decisivo de este formato Y ese formato lo juega como un match tiebreak en vez de un
 * set normal a games — el único set de 'super_tiebreak_only' (índice 0), o el 3er set de
 * 'match_tiebreak'/'match_tiebreak_short' (índice 2, y solo se llega ahí si los sets van 1-1). */
function isDeciderSetStart(rules: MatchFormatRules, completedSetsCount: number): boolean {
  return rules.deciderIsMatchTiebreak && completedSetsCount === deciderSetIndex(rules);
}

/** A qué puntaje se gana el tie-break EN CURSO — MATCH_TIEBREAK_TARGET (10) si el set actual es
 * el decisivo de un formato "match tiebreak", 7 para cualquier otro (el 6-6/4-4 normal dentro de
 * un set). Se deriva de completedSets.length en vez de guardarse en el estado: un set no puede
 * ser decisivo Y llegar a jugarse a games a la vez (ver processPoint), así que no hay ambigüedad. */
function currentTiebreakTarget(state: MatchState, rules: MatchFormatRules): number {
  return isDeciderSetStart(rules, state.completedSets.length) ? MATCH_TIEBREAK_TARGET : 7;
}

export function createInitialMatchState(config: MatchConfig): MatchState {
  const rules = MATCH_FORMAT_RULES[config.format];
  const startsAsDecider = isDeciderSetStart(rules, 0);
  return {
    completedSets: [],
    currentSetGames: [],
    currentGamePoints: { player1: 0, player2: 0 },
    inTiebreak: startsAsDecider,
    tiebreakPoints: { player1: 0, player2: 0 },
    server: config.initialServer,
    tiebreakInitialServer: startsAsDecider ? config.initialServer : null,
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

function tiebreakServerForPoint(pointIndex: number, initialServer: PlayerId): PlayerId {
  if (pointIndex === 0) return initialServer;
  const block = Math.floor((pointIndex - 1) / 2);
  return block % 2 === 0 ? otherPlayer(initialServer) : initialServer;
}

function gameWinner(points: { player1: number; player2: number }, noAd: boolean): PlayerId | null {
  const { player1: a, player2: b } = points;
  const marginNeeded = noAd ? 1 : 2;
  if (a >= 4 && a - b >= marginNeeded) return 'player1';
  if (b >= 4 && b - a >= marginNeeded) return 'player2';
  return null;
}

function tiebreakWinner(points: { player1: number; player2: number }, target: number): PlayerId | null {
  const { player1: a, player2: b } = points;
  if (a >= target && a - b >= 2) return 'player1';
  if (b >= target && b - a >= 2) return 'player2';
  return null;
}

function setWinner(games: { player1: number; player2: number }, gamesPerSet: number): PlayerId | null {
  const { player1: a, player2: b } = games;
  if (a >= gamesPerSet && a - b >= 2) return 'player1';
  if (b >= gamesPerSet && b - a >= 2) return 'player2';
  return null;
}

function processPoint(state: MatchState, event: PointEvent, config: MatchConfig): MatchState {
  if (state.matchEnded) return state;
  const rules = MATCH_FORMAT_RULES[config.format];

  const server: PlayerId = state.inTiebreak
    ? tiebreakServerForPoint(
        state.tiebreakPoints.player1 + state.tiebreakPoints.player2,
        state.tiebreakInitialServer as PlayerId
      )
    : state.server;

  if (state.inTiebreak) {
    const tiebreakPoints = {
      ...state.tiebreakPoints,
      [event.wonBy]: state.tiebreakPoints[event.wonBy] + 1,
    };
    const tbWinner = tiebreakWinner(tiebreakPoints, currentTiebreakTarget(state, rules));

    if (!tbWinner) {
      return {
        ...state,
        tiebreakPoints,
        pointHistory: [...state.pointHistory, { event, server }],
      };
    }

    const game: GameRecord = { server, winner: tbWinner, isTiebreak: true };
    const currentSetGames = [...state.currentSetGames, game];
    const gamesCount = countGames(currentSetGames);
    const setRecord: SetRecord = {
      games: currentSetGames,
      winner: tbWinner,
      gamesPlayer1: gamesCount.player1,
      gamesPlayer2: gamesCount.player2,
      tiebreak: tiebreakPoints,
    };
    const completedSets = [...state.completedSets, setRecord];
    const setsWon = { ...state.setsWon, [tbWinner]: state.setsWon[tbWinner] + 1 };
    const nextGameServer = otherPlayer(state.tiebreakInitialServer as PlayerId);
    const matchEnded = setsWon[tbWinner] >= rules.setsToWin;
    const nextSetIsDecider = !matchEnded && isDeciderSetStart(rules, completedSets.length);

    return {
      ...state,
      completedSets,
      currentSetGames: [],
      currentGamePoints: { player1: 0, player2: 0 },
      inTiebreak: nextSetIsDecider,
      tiebreakPoints: { player1: 0, player2: 0 },
      tiebreakInitialServer: nextSetIsDecider ? nextGameServer : null,
      server: nextGameServer,
      setsWon,
      matchEnded,
      winner: matchEnded ? tbWinner : null,
      pointHistory: [
        ...state.pointHistory,
        { event, server, gameWonBy: tbWinner, setWonBy: tbWinner, matchWonBy: matchEnded ? tbWinner : undefined },
      ],
    };
  }

  const currentGamePoints = {
    ...state.currentGamePoints,
    [event.wonBy]: state.currentGamePoints[event.wonBy] + 1,
  };
  const gWinner = gameWinner(currentGamePoints, config.noAd);

  if (!gWinner) {
    return {
      ...state,
      currentGamePoints,
      pointHistory: [...state.pointHistory, { event, server }],
    };
  }

  const game: GameRecord = { server, winner: gWinner, isTiebreak: false };
  const currentSetGames = [...state.currentSetGames, game];
  const gamesCount = countGames(currentSetGames);
  const nextGameServer = otherPlayer(state.server);

  if (gamesCount.player1 === rules.gamesPerSet && gamesCount.player2 === rules.gamesPerSet) {
    return {
      ...state,
      currentSetGames,
      currentGamePoints: { player1: 0, player2: 0 },
      inTiebreak: true,
      tiebreakInitialServer: nextGameServer,
      pointHistory: [...state.pointHistory, { event, server, gameWonBy: gWinner }],
    };
  }

  const stWinner = setWinner(gamesCount, rules.gamesPerSet);

  if (!stWinner) {
    return {
      ...state,
      currentSetGames,
      currentGamePoints: { player1: 0, player2: 0 },
      server: nextGameServer,
      pointHistory: [...state.pointHistory, { event, server, gameWonBy: gWinner }],
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
  const matchEnded = setsWon[stWinner] >= rules.setsToWin;
  const nextSetIsDecider = !matchEnded && isDeciderSetStart(rules, completedSets.length);

  return {
    ...state,
    completedSets,
    currentSetGames: [],
    currentGamePoints: { player1: 0, player2: 0 },
    inTiebreak: nextSetIsDecider,
    tiebreakInitialServer: nextSetIsDecider ? nextGameServer : null,
    server: nextGameServer,
    setsWon,
    matchEnded,
    winner: matchEnded ? stWinner : null,
    pointHistory: [
      ...state.pointHistory,
      { event, server, gameWonBy: gWinner, setWonBy: stWinner, matchWonBy: matchEnded ? stWinner : undefined },
    ],
  };
}

/** Rebuilds `currentSetGames` to hold exactly `target` games won by `player`, padding with
 * synthetic manually-adjusted records (server unknown → the adjustment's server) or trimming
 * the most recent ones. Never touches completed sets — "Ajuste manual" only edits the set in
 * progress, same as the steppers in its UI only show the current set's games. */
function resizeGamesFor(games: GameRecord[], player: PlayerId, target: number, fallbackServer: PlayerId): GameRecord[] {
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

/**
 * Contingencia "Ajuste manual del marcador" — a distinct event from PointEvent, not a sequence
 * of synthetic points. Sets the current set's games/points/server to absolute values the coach
 * chose, then re-runs the same set/tie-break/match completion checks a normal point triggers so
 * the adjustment can't leave the match in an impossible state (e.g. 7-2 games sitting uncounted
 * as "current set"). Doesn't touch pointHistory — statsEngine has no shot data for these games.
 */
function processAdjustment(state: MatchState, adj: ScoreAdjustment, config: MatchConfig): MatchState {
  if (state.matchEnded) return state;
  const rules = MATCH_FORMAT_RULES[config.format];

  let currentSetGames = resizeGamesFor(state.currentSetGames, 'player1', adj.gamesPlayer1, adj.server);
  currentSetGames = resizeGamesFor(currentSetGames, 'player2', adj.gamesPlayer2, adj.server);
  const gamesCount = countGames(currentSetGames);

  if (gamesCount.player1 === rules.gamesPerSet && gamesCount.player2 === rules.gamesPerSet) {
    return {
      ...state,
      currentSetGames,
      currentGamePoints: { player1: 0, player2: 0 },
      inTiebreak: true,
      tiebreakPoints: { player1: 0, player2: 0 },
      tiebreakInitialServer: adj.server,
    };
  }

  const stWinner = setWinner(gamesCount, rules.gamesPerSet);
  if (stWinner) {
    const setRecord: SetRecord = {
      games: currentSetGames,
      winner: stWinner,
      gamesPlayer1: gamesCount.player1,
      gamesPlayer2: gamesCount.player2,
    };
    const completedSets = [...state.completedSets, setRecord];
    const setsWon = { ...state.setsWon, [stWinner]: state.setsWon[stWinner] + 1 };
    const matchEnded = setsWon[stWinner] >= rules.setsToWin;
    const nextSetIsDecider = !matchEnded && isDeciderSetStart(rules, completedSets.length);
    return {
      ...state,
      completedSets,
      currentSetGames: [],
      currentGamePoints: { player1: 0, player2: 0 },
      inTiebreak: nextSetIsDecider,
      tiebreakInitialServer: nextSetIsDecider ? adj.server : null,
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

export function computeMatchState(
  events: PointEvent[],
  config: MatchConfig,
  adjustments: ScoreAdjustment[] = []
): MatchState {
  type LogItem =
    | { kind: 'point'; ts: number; event: PointEvent }
    | { kind: 'adjustment'; ts: number; adjustment: ScoreAdjustment };

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

export function getAllGames(state: MatchState): GameRecord[] {
  return [...state.completedSets.flatMap((s) => s.games), ...state.currentSetGames];
}

/** Who serves the next point right now — accounts for the mid-tiebreak rotation, unlike
 * `state.server`, which only tracks the server of the current/next regular game. */
export function getCurrentServer(state: MatchState): PlayerId {
  if (!state.inTiebreak) return state.server;
  const pointIndex = state.tiebreakPoints.player1 + state.tiebreakPoints.player2;
  return tiebreakServerForPoint(pointIndex, state.tiebreakInitialServer as PlayerId);
}

export interface GamePointLabels {
  player1: string;
  player2: string;
}

/** Formats the current game score (0/15/30/40, deuce, advantage) for display. */
export function getGamePointLabels(points: { player1: number; player2: number }, noAd: boolean): GamePointLabels {
  const labels = ['0', '15', '30', '40'];
  const { player1: a, player2: b } = points;

  if (a < 3 || b < 3) {
    return { player1: labels[Math.min(a, 3)], player2: labels[Math.min(b, 3)] };
  }

  if (a === b) return { player1: '40', player2: '40' };

  if (noAd) {
    // sudden death: shouldn't linger in this state, but fall back to raw 40/40 display
    return { player1: '40', player2: '40' };
  }

  if (a > b) return { player1: 'AD', player2: '40' };
  return { player1: '40', player2: 'AD' };
}

/** Texto compacto del marcador en un instante dado — mismo criterio que ScoreHeader (sets
 * completados, set en curso, punto/tie-break actual) pero en una sola línea, para etiquetar cada
 * nota de voz con el momento del partido en que se grabó. */
export function getScoreLabel(state: MatchState, config: MatchConfig): string {
  if (state.matchEnded) return `Set ${state.completedSets.length}`;

  const setNumber = state.completedSets.length + 1;
  const gamesCount = countGames(state.currentSetGames);
  const setLabel = `Set ${setNumber} · ${gamesCount.player1}-${gamesCount.player2}`;

  if (state.inTiebreak) {
    return `${setLabel} · TB ${state.tiebreakPoints.player1}-${state.tiebreakPoints.player2}`;
  }

  const gameLabels = getGamePointLabels(state.currentGamePoints, config.noAd);
  if (gameLabels.player1 === '0' && gameLabels.player2 === '0') return setLabel;
  return `${setLabel} · ${gameLabels.player1}-${gameLabels.player2}`;
}

/** set/juego/tiebreak actuales, para congelarlos en una nota de voz en el instante en que se
 * graba (VoiceNoteRecorder) — mismo criterio de "congelado, no recalculado después" que
 * getScoreLabel. Espeja PointSnapshot.setIndex/gameIndexInSet/isTiebreak del servidor
 * (server/src/lib/matchStatsEngine.ts), sin la parte de isBreakPointAgainstServer que ese usa
 * para las stats — acá solo hace falta ubicar el juego, no re-derivar presión. */
export function getSetGameIndex(state: MatchState): { setIndex: number; gameIndex: number; isTiebreak: boolean } {
  return {
    setIndex: state.completedSets.length,
    gameIndex: state.currentSetGames.length,
    isTiebreak: state.inTiebreak,
  };
}

export type PressureLevel = 'alta' | 'media' | 'baja';

/** (leader, trailer) game-point pairs the coach reads as a clear cushion: 40-0, 40-15, 30-0 and their mirrors. */
const CLEAR_LEAD_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [3, 0],
  [0, 3],
  [3, 1],
  [1, 3],
  [2, 0],
  [0, 2],
];

/** Derived, never captured by the coach: tie-break, deuce/advantage or a break point read as 'alta';
 * a clear game-point cushion reads as 'baja'; everything else is 'media'. */
export function getPressureLevel(state: MatchState, config: MatchConfig): PressureLevel {
  if (state.inTiebreak) return 'alta';

  const { player1: a, player2: b } = state.currentGamePoints;
  if (a >= 3 && b >= 3) return 'alta';

  const returner = otherPlayer(state.server);
  const afterReturnerPoint = { ...state.currentGamePoints, [returner]: state.currentGamePoints[returner] + 1 };
  if (gameWinner(afterReturnerPoint, config.noAd) === returner) return 'alta';

  if (CLEAR_LEAD_PAIRS.some(([x, y]) => a === x && b === y)) return 'baja';

  return 'media';
}
