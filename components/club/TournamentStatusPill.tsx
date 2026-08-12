import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, withOpacity } from '../../lib/theme';
import { TournamentStatus } from '../../lib/api';

const LABELS: Record<TournamentStatus, string> = {
  scheduled: 'Programado',
  in_progress: 'En curso',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

export default function TournamentStatusPill({ status }: { status: TournamentStatus }) {
  const active = status === 'in_progress';
  const cancelled = status === 'cancelled';
  return (
    <View
      style={[
        styles.pill,
        active ? styles.pillActive : cancelled ? styles.pillCancelled : styles.pillNeutral,
      ]}
    >
      <Text
        style={[styles.label, active ? styles.labelActive : cancelled ? styles.labelCancelled : styles.labelNeutral]}
      >
        {LABELS[status]}
      </Text>
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
  pillActive: {
    backgroundColor: withOpacity(colors.ballLime, 0.14),
    borderColor: withOpacity(colors.ballLime, 0.4),
  },
  pillCancelled: {
    backgroundColor: withOpacity(colors.errorCoral, 0.12),
    borderColor: withOpacity(colors.errorCoral, 0.35),
  },
  pillNeutral: {
    backgroundColor: colors.panelLight,
    borderColor: colors.border,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  labelActive: {
    color: colors.courtBlue,
  },
  labelCancelled: {
    color: colors.errorCoral,
  },
  labelNeutral: {
    color: colors.textDim,
  },
});
