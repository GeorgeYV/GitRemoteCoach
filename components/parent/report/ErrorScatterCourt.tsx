import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Rect, Text as SvgText } from 'react-native-svg';
import { colors, radius } from '../../../lib/theme';
import { ErrorZoneCounts, ErrorZoneKey } from '../../../lib/api';

/** Zona (lado × dirección de la falla) → rectángulo del viewBox donde se dispersan sus puntos.
 * Agrupado por zona, no la ubicación exacta del bote — la app no captura esa coordenada. Los
 * errores "red" (net) se ubican pegados a la red, "larga" más allá de la línea de fondo, y
 * "ancha" pasando la línea lateral — cada uno del lado (derecha/revés) que le corresponde. */
const ZONE_RECT: Record<ErrorZoneKey, { x: [number, number]; y: [number, number] }> = {
  red_reves: { x: [50, 115], y: [352, 371] },
  red_derecha: { x: [125, 190], y: [352, 371] },
  larga_reves: { x: [46, 116], y: [14, 38] },
  larga_derecha: { x: [124, 194], y: [14, 38] },
  ancha_reves: { x: [6, 40], y: [90, 300] },
  ancha_derecha: { x: [200, 234], y: [90, 300] },
};

/** Jitter determinista (mismo criterio que el mockup) — no hay coordenada real de bote, así que
 * cada punto se ubica en un lugar estable (no aleatorio en cada render) dentro de su zona. */
function jitter(seed: number, range: [number, number]): number {
  const t = Math.abs(Math.sin(seed * 12.9898)) % 1;
  return range[0] + t * (range[1] - range[0]);
}

interface Dot {
  cx: number;
  cy: number;
  opacity: number;
}

function scatterZone(count: number, seedBase: number, rect: { x: [number, number]; y: [number, number] }): Dot[] {
  return Array.from({ length: count }, (_, i) => ({
    cx: Math.round(jitter(seedBase + i * 3.1, rect.x)),
    cy: Math.round(jitter(seedBase + i * 7.7, rect.y)),
    opacity: 0.72 + (Math.abs(Math.sin((seedBase + i) * 5.3)) % 1) * 0.28,
  }));
}

/** "Dónde se dieron los errores": dispersión simbólica sobre una cancha, agrupada por lado y
 * tipo de falla. Solo cuenta los errores con zona conocida (error_no_forzado_derecha/reves +
 * error_direction) — un error_no_forzado plano, sin lado capturado, no entra acá. Si ningún
 * error tuvo zona conocida, no hay nada honesto que dibujar. */
export default function ErrorScatterCourt({ errorZones }: { errorZones: ErrorZoneCounts }) {
  const zoneKeys = Object.keys(ZONE_RECT) as ErrorZoneKey[];
  const total = zoneKeys.reduce((sum, key) => sum + errorZones[key], 0);
  if (total === 0) return null;

  const dots = zoneKeys.flatMap((key, i) => scatterZone(errorZones[key], i + 1, ZONE_RECT[key]));

  const netTotal = errorZones.red_derecha + errorZones.red_reves;
  const largoTotal = errorZones.larga_derecha + errorZones.larga_reves;
  const anchoTotal = errorZones.ancha_derecha + errorZones.ancha_reves;
  const legendParts = [
    netTotal > 0 ? `${netTotal} en la red` : null,
    largoTotal > 0 ? `${largoTotal} largo${largoTotal === 1 ? '' : 's'}` : null,
    anchoTotal > 0 ? `${anchoTotal} ancho${anchoTotal === 1 ? '' : 's'}` : null,
  ].filter((part): part is string => part !== null);

  return (
    <>
      <Text style={styles.sectionLabel}>Dónde se dieron los errores</Text>
      <Text style={styles.sectionHint}>Agrupado por lado y tipo de falla — no es la ubicación exacta del bote.</Text>

      <View style={styles.card}>
        <Svg width="100%" height={260} viewBox="0 0 240 380">
          <Rect x={20} y={40} width={200} height={320} fill="rgba(31,78,140,0.05)" />
          <Rect x={20} y={40} width={200} height={320} fill="none" stroke={colors.border} strokeWidth={1.5} />
          <Line x1={44} y1={40} x2={44} y2={360} stroke={colors.border} strokeWidth={1.5} />
          <Line x1={196} y1={40} x2={196} y2={360} stroke={colors.border} strokeWidth={1.5} />
          <Line x1={44} y1={190} x2={196} y2={190} stroke={colors.border} strokeWidth={1.5} />
          <Line x1={120} y1={190} x2={120} y2={360} stroke={colors.border} strokeWidth={1.5} />
          <Line x1={120} y1={40} x2={120} y2={48} stroke={colors.border} strokeWidth={1.5} />
          <Line x1={14} y1={360} x2={226} y2={360} stroke={colors.courtBlueDeep} strokeWidth={3} />
          <SvgText x={82} y={24} textAnchor="middle" fontSize={10} fontWeight={700} fill={colors.textDim}>
            REVÉS
          </SvgText>
          <SvgText x={158} y={24} textAnchor="middle" fontSize={10} fontWeight={700} fill={colors.textDim}>
            DERECHA
          </SvgText>
          {dots.map((dot, i) => (
            <Circle key={i} cx={dot.cx} cy={dot.cy} r={4.5} fill={colors.errorCoral} opacity={dot.opacity} />
          ))}
        </Svg>

        <View style={styles.legend}>
          <View style={styles.legendDot} />
          <Text style={styles.legendText}>
            Error no forzado ({total} en total{legendParts.length > 0 ? `: ${legendParts.join(', ')}` : ''})
          </Text>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textDim,
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 12,
    color: colors.textDim,
    lineHeight: 17,
    marginBottom: 12,
  },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    padding: 18,
    marginBottom: 26,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.errorCoral,
  },
  legendText: {
    fontSize: 12,
    color: colors.textSoft,
  },
});
