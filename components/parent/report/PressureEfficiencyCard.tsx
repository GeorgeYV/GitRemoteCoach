import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../../lib/theme';
import { PressureEfficiency, PressureServeBucket } from '../../../lib/api';

/** "Eficiencia bajo presión": 1er saque adentro en situación normal vs. break point en contra —
 * ambos buckets salen ya calculados del servidor (matchStatsEngine#computeMatchReportStats). Si
 * un bucket no tuvo ningún intento (partido sin situaciones de esa presión), se muestra un
 * estado vacío honesto en vez de una barra en 0%. */
export default function PressureEfficiencyCard({ pressureEfficiency }: { pressureEfficiency: PressureEfficiency }) {
  const { normal, breakPoint } = pressureEfficiency;
  if (normal.attempts === 0 && breakPoint.attempts === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Eficiencia bajo presión</Text>
      <Text style={styles.subtitle}>1er saque adentro, según la presión del punto</Text>

      <PressureRow label="Situación normal" bucket={normal} color={colors.courtBlue} />
      <PressureRow label="Break point en contra" bucket={breakPoint} color={colors.amber} last />
    </View>
  );
}

function PressureRow({
  label,
  bucket,
  color,
  last,
}: {
  label: string;
  bucket: PressureServeBucket;
  color: string;
  last?: boolean;
}) {
  return (
    <View style={last ? undefined : styles.rowSpacing}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowLabel}>{label}</Text>
        {bucket.attempts === 0 ? (
          <Text style={styles.noData}>Sin datos suficientes</Text>
        ) : (
          <Text style={[styles.rowValue, { color }]}>
            {bucket.pct}% <Text style={styles.rowFraction}>· {bucket.firstServeIn}/{bucket.attempts}</Text>
          </Text>
        )}
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${bucket.pct ?? 0}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.lineWhite,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 11,
    color: colors.textDim,
    marginBottom: 14,
  },
  rowSpacing: {
    marginBottom: 12,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  rowLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSoft,
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  rowFraction: {
    fontWeight: '500',
    color: colors.textDim,
  },
  noData: {
    fontSize: 12,
    fontStyle: 'italic',
    color: colors.textDim,
  },
  track: {
    height: 10,
    backgroundColor: colors.borderSoft,
    borderRadius: 5,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 5,
  },
});
