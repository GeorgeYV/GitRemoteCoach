import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, withOpacity } from '../../lib/theme';
import { ClubSettlement } from '../../lib/api';

const LABELS: Record<ClubSettlement['status'], string> = {
  pending: 'Pendiente',
  paid: 'Pagada',
};

export default function SettlementStatusPill({ status }: { status: ClubSettlement['status'] }) {
  const paid = status === 'paid';
  return (
    <View style={[styles.pill, paid ? styles.pillPaid : styles.pillPending]}>
      <Text style={[styles.label, paid ? styles.labelPaid : styles.labelPending]}>{LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 12,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  pillPaid: {
    backgroundColor: withOpacity(colors.ballLime, 0.14),
    borderColor: withOpacity(colors.ballLime, 0.4),
  },
  pillPending: {
    backgroundColor: colors.panelLight,
    borderColor: colors.border,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  labelPaid: {
    color: colors.ballLime,
  },
  labelPending: {
    color: colors.textDim,
  },
});
