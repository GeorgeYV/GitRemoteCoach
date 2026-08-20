import type { ErrorZoneCounts, GamePointSummary, MatchReportStats } from './matchStatsEngine.js';

/**
 * Genera las oraciones en español del reporte enriquecido (semáforo, diagnóstico táctico) a
 * partir de las estadísticas ya calculadas por matchStatsEngine.ts — puro texto, sin volver a
 * tocar puntos crudos. Separado a propósito del motor numérico (mismo criterio que ya separa
 * lib/ de services/ en el resto del server). Todo acá es basado en reglas/plantillas, nunca un
 * modelo de lenguaje — decisión de producto explícita.
 */

const MIN_PRESSURE_SERVE_ATTEMPTS = 3;
const MIN_UNFORCED_ERRORS_FOR_SET_ALERT = 3;
const MIN_RALLY_POINTS_FOR_DIAGNOSIS = 5;

export type SemaforoTone = 'green' | 'amber' | 'red';

export interface SemaforoItem {
  tone: SemaforoTone;
  label: string;
  text: string;
}

function pct(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
}

interface RateCandidate {
  key: string;
  pct: number;
  text: string;
}

/** Set con más errores no forzados, citado solo si concentra al menos la mitad de los errores
 * del partido y hay una muestra mínima — de lo contrario "1 de 2 errores en el set X" sonaría a
 * alerta sin serlo. */
function buildSetConcentrationAlert(stats: MatchReportStats): string | null {
  if (stats.totalUnforcedErrors < MIN_UNFORCED_ERRORS_FOR_SET_ALERT || stats.sets.length === 0) return null;
  const worstSet = stats.sets.reduce((max, s) => (s.unforcedErrors > max.unforcedErrors ? s : max), stats.sets[0]);
  if (worstSet.unforcedErrors * 2 < stats.totalUnforcedErrors) return null;
  const outcome = worstSet.won ? 'que ganó' : 'que perdió';
  return `${worstSet.unforcedErrors} de sus ${stats.totalUnforcedErrors} errores no forzados pasaron en el ${worstSet.setIndex + 1}º set (${worstSet.score}) — el ${outcome}.`;
}

/** Alerta de respaldo cuando no hay una concentración de errores por set que citar: un desplome
 * real del primer saque específicamente bajo presión de quiebre. */
function buildPressureAlert(stats: MatchReportStats): string | null {
  const { breakPoint } = stats.pressureEfficiency;
  if (breakPoint.pct === null || breakPoint.attempts < 2 || breakPoint.pct >= 50) return null;
  return `Primer saque bajo presión de quiebre: solo ${breakPoint.pct}% adentro (${breakPoint.firstServeIn}/${breakPoint.attempts}).`;
}

/** Tres bloques: fortaleza (el % más alto entre las métricas con muestra suficiente), zona de
 * cuidado (el % más bajo de ese mismo grupo), y alerta crítica (concentración de errores en un
 * set, o si no hay una, un desplome de saque bajo presión). Cualquiera de los tres puede faltar
 * si los datos no alcanzan — mejor un semáforo corto que uno que invente certeza. */
export function buildSemaforo(stats: MatchReportStats): SemaforoItem[] {
  const items: SemaforoItem[] = [];

  const candidates: RateCandidate[] = [];
  if (
    stats.pressureEfficiency.normal.pct !== null &&
    stats.pressureEfficiency.normal.attempts >= MIN_PRESSURE_SERVE_ATTEMPTS
  ) {
    candidates.push({
      key: 'normalServe',
      pct: stats.pressureEfficiency.normal.pct,
      text: `Primer saque cuando no hay presión de quiebre: ${stats.pressureEfficiency.normal.pct}% adentro (${stats.pressureEfficiency.normal.firstServeIn}/${stats.pressureEfficiency.normal.attempts}).`,
    });
  }
  if (stats.player1.firstServePct !== null) {
    candidates.push({
      key: 'overallServe',
      pct: stats.player1.firstServePct,
      text: `Primer saque general: ${stats.player1.firstServePct}% adentro.`,
    });
  }
  if (stats.player1.returnGamesPlayed > 0) {
    const breakPct = pct(stats.player1.breaksConverted, stats.player1.returnGamesPlayed);
    if (breakPct !== null) {
      candidates.push({
        key: 'breakConversion',
        pct: breakPct,
        text: `Quiebres convertidos: ${stats.player1.breaksConverted} de ${stats.player1.returnGamesPlayed}.`,
      });
    }
  }

  if (candidates.length > 0) {
    const sorted = [...candidates].sort((a, b) => b.pct - a.pct);
    const best = sorted[0];
    items.push({ tone: 'green', label: 'Fortaleza', text: best.text });
    const worst = sorted[sorted.length - 1];
    if (worst.key !== best.key) {
      items.push({ tone: 'amber', label: 'Zona de cuidado', text: worst.text });
    }
  }

  const redText = buildSetConcentrationAlert(stats) ?? buildPressureAlert(stats);
  if (redText) items.push({ tone: 'red', label: 'Alerta crítica', text: redText });

  return items;
}

function dominantErrorSide(zones: ErrorZoneCounts): 'derecha' | 'revés' | null {
  const derecha = zones.red_derecha + zones.larga_derecha + zones.ancha_derecha;
  const reves = zones.red_reves + zones.larga_reves + zones.ancha_reves;
  if (derecha === reves) return null;
  return derecha > reves ? 'derecha' : 'revés';
}

/** null cuando la muestra de rallies largos es demasiado chica para sostener una afirmación —
 * ver decisión de producto: mejor "sin datos suficientes" que un % que suene más seguro de lo
 * que es. */
export function buildTacticalDiagnosis(stats: MatchReportStats): string | null {
  const largo = stats.rallyErrorBuckets.find((b) => b.rallyLength === 'largo');
  if (!largo || largo.pointsPlayed < MIN_RALLY_POINTS_FOR_DIAGNOSIS) return null;

  const lossPct = pct(largo.pointsLost, largo.pointsPlayed);
  if (lossPct === null) return null;

  const dominantSide = dominantErrorSide(stats.errorZones);
  const sideClause = dominantSide ? ` — la mayoría de esos errores son de ${dominantSide}` : '';

  return `Pierde el ${lossPct}% de los puntos (${largo.pointsLost}/${largo.pointsPlayed}) cuando el intercambio se estira a 9 golpes o más${sideClause}.`;
}

function countPhrase(n: number, singularPhrase: string, pluralNoun: string): string {
  return n === 1 ? singularPhrase : `${n} ${pluralNoun}`;
}

function joinSpanish(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

/** Qué hizo player1 en el juego, contado sobre los mismos detail/errorDirection que ya captura
 * la app en vivo — nada nuevo, solo un recorte por juego de lo que matchStatsEngine ya suma para
 * todo el partido (winners, errores no forzados, dobles faltas cargadas a su propio saque). */
function countGameHighlights(points: GamePointSummary[]) {
  const counts = {
    ace: 0,
    winnerDerecha: 0,
    winnerReves: 0,
    winnerVolea: 0,
    dobleFalta: 0,
    errorDerecha: 0,
    errorReves: 0,
    errorPlain: 0,
  };
  for (const p of points) {
    if (p.wonBy === 'player1') {
      if (p.detail === 'ace') counts.ace += 1;
      else if (p.detail === 'winner_derecha') counts.winnerDerecha += 1;
      else if (p.detail === 'winner_reves') counts.winnerReves += 1;
      else if (p.detail === 'winner_volea') counts.winnerVolea += 1;
    } else {
      if (p.detail === 'doble_falta' && p.server === 'player1') counts.dobleFalta += 1;
      else if (p.detail === 'error_no_forzado_derecha') counts.errorDerecha += 1;
      else if (p.detail === 'error_no_forzado_reves') counts.errorReves += 1;
      else if (p.detail === 'error_no_forzado') counts.errorPlain += 1;
    }
  }
  return counts;
}

function buildHighlightPhrases(counts: ReturnType<typeof countGameHighlights>): string[] {
  const parts: string[] = [];
  if (counts.ace > 0) parts.push(countPhrase(counts.ace, 'un ace', 'aces'));
  if (counts.winnerDerecha > 0) parts.push(countPhrase(counts.winnerDerecha, 'un winner de derecha', 'winners de derecha'));
  if (counts.winnerReves > 0) parts.push(countPhrase(counts.winnerReves, 'un winner de revés', 'winners de revés'));
  if (counts.winnerVolea > 0) {
    parts.push(`${countPhrase(counts.winnerVolea, 'una volea ganadora', 'voleas ganadoras')} en la red`);
  }
  if (counts.dobleFalta > 0) parts.push(countPhrase(counts.dobleFalta, 'una doble falta', 'dobles faltas'));
  if (counts.errorDerecha > 0) {
    parts.push(countPhrase(counts.errorDerecha, 'un error no forzado de derecha', 'errores no forzados de derecha'));
  }
  if (counts.errorReves > 0) {
    parts.push(countPhrase(counts.errorReves, 'un error no forzado de revés', 'errores no forzados de revés'));
  }
  if (counts.errorPlain > 0) parts.push(countPhrase(counts.errorPlain, 'un error no forzado', 'errores no forzados'));
  return parts;
}

/** "Gana su saque"/"Rompe el saque rival"/etc, según quién sacó ese juego y quién lo ganó — el
 * "a cero" sale de contar los puntos crudos del juego, no del marcador de games/sets (no hace
 * falta: alcanza con que el rival no haya ganado ningún punto dentro de este juego puntual). */
function buildOutcomePhrase(points: GamePointSummary[]): string {
  const server = points[0].server;
  const winner = points[points.length - 1].wonBy;
  const opponentPoints = points.filter((p) => p.wonBy !== winner).length;

  if (server === 'player1') {
    if (winner === 'player1') return opponentPoints === 0 ? 'Cierra el juego a cero' : 'Gana su saque';
    return 'Pierde el juego';
  }
  return winner === 'player1' ? 'Rompe el saque rival' : 'Pierde el juego de resto';
}

/** "Dato duro" de una nota de voz: qué pasó de verdad en el juego que la nota etiqueta (ver
 * matchStatsEngine#computeGamePointHistory) — null solo si ese juego no tiene puntos capturados
 * (nota huérfana de un juego que después se borró/ajustó), nunca por falta de eventos destacados:
 * un juego sin winners/errores igual devuelve la frase del resultado sola ("Gana su saque."). */
export function buildDatoDuro(gamePoints: GamePointSummary[]): string | null {
  if (gamePoints.length === 0) return null;

  const outcome = buildOutcomePhrase(gamePoints);
  const highlights = buildHighlightPhrases(countGameHighlights(gamePoints));
  if (highlights.length === 0) return `${outcome}.`;
  return `${outcome} con ${joinSpanish(highlights)}.`;
}
