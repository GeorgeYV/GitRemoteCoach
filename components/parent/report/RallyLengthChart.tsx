import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../../lib/theme';
import { RallyErrorBucket } from '../../../lib/api';

const LABELS: Record<RallyErrorBucket['rallyLength'], { title: string; sub: string }> = {
  corto: { title: 'Corto', sub: '1-4 golpes' },
  medio: { title: 'Medio', sub: '5-8 golpes' },
  largo: { title: 'Largo', sub: '9+ golpes' },
};

function colorForPct(winPct: number | null): string {
  if (winPct === null) return colors.textDim;
  if (winPct >= 60) return colors.ballLimeDim;
  if (winPct >= 40) return colors.amber;
  return colors.errorCoral;
}

/** Tasa de puntos ganados según cuántos golpes duró el intercambio — si gana la mayoría de los
 * largos pero pierde los cortos, el problema no es el físico sino el saque/resto/primera bola.
 * Buckets ya vienen calculados del servidor (matchStatsEngine#computeMatchReportStats); solo se
 * listan los que tuvieron al menos un punto jugado. */
export default function RallyLengthChart({ buckets }: { buckets: RallyErrorBucket[] }) {
  if (buckets.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Puntos ganados por duración del intercambio</Text>
      <Text style={styles.subtitle}>Corto vs. largo — ayuda a distinguir un problema de saque/resto de uno físico</Text>

      {buckets.map((bucket, i) => {
        const { title, sub } = LABELS[bucket.rallyLength];
        const color = colorForPct(bucket.winPct);
        return (
          <View key={bucket.rallyLength} style={i === buckets.length - 1 ? undefined : styles.rowSpacing}>
            <View style={styles.rowHeader}>
              <Text style={styles.rowLabel}>
                {title} <Text style={styles.rowLabelSub}>({sub})</Text>
              </Text>
              <Text style={[styles.rowValue, { color }]}>
                {bucket.winPct === null ? '—' : `${bucket.winPct}%`}{' '}
                <Text style={styles.rowFraction}>
                  · {bucket.pointsWon}/{bucket.pointsPlayed}
                </Text>
              </Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${bucket.winPct ?? 0}%`, backgroundColor: color }]} />
            </View>
            {bucket.unforcedErrors > 0 && (
              <Text style={styles.errorNote}>
                {bucket.unforcedErrors} error{bucket.unforcedErrors === 1 ? '' : 'es'} no forzado
                {bucket.unforcedErrors === 1 ? '' : 's'} en este tramo
              </Text>
            )}
          </View>
        );
      })}
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
    marginBottom: 26,
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
    lineHeight: 15,
  },
  rowSpacing: {
    marginBottom: 14,
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
  rowLabelSub: {
    fontWeight: '400',
    color: colors.textDim,
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  rowFraction: {
    fontWeight: '500',
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
  errorNote: {
    fontSize: 11,
    color: colors.textDim,
    marginTop: 4,
  },
});
