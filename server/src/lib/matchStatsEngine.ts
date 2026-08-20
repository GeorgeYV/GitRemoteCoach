import type { ErrorDirection, MatchPlayerSlot, PointDetail, RallyLength } from '../types.js';
import {
  MATCH_FORMAT_RULES,
  MATCH_TIEBREAK_TARGET,
  deciderSetIndex,
  type MatchFormatId,
  type MatchFormatRules,
} from './matchFormats.js';

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
  errorDirection: ErrorDirection | null;
  rallyLength: RallyLength | null;
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
  format: MatchFormatId;
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
  /** Índice del set (0-based) donde ocurrió este punto — completedSets.length en el momento de
   * jugarlo, antes de que este punto pudiera cerrar el set. */
  setIndex: number;
  /** Índice del game dentro del set (0-based), o del tiebreak si isTiebreak — currentSetGames.length
   * en el momento de jugarlo. */
  gameIndexInSet: number;
  isTiebreak: boolean;
  /** true si, de ganar este punto el resto (no quien sacaba), el server perdería su game — no
   * aplica dentro de un tiebreak (ahí no hay "quiebre" en el sentido tradicional). */
  isBreakPointAgainstServer: boolean;
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

/** true si el set en el índice completedSetsCount es el set decisivo de este formato Y ese
 * formato lo juega como un match tiebreak en vez de un set normal a games — ver
 * lib/matchFormats.ts (espejado) para la explicación completa. */
function isDeciderSetStart(rules: MatchFormatRules, completedSetsCount: number): boolean {
  return rules.deciderIsMatchTiebreak && completedSetsCount === deciderSetIndex(rules);
}

function currentTiebreakTarget(state: MatchState, rules: MatchFormatRules): number {
  return isDeciderSetStart(rules, state.completedSets.length) ? MATCH_TIEBREAK_TARGET : 7;
}

function createInitialMatchState(config: StatsMatchConfig): MatchState {
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

/** Mismo criterio que lib/scoringEngine.ts#getPressureLevel del cliente (su rama "afterReturnerPoint"),
 * pero re-aplicable a cualquier punto histórico, no solo al punto que se está por jugar en vivo:
 * ¿ganaría el resto (returner) el game si ganara este punto? */
function isBreakPoint(currentGamePoints: { player1: number; player2: number }, server: MatchPlayerSlot, noAd: boolean): boolean {
  const returner = otherPlayer(server);
  const hypothetical = { ...currentGamePoints, [returner]: currentGamePoints[returner] + 1 };
  return gameWinner(hypothetical, noAd) === returner;
}

function tiebreakWinner(points: { player1: number; player2: number }, target: number): MatchPlayerSlot | null {
  const { player1: a, player2: b } = points;
  if (a >= target && a - b >= 2) return 'player1';
  if (b >= target && b - a >= 2) return 'player2';
  return null;
}

function setWinner(games: { player1: number; player2: number }, gamesPerSet: number): MatchPlayerSlot | null {
  const { player1: a, player2: b } = games;
  if (a >= gamesPerSet && a - b >= 2) return 'player1';
  if (b >= gamesPerSet && b - a >= 2) return 'player2';
  return null;
}

function processPoint(state: MatchState, event: StatsPointEvent, config: StatsMatchConfig): MatchState {
  if (state.matchEnded) return state;
  const rules = MATCH_FORMAT_RULES[config.format];

  const server: MatchPlayerSlot = state.inTiebreak
    ? tiebreakServerForPoint(
        state.tiebreakPoints.player1 + state.tiebreakPoints.player2,
        state.tiebreakInitialServer as MatchPlayerSlot,
      )
    : state.server;

  // Etiquetas de este punto, calculadas una sola vez contra el estado *previo* a jugarlo (antes
  // de que pueda cerrar un game/set) — se reusan en cada rama de abajo en vez de recalcularlas.
  const setIndex = state.completedSets.length;
  const gameIndexInSet = state.currentSetGames.length;
  const isTiebreak = state.inTiebreak;
  const isBreakPointAgainstServer = !isTiebreak && isBreakPoint(state.currentGamePoints, server, config.noAd);
  const pointTag = { setIndex, gameIndexInSet, isTiebreak, isBreakPointAgainstServer };

  if (state.inTiebreak) {
    const tiebreakPoints = {
      ...state.tiebreakPoints,
      [event.wonBy]: state.tiebreakPoints[event.wonBy] + 1,
    };
    const tbWinner = tiebreakWinner(tiebreakPoints, currentTiebreakTarget(state, rules));

    if (!tbWinner) {
      return { ...state, tiebreakPoints, pointHistory: [...state.pointHistory, { event, server, ...pointTag }] };
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
      pointHistory: [...state.pointHistory, { event, server, ...pointTag }],
    };
  }

  const currentGamePoints = {
    ...state.currentGamePoints,
    [event.wonBy]: state.currentGamePoints[event.wonBy] + 1,
  };
  const gWinner = gameWinner(currentGamePoints, config.noAd);

  if (!gWinner) {
    return { ...state, currentGamePoints, pointHistory: [...state.pointHistory, { event, server, ...pointTag }] };
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
      pointHistory: [...state.pointHistory, { event, server, ...pointTag }],
    };
  }

  const stWinner = setWinner(gamesCount, rules.gamesPerSet);

  if (!stWinner) {
    return {
      ...state,
      currentSetGames,
      currentGamePoints: { player1: 0, player2: 0 },
      server: nextGameServer,
      pointHistory: [...state.pointHistory, { event, server, ...pointTag }],
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
    pointHistory: [...state.pointHistory, { event, server, ...pointTag }],
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

function statsFromState(state: MatchState): PlayerMatchStats {
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

/** Reconstruye el partido a partir de sus puntos crudos + ajustes manuales y devuelve las stats
 * del jugador seguido por el coach (player1 — player2 es el rival, un texto libre sin cuenta propia). */
export function computePlayer1MatchStats(
  events: StatsPointEvent[],
  config: StatsMatchConfig,
  adjustments: StatsScoreAdjustment[] = [],
): PlayerMatchStats {
  return statsFromState(computeMatchState(events, config, adjustments));
}

/** Seis zonas de error: dirección de la falla (red/larga/ancha) × lado del golpe (derecha/revés).
 * error_no_forzado (sin lado capturado) no entra acá a propósito — no hay que inventarle un lado. */
export type ErrorZoneKey =
  | 'red_derecha'
  | 'red_reves'
  | 'larga_derecha'
  | 'larga_reves'
  | 'ancha_derecha'
  | 'ancha_reves';
export type ErrorZoneCounts = Record<ErrorZoneKey, number>;

export interface PressureServeBucket {
  attempts: number;
  firstServeIn: number;
  pct: number | null;
}

export interface PressureEfficiency {
  normal: PressureServeBucket;
  breakPoint: PressureServeBucket;
}

export interface RallyErrorBucket {
  rallyLength: RallyLength;
  pointsPlayed: number;
  pointsLost: number;
  unforcedErrors: number;
}

export interface SetOutcome {
  setIndex: number;
  won: boolean;
  score: string;
  unforcedErrors: number;
}

export interface MatchReportStats {
  player1: PlayerMatchStats;
  pressureEfficiency: PressureEfficiency;
  errorZones: ErrorZoneCounts;
  rallyErrorBuckets: RallyErrorBucket[];
  sets: SetOutcome[];
  totalUnforcedErrors: number;
  winnerSlot: MatchPlayerSlot | null;
}

function emptyErrorZones(): ErrorZoneCounts {
  return { red_derecha: 0, red_reves: 0, larga_derecha: 0, larga_reves: 0, ancha_derecha: 0, ancha_reves: 0 };
}

function pct(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
}

/** Igual que computePlayer1MatchStats, pero para el reporte enriquecido del padre: agrega
 * eficiencia de saque bajo presión, zonas de error, cruce de errores por largo de rally, y
 * errores no forzados por set — todo derivado de datos que ya se capturan hoy (nada nuevo del
 * lado de la captura en vivo), reconstruyendo el partido una sola vez. */
export function computeMatchReportStats(
  events: StatsPointEvent[],
  config: StatsMatchConfig,
  adjustments: StatsScoreAdjustment[] = [],
): MatchReportStats {
  const state = computeMatchState(events, config, adjustments);
  const player1 = statsFromState(state);

  const pressureEfficiency: PressureEfficiency = {
    normal: { attempts: 0, firstServeIn: 0, pct: null },
    breakPoint: { attempts: 0, firstServeIn: 0, pct: null },
  };
  const errorZones = emptyErrorZones();
  const rallyTotals: Record<RallyLength, { pointsPlayed: number; pointsLost: number; unforcedErrors: number }> = {
    corto: { pointsPlayed: 0, pointsLost: 0, unforcedErrors: 0 },
    medio: { pointsPlayed: 0, pointsLost: 0, unforcedErrors: 0 },
    largo: { pointsPlayed: 0, pointsLost: 0, unforcedErrors: 0 },
  };
  const unforcedErrorsBySet: number[] = [];
  let totalUnforcedErrors = 0;

  for (const point of state.pointHistory) {
    const { event, server, setIndex, isBreakPointAgainstServer } = point;

    // Eficiencia bajo presión: solo tiene sentido para los puntos donde player1 saca — el saque
    // del rival no se captura con el mismo detalle (ver PointFlow#ServeStep, firstServeIn queda
    // en un valor de relleno cuando sirve player2).
    if (server === 'player1' && event.detail !== 'dato_no_capturado') {
      const bucket = isBreakPointAgainstServer ? pressureEfficiency.breakPoint : pressureEfficiency.normal;
      bucket.attempts += 1;
      if (event.firstServeIn) bucket.firstServeIn += 1;
    }

    const isUnforcedByPlayer1 =
      (event.detail === 'error_no_forzado' ||
        event.detail === 'error_no_forzado_derecha' ||
        event.detail === 'error_no_forzado_reves') &&
      otherPlayer(event.wonBy) === 'player1';

    if (isUnforcedByPlayer1) {
      totalUnforcedErrors += 1;
      unforcedErrorsBySet[setIndex] = (unforcedErrorsBySet[setIndex] ?? 0) + 1;
      if (event.errorDirection && event.detail !== 'error_no_forzado') {
        const side = event.detail === 'error_no_forzado_reves' ? 'reves' : 'derecha';
        errorZones[`${event.errorDirection}_${side}` as ErrorZoneKey] += 1;
      }
    }

    if (event.rallyLength) {
      const bucket = rallyTotals[event.rallyLength];
      bucket.pointsPlayed += 1;
      if (event.wonBy !== 'player1') bucket.pointsLost += 1;
      if (isUnforcedByPlayer1) bucket.unforcedErrors += 1;
    }
  }

  pressureEfficiency.normal.pct = pct(pressureEfficiency.normal.firstServeIn, pressureEfficiency.normal.attempts);
  pressureEfficiency.breakPoint.pct = pct(pressureEfficiency.breakPoint.firstServeIn, pressureEfficiency.breakPoint.attempts);

  const rallyErrorBuckets: RallyErrorBucket[] = (['corto', 'medio', 'largo'] as RallyLength[])
    .map((rallyLength) => ({ rallyLength, ...rallyTotals[rallyLength] }))
    .filter((b) => b.pointsPlayed > 0);

  const sets: SetOutcome[] = state.completedSets.map((set, setIndex) => ({
    setIndex,
    won: set.winner === 'player1',
    score: `${set.gamesPlayer1}-${set.gamesPlayer2}`,
    unforcedErrors: unforcedErrorsBySet[setIndex] ?? 0,
  }));

  return {
    player1,
    pressureEfficiency,
    errorZones,
    rallyErrorBuckets,
    sets,
    totalUnforcedErrors,
    winnerSlot: state.winner,
  };
}
