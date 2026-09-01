import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
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

/** Puramente informativa — para 'accepted' (por pagar), BookingHistoryScreen#BookingRow ya no
 * reusa esto como botón de pago: es un botón verde de ancho completo aparte (ver payButton), no
 * una píldora. */
export default function BookingStatusPill({ status }: { status: BookingHistoryStatus }) {
  const tone = TONE[status];
  return (
    <View style={[styles.pill, styles[`pill_${tone}`]]}>
      <Text style={[styles.label, styles[`label_${tone}`]]}>{BOOKING_HISTORY_STATUS_LABELS[status]}</Text>
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
