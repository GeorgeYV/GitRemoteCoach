/** Espejo de lib/matchFormats.ts (frontend) — mismo contenido, sin dependencias de React. Fuente
 * de verdad de las reglas de cada formato de partido. La base de datos (matches.format, ver
 * decisión #37 en db/schema.sql) solo guarda el id; estas reglas nunca se persisten. */
export type MatchFormatId =
  | 'single_set'
  | 'best_of_3'
  | 'best_of_3_short'
  | 'match_tiebreak'
  | 'match_tiebreak_short'
  | 'super_tiebreak_only';

export interface MatchFormatRules {
  gamesPerSet: number;
  setsToWin: number;
  /** true si el set decisivo (ver deciderSetIndex) se juega como un solo match tiebreak, a
   * MATCH_TIEBREAK_TARGET puntos, en vez de un set normal a games. */
  deciderIsMatchTiebreak: boolean;
}

/** Puntos para ganar el match tiebreak que reemplaza al set decisivo (o el partido entero, en
 * 'super_tiebreak_only') — distinto del tie-break normal de set (7 puntos, hardcodeado en
 * matchStatsEngine.ts junto al resto de las reglas de un game/set regular). */
export const MATCH_TIEBREAK_TARGET = 10;

export const MATCH_FORMAT_LABELS: Record<MatchFormatId, string> = {
  single_set: '1 set',
  best_of_3: 'Mejor de 3',
  best_of_3_short: 'Mejor de 3 corto',
  match_tiebreak: 'Tercer set Match tiebreak',
  match_tiebreak_short: 'Corto Tercer set Match tiebreak',
  super_tiebreak_only: 'Super tie-break',
};

export const MATCH_FORMAT_RULES: Record<MatchFormatId, MatchFormatRules> = {
  single_set: { gamesPerSet: 6, setsToWin: 1, deciderIsMatchTiebreak: false },
  best_of_3: { gamesPerSet: 6, setsToWin: 2, deciderIsMatchTiebreak: false },
  best_of_3_short: { gamesPerSet: 4, setsToWin: 2, deciderIsMatchTiebreak: false },
  match_tiebreak: { gamesPerSet: 6, setsToWin: 2, deciderIsMatchTiebreak: true },
  match_tiebreak_short: { gamesPerSet: 4, setsToWin: 2, deciderIsMatchTiebreak: true },
  // Sin sets: el "set" decisivo (índice 0, ver deciderSetIndex) es el partido entero.
  super_tiebreak_only: { gamesPerSet: 6, setsToWin: 1, deciderIsMatchTiebreak: true },
};

export const MATCH_FORMAT_IDS = Object.keys(MATCH_FORMAT_LABELS) as MatchFormatId[];

/** Índice 0-based del set decisivo: el único set cuando setsToWin=1, o el 3er set (índice 2)
 * cuando setsToWin=2 — el 3er set solo se llega a jugar si los sets van 1-1, así que basta con
 * comparar contra completedSets.length al momento de arrancar un set nuevo. */
export function deciderSetIndex(rules: MatchFormatRules): number {
  return 2 * rules.setsToWin - 2;
}
