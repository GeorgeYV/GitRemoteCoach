import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, withOpacity } from '../../lib/theme';
import { COACH_BOOKING_STATUS_LABELS, CoachBookingStatus } from '../../mock/coachFlow';

const TONE: Record<CoachBookingStatus, 'positive' | 'neutral' | 'negative'> = {
  confirmed: 'positive',
  completed: 'neutral',
  cancelled: 'negative',
};

export default function CoachBookingStatusPill({ status }: { status: CoachBookingStatus }) {
  const tone = TONE[status];
  return (
    <View style={[styles.pill, styles[`pill_${tone}`]]}>
      <Text style={[styles.label, styles[`label_${tone}`]]}>{COACH_BOOKING_STATUS_LABELS[status]}</Text>
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
  pill_positive: {
    backgroundColor: withOpacity(colors.ballLime, 0.14),
    borderColor: withOpacity(colors.ballLime, 0.4),
  },
  pill_neutral: {
    backgroundColor: colors.panelLight,
    borderColor: colors.border,
  },
  pill_negative: {
    backgroundColor: withOpacity(colors.errorCoral, 0.12),
    borderColor: withOpacity(colors.errorCoral, 0.4),
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  label_positive: {
    color: colors.ballLime,
  },
  label_neutral: {
    color: colors.textDim,
  },
  label_negative: {
    color: colors.errorCoral,
  },
});
