import type { ErrorZoneCounts, MatchReportStats } from './matchStatsEngine.js';

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
