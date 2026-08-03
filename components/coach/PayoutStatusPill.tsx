import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, withOpacity } from '../../lib/theme';
import { PayoutStatus } from '../../mock/coachFlow';

const LABELS: Record<PayoutStatus, string> = {
  pendiente: 'Pendiente',
  liberado: 'Liberado',
};

export default function PayoutStatusPill({ status }: { status: PayoutStatus }) {
  const released = status === 'liberado';
  return (
    <View style={[styles.pill, released ? styles.pillReleased : styles.pillPending]}>
      <Text style={[styles.label, released ? styles.labelReleased : styles.labelPending]}>{LABELS[status]}</Text>
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
  pillReleased: {
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
  labelReleased: {
    color: colors.ballLime,
  },
  labelPending: {
    color: colors.textDim,
  },
});
