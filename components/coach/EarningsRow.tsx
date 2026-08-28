import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../../lib/theme';
import { EarningsEntry, PLATFORM_COMMISSION_RATE } from '../../mock/coachFlow';
import PayoutStatusPill from './PayoutStatusPill';

function money(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export default function EarningsRow({ entry }: { entry: EarningsEntry }) {
  const net = entry.coachNetAmount ?? entry.agreedRate * (1 - PLATFORM_COMMISSION_RATE);
  const commission = entry.agreedRate - net;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.info}>
          <Text style={styles.playerName}>{entry.playerName}</Text>
          <Text style={styles.meta}>{entry.category}</Text>
          <Text style={styles.tournamentMeta}>
            {entry.tournamentName} · {entry.date}
          </Text>
        </View>
        <PayoutStatusPill status={entry.payoutStatus} />
      </View>

      <View style={styles.breakdown}>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>Tarifa acordada</Text>
          <Text style={styles.breakdownValue}>{money(entry.agreedRate)}</Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>
            {entry.coachNetAmount !== undefined ? 'Comisiones (plataforma y club/federación)' : 'Comisión de la plataforma (15%)'}
          </Text>
          <Text style={styles.breakdownValueNegative}>−{money(commission)}</Text>
        </View>
        <View style={[styles.breakdownRow, styles.breakdownRowTotal]}>
          <Text style={styles.breakdownLabelTotal}>Neto para ti</Text>
          <Text style={styles.breakdownValueTotal}>{money(net)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  info: {
    flex: 1,
    marginRight: 10,
  },
  playerName: {
    color: colors.lineWhite,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  meta: {
    color: colors.textSoft,
    fontSize: 12,
    marginBottom: 2,
  },
  tournamentMeta: {
    color: colors.textDim,
    fontSize: 11,
  },
  breakdown: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    paddingTop: 12,
    gap: 6,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  breakdownLabel: {
    color: colors.textDim,
    fontSize: 12,
  },
  breakdownValue: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '600',
  },
  breakdownValueNegative: {
    color: colors.errorCoral,
    fontSize: 12,
    fontWeight: '600',
  },
  breakdownRowTotal: {
    marginTop: 4,
  },
  breakdownLabelTotal: {
    color: colors.lineWhite,
    fontSize: 13,
    fontWeight: '700',
  },
  breakdownValueTotal: {
    color: colors.courtBlue,
    fontSize: 15,
    fontWeight: '800',
  },
});
