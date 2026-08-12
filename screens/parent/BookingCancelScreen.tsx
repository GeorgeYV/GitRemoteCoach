import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import IconTextInput from '../../components/shared/IconTextInput';
import InitialAvatar from '../../components/shared/InitialAvatar';
import { useAuth } from '../../context/AuthContext';
import { ApiError, cancelBooking } from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';
import { BookingHistoryEntry } from '../../mock/parentFlow';

export default function BookingCancelScreen({
  booking,
  onBack,
  onConfirm,
}: {
  booking: BookingHistoryEntry;
  onBack: () => void;
  onConfirm: (reason: string) => void;
}) {
  const { token } = useAuth();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!token) {
      setError('No hay una sesión activa.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await cancelBooking(token, booking.id, { reason: reason.trim() || undefined });
      onConfirm(reason.trim());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cancelar la reserva. Intenta de nuevo.');
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
        <Text style={styles.headerTitle}>Cancelar reserva</Text>
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
              <Text style={styles.price}>${booking.price}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <Text style={styles.summaryLine}>
              {booking.date} · {booking.time}
            </Text>
            <Text style={styles.summaryLine}>{booking.venue}</Text>
          </View>
        </Section>

        <Section label="Política de cancelación">
          <View style={styles.policyCard}>
            <Text style={styles.policyText}>
              Cancelaciones con más de 24 horas de anticipación no tienen costo y se reembolsa el 100%.
              Cancelar dentro de las 24 horas previas al partido puede generar un cargo parcial para
              compensar al entrenador.
            </Text>
          </View>
        </Section>

        <Section label="Motivo (opcional)">
          <IconTextInput
            icon="chatbubble-ellipses-outline"
            style={styles.reasonInput}
            placeholder="Cuéntanos por qué cancelas…"
            value={reason}
            onChangeText={setReason}
            multiline
          />
        </Section>
      </ScrollView>

      <View style={styles.footer}>
        {error && <Text style={styles.errorText}>{error}</Text>}
        <Pressable style={styles.keepButton} onPress={onBack} disabled={submitting}>
          <View style={styles.buttonContent}>
            <Ionicons name="arrow-undo-outline" size={17} color={colors.lineWhite} />
            <Text style={styles.keepLabel}>Mantener reserva</Text>
          </View>
        </Pressable>
        <Pressable style={[styles.cancelButton, submitting && styles.cancelButtonDisabled]} onPress={handleConfirm} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color={colors.lineWhite} />
          ) : (
            <View style={styles.buttonContent}>
              <Ionicons name="close-circle-outline" size={17} color={colors.lineWhite} />
              <Text style={styles.cancelLabel}>Cancelar reserva</Text>
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
  price: {
    color: colors.courtBlue,
    fontSize: 15,
    fontWeight: '800',
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
  policyCard: {
    backgroundColor: withOpacity(colors.errorCoral, 0.08),
    borderRadius: radius,
    borderWidth: 1,
    borderColor: withOpacity(colors.errorCoral, 0.3),
    padding: 16,
  },
  policyText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  reasonInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.panel,
    padding: 16,
    gap: 10,
  },
  keepButton: {
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 15,
    alignItems: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  keepLabel: {
    color: colors.lineWhite,
    fontSize: 14,
    fontWeight: '700',
  },
  cancelButton: {
    backgroundColor: colors.errorCoral,
    borderRadius: radius,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelButtonDisabled: {
    backgroundColor: withOpacity(colors.errorCoral, 0.5),
  },
  cancelLabel: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
  },
  errorText: {
    color: colors.errorCoral,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 2,
  },
});
