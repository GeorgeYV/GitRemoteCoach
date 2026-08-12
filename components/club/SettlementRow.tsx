import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../../lib/theme';
import { ClubSettlementWithTournamentName } from '../../lib/api';
import SettlementStatusPill from './SettlementStatusPill';

function money(amount: string): string {
  return `$${Number(amount).toFixed(2)}`;
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function SettlementRow({ settlement }: { settlement: ClubSettlementWithTournamentName }) {
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.info}>
          <Text style={styles.tournamentName}>{settlement.tournamentName}</Text>
          <Text style={styles.period}>
            {dateLabel(settlement.periodStart)} – {dateLabel(settlement.periodEnd)}
          </Text>
        </View>
        <SettlementStatusPill status={settlement.status} />
      </View>
      <Text style={styles.amount}>{money(settlement.totalCommissionAmount)}</Text>
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
    marginBottom: 10,
  },
  info: {
    flex: 1,
    marginRight: 10,
  },
  tournamentName: {
    color: colors.lineWhite,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  period: {
    color: colors.textDim,
    fontSize: 12,
  },
  amount: {
    color: colors.courtBlue,
    fontSize: 20,
    fontWeight: '800',
  },
});
