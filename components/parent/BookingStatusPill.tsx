import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, withOpacity } from '../../lib/theme';
import { BOOKING_HISTORY_STATUS_LABELS, BookingHistoryStatus } from '../../mock/parentFlow';

const TONE: Record<BookingHistoryStatus, 'positive' | 'neutral' | 'negative' | 'warning'> = {
  requested: 'warning',
  accepted: 'warning',
  paymentSubmitted: 'warning',
  confirmed: 'positive',
  completed: 'neutral',
  cancelled: 'negative',
  rejected: 'negative',
};

/** onPress opcional: la píldora "Por pagar" (status 'accepted') tiene fondo de color y borde —
 * visualmente se ve como un botón mucho antes que el link de texto plano "Pagar" al lado — así
 * que BookingHistoryScreen le suma el mismo gesto de pago acá, sin sacar el link existente. El
 * resto de los estados sigue siendo solo informativo (sin onPress, View normal). */
export default function BookingStatusPill({ status, onPress }: { status: BookingHistoryStatus; onPress?: () => void }) {
  const tone = TONE[status];
  const content = (
    <View style={[styles.pill, styles[`pill_${tone}`]]}>
      <Text style={[styles.label, styles[`label_${tone}`]]}>{BOOKING_HISTORY_STATUS_LABELS[status]}</Text>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} hitSlop={4}>
      {content}
    </Pressable>
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
  pill_warning: {
    backgroundColor: withOpacity(colors.amber, 0.14),
    borderColor: withOpacity(colors.amber, 0.4),
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  label_positive: {
    color: colors.courtBlue,
  },
  label_neutral: {
    color: colors.textDim,
  },
  label_negative: {
    color: colors.errorCoral,
  },
  label_warning: {
    color: colors.amber,
  },
});
