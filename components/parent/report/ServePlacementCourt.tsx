import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Rect, Text as SvgText } from 'react-native-svg';
import { colors, radius, withOpacity } from '../../../lib/theme';
import { ErrorZoneCounts, ErrorZoneKey, ServeEfficiency, ServeZoneCounts } from '../../../lib/api';

/** Zona de saque (T/cuerpo/abierto) → rectángulo del viewBox de un solo cajón de saque (red a
 * línea de saque, no la cancha completa) — mismo criterio de "zona agrupada, no bote exacto" que
 * ErrorScatterCourt. T pegado al centro, Abierto pegado a la línea lateral, Cuerpo en el medio. */
const ZONE_RECT: Record<'T' | 'cuerpo' | 'abierto', { x: [number, number]; y: [number, number] }> = {
  T: { x: [110, 130], y: [20, 150] },
  cuerpo: { x: [70, 105], y: [20, 150] },
  abierto: { x: [15, 65], y: [20, 150] },
};

function jitter(seed: number, range: [number, number]): number {
  const t = Math.abs(Math.sin(seed * 12.9898)) % 1;
  return range[0] + t * (range[1] - range[0]);
}

interface Dot {
  cx: number;
  cy: number;
  isFirst: boolean;
}

function scatterZone(count: number, isFirst: boolean, seedBase: number, rect: { x: [number, number]; y: [number, number] }): Dot[] {
  return Array.from({ length: count }, (_, i) => ({
    cx: Math.round(jitter(seedBase + i * 3.1, rect.x)),
    cy: Math.round(jitter(seedBase + i * 7.7, rect.y)),
    isFirst,
  }));
}

const ERROR_ZONE_KEYS = Object.keys({
  red_derecha: 0,
  red_reves: 0,
  larga_derecha: 0,
  larga_reves: 0,
  ancha_derecha: 0,
  ancha_reves: 0,
} satisfies ErrorZoneCounts) as ErrorZoneKey[];

function returnErrorSummary(zones: ErrorZoneCounts): { total: number; text: string } {
  const total = ERROR_ZONE_KEYS.reduce((sum, key) => sum + zones[key], 0);
  const netTotal = zones.red_derecha + zones.red_reves;
  const largoTotal = zones.larga_derecha + zones.larga_reves;
  const anchoTotal = zones.ancha_derecha + zones.ancha_reves;
  const parts = [
    netTotal > 0 ? `${netTotal} en la red` : null,
    largoTotal > 0 ? `${largoTotal} larga${largoTotal === 1 ? '' : 's'}` : null,
    anchoTotal > 0 ? `${anchoTotal} ancha${anchoTotal === 1 ? '' : 's'}` : null,
  ].filter((p): p is string => p !== null);
  return { total, text: parts.join(', ') };
}

/** "Dónde cayó el saque de {playerName}", con 1er/2do saque diferenciados por relleno del punto,
 * más un resumen de las devoluciones erradas del otro jugador contra ese saque (si las hubo). Se
 * usa dos veces en ParentReportsScreen — una por jugador, colores/datos invertidos. */
export default function ServePlacementCourt({
  playerName,
  accentColor,
  serveZones,
  serveEfficiency,
  opponentReturnErrors,
  opponentLabel,
}: {
  playerName: string;
  accentColor: string;
  serveZones: ServeZoneCounts;
  serveEfficiency: ServeEfficiency;
  opponentReturnErrors: ErrorZoneCounts;
  opponentLabel: string;
}) {
  const totalServes = serveEfficiency.firstServeTotal + serveEfficiency.secondServeTotal;
  if (totalServes === 0) return null;

  const dots: Dot[] = (['T', 'cuerpo', 'abierto'] as const).flatMap((zone, i) => [
    ...scatterZone(serveZones[zone].first, true, i * 2 + 1, ZONE_RECT[zone]),
    ...scatterZone(serveZones[zone].second, false, i * 2 + 2, ZONE_RECT[zone]),
  ]);

  const returnErrors = returnErrorSummary(opponentReturnErrors);

  return (
    <>
      <Text style={styles.sectionLabel}>Dónde cayó el saque de {playerName}</Text>
      <Text style={styles.sectionHint}>Agrupado por zona — no es el bote exacto. Punto lleno = 1er saque, hueco = 2do.</Text>

      <View style={styles.card}>
        <Svg width="100%" height={170} viewBox="0 0 145 170">
          <Rect x={15} y={20} width={115} height={130} fill={withOpacity(accentColor, 0.05)} />
          <Rect x={15} y={20} width={115} height={130} fill="none" stroke={colors.border} strokeWidth={1.5} />
          <Line x1={72.5} y1={20} x2={72.5} y2={150} stroke={colors.border} strokeWidth={1.5} strokeDasharray="4,3" />
          <Line x1={107} y1={20} x2={107} y2={150} stroke={colors.border} strokeWidth={1} />
          <Line x1={5} y1={20} x2={140} y2={20} stroke={colors.courtBlueDeep} strokeWidth={3} />
          <SvgText x={120} y={14} textAnchor="middle" fontSize={9} fontWeight={700} fill={colors.textDim}>
            T
          </SvgText>
          <SvgText x={87} y={14} textAnchor="middle" fontSize={9} fontWeight={700} fill={colors.textDim}>
            CUERPO
          </SvgText>
          <SvgText x={40} y={14} textAnchor="middle" fontSize={9} fontWeight={700} fill={colors.textDim}>
            ABIERTO
          </SvgText>
          {dots.map((dot, i) =>
            dot.isFirst ? (
              <Circle key={i} cx={dot.cx} cy={dot.cy} r={4.5} fill={accentColor} opacity={0.85} />
            ) : (
              <Circle key={i} cx={dot.cx} cy={dot.cy} r={4.5} fill="none" stroke={accentColor} strokeWidth={1.8} opacity={0.85} />
            ),
          )}
        </Svg>

        <View style={styles.effRow}>
          <View style={styles.effCell}>
            <Text style={styles.effValue}>
              {serveEfficiency.firstServeWonPct === null ? '—' : `${serveEfficiency.firstServeWonPct}%`}
            </Text>
            <Text style={styles.effLabel}>ganados con 1er saque ({serveEfficiency.firstServeTotal})</Text>
          </View>
          <View style={styles.effCell}>
            <Text style={styles.effValue}>
              {serveEfficiency.secondServeWonPct === null ? '—' : `${serveEfficiency.secondServeWonPct}%`}
            </Text>
            <Text style={styles.effLabel}>ganados con 2do saque ({serveEfficiency.secondServeTotal})</Text>
          </View>
        </View>

        {returnErrors.total > 0 && (
          <View style={styles.returnErrorRow}>
            <Text style={styles.returnErrorText}>
              Devolución errada de {opponentLabel}: {returnErrors.total}
              {returnErrors.text ? ` (${returnErrors.text})` : ''}
            </Text>
          </View>
        )}
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
  effRow: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  effCell: {
    flex: 1,
  },
  effValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.lineWhite,
  },
  effLabel: {
    fontSize: 11,
    color: colors.textDim,
    marginTop: 2,
  },
  returnErrorRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  returnErrorText: {
    fontSize: 12,
    color: colors.textSoft,
  },
});
