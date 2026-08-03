import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import EarningsRow from '../../components/coach/EarningsRow';
import { colors, radius } from '../../lib/theme';
import { mockEarningsHistory, PLATFORM_COMMISSION_RATE } from '../../mock/coachFlow';

function money(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export default function CoachEarningsScreen() {
  const entries = mockEarningsHistory;

  const netFor = (rate: number) => rate * (1 - PLATFORM_COMMISSION_RATE);

  const released = entries.filter((e) => e.payoutStatus === 'liberado');
  const pending = entries.filter((e) => e.payoutStatus === 'pendiente');

  const releasedTotal = released.reduce((sum, e) => sum + netFor(e.agreedRate), 0);
  const pendingTotal = pending.reduce((sum, e) => sum + netFor(e.agreedRate), 0);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Ingresos</Text>
        <Text style={styles.headerSubtitle}>{entries.length} partidos acompañados</Text>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryTile}>
          <Text style={styles.summaryValue}>{money(releasedTotal)}</Text>
          <Text style={styles.summaryLabel}>Ingresos totales</Text>
        </View>
        <View style={styles.summaryTile}>
          <Text style={[styles.summaryValue, styles.summaryValueDim]}>{money(pendingTotal)}</Text>
          <Text style={styles.summaryLabel}>Pendiente por liberar</Text>
        </View>
      </View>

      <Text style={styles.listLabel}>Historial de partidos</Text>

      <ScrollView contentContainerStyle={styles.list}>
        {entries.map((entry) => (
          <EarningsRow key={entry.id} entry={entry} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    color: colors.lineWhite,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  headerSubtitle: {
    color: colors.textDim,
    fontSize: 13,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  summaryTile: {
    flex: 1,
    backgroundColor: colors.panelLight,
    borderRadius: radius,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryValue: {
    color: colors.ballLime,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  summaryValueDim: {
    color: colors.textSoft,
  },
  summaryLabel: {
    color: colors.textDim,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 12,
  },
});
