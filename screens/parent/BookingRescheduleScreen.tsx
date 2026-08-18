import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import IconTextInput from '../../components/shared/IconTextInput';
import InitialAvatar from '../../components/shared/InitialAvatar';
import { useAuth } from '../../context/AuthContext';
import { ApiError, Booking, rescheduleBooking } from '../../lib/api';
import { isValidDateString, isValidTimeString, isoToLocalDateAndTime, localDateAndTimeToIso } from '../../lib/dateSlots';
import { colors, radius, withOpacity } from '../../lib/theme';
import { BookingHistoryEntry } from '../../mock/parentFlow';

/** Cualquiera de las dos partes puede reprogramar el horario directamente, sin que la otra
 * tenga que aprobarlo — ver PATCH /bookings/:id/reschedule. Equivalente del padre a la sección
 * "Lugar exacto" editable de CoachPreMatchReminderScreen, pero para la fecha/hora. */
export default function BookingRescheduleScreen({
  booking,
  onBack,
  onRescheduled,
}: {
  booking: BookingHistoryEntry;
  onBack: () => void;
  onRescheduled: (updated: Booking) => void;
}) {
  const { token } = useAuth();
  const initial = isoToLocalDateAndTime(booking.matchDatetime);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = date.trim().length > 0 && time.trim().length > 0 && !submitting;

  async function handleConfirm() {
    if (!token) {
      setError('No hay una sesión activa.');
      return;
    }
    const trimmedDate = date.trim();
    const trimmedTime = time.trim();
    if (!isValidDateString(trimmedDate) || !isValidTimeString(trimmedTime)) {
      setError('Fecha u hora inválida. Usa AAAA-MM-DD y HH:MM.');
      return;
    }
    const matchDatetime = localDateAndTimeToIso(trimmedDate, trimmedTime);
    if (new Date(matchDatetime).getTime() <= Date.now()) {
      setError('El nuevo horario debe ser en el futuro.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const updated = await rescheduleBooking(token, booking.id, matchDatetime);
      onRescheduled(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo reprogramar la reserva. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Reprogramar horario</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Section label="Reserva">
          <View style={styles.summaryCard}>
            <View style={styles.summaryTopRow}>
              <InitialAvatar initial={booking.trainerInitial} size={44} />
              <View style={styles.summaryInfo}>
                <Text style={styles.trainerName}>{booking.trainerName}</Text>
                <Text style={styles.summaryMeta}>{booking.tournamentName}</Text>
              </View>
            </View>
            <View style={styles.summaryDivider} />
            <Text style={styles.summaryLine}>Horario actual: {booking.date} · {booking.time}</Text>
            <Text style={styles.summaryLine}>{booking.venue}</Text>
          </View>
        </Section>

        <Section label="Nuevo horario">
          <IconTextInput icon="calendar-outline" placeholder="Fecha (AAAA-MM-DD)" value={date} onChangeText={setDate} />
          <IconTextInput icon="time-outline" placeholder="Hora (HH:MM)" value={time} onChangeText={setTime} />
        </Section>

        <View style={styles.noticeCard}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textDim} />
          <Text style={styles.noticeText}>
            El cambio se aplica de inmediato, sin que {booking.trainerName} tenga que confirmarlo — se le va a avisar.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {error && <Text style={styles.errorText}>{error}</Text>}
        <Pressable style={[styles.confirmButton, !canSubmit && styles.confirmButtonDisabled]} onPress={handleConfirm} disabled={!canSubmit}>
          {submitting ? (
            <ActivityIndicator color={colors.courtBlueDeep} />
          ) : (
            <View style={styles.buttonContent}>
              <Ionicons name="checkmark-circle-outline" size={17} color={colors.courtBlueDeep} />
              <Text style={styles.confirmLabel}>Guardar nuevo horario</Text>
            </View>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  backButton: {
    paddingRight: 12,
  },
  backIcon: {
    color: colors.lineWhite,
    fontSize: 20,
  },
  headerTitle: {
    color: colors.lineWhite,
    fontSize: 17,
    fontWeight: '800',
  },
  content: {
    padding: 20,
    paddingBottom: 24,
  },
  section: {
    marginBottom: 26,
  },
  sectionLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  summaryCard: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  trainerName: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  summaryMeta: {
    color: colors.textDim,
    fontSize: 12,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.borderSoft,
    marginVertical: 14,
  },
  summaryLine: {
    color: colors.textSoft,
    fontSize: 13,
    marginBottom: 3,
  },
  noticeCard: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.panelLight,
    borderRadius: radius,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noticeText: {
    flex: 1,
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 17,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.panel,
    padding: 16,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  confirmButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: withOpacity(colors.ballLime, 0.3),
  },
  confirmLabel: {
    color: colors.courtBlueDeep,
    fontSize: 15,
    fontWeight: '800',
  },
  errorText: {
    color: colors.errorCoral,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
  },
});
