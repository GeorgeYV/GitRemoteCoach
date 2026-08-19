import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PaymentMethodRow from '../../components/parent/PaymentMethodRow';
import TrainerAvatarPlaceholder from '../../components/shared/TrainerAvatarPlaceholder';
import { useAuth } from '../../context/AuthContext';
import { ApiError, payBookingsBatch } from '../../lib/api';
import { colors, radius } from '../../lib/theme';
import { mockPaymentMethods } from '../../mock/parentFlow';

export interface PayableBooking {
  bookingId: string;
  dayLabel: string;
  price: number;
  /** Solo hace falta cuando el lote mezcla reservas de distintos entrenadores/torneos (ver
   * "Pagar todas"/selección múltiple en BookingHistoryScreen) — con un solo entrenador para todo
   * el lote (el caso de BookingConfirmScreen, varios días con el mismo coach) se usan en cambio
   * los props trainerName/tournamentName/venue de más abajo, compartidos para todo el resumen. */
  trainerName?: string;
  tournamentName?: string;
  venue?: string;
}

export default function BookingPaymentScreen({
  bookings,
  venue,
  note,
  trainerName,
  tournamentName,
  onBack,
  onConfirm,
}: {
  bookings: PayableBooking[];
  venue?: string;
  note: string;
  trainerName?: string;
  tournamentName?: string;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const { token } = useAuth();
  const [methodId, setMethodId] = useState(mockPaymentMethods[0].id);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Un solo entrenador/torneo para todo el lote: header compartido de siempre. Lote mixto (p. ej.
  // "Pagar todas" desde el historial, con reservas de distintos entrenadores): cada reserva se
  // lista con sus propios datos en vez de un único encabezado que no aplicaría a todas por igual.
  const singleHeader = trainerName !== undefined && tournamentName !== undefined;
  const total = bookings.reduce((sum, b) => sum + b.price, 0);

  async function handleConfirm() {
    if (!token) {
      setError('No hay una sesión activa.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await payBookingsBatch(
        token,
        bookings.map((b) => b.bookingId),
        methodId,
      );
      if (result.requiresAction) {
        setError('El pago requiere verificación adicional (3DS), no soportada en este demo.');
        return;
      }
      onConfirm();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo procesar el pago. Intenta de nuevo.');
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
        <Text style={styles.headerTitle}>Confirmar y pagar</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Section label="Resumen">
          <View style={styles.summaryCard}>
            {singleHeader ? (
              <>
                <View style={styles.summaryTopRow}>
                  <TrainerAvatarPlaceholder size={48} />
                  <View style={styles.summaryInfo}>
                    <Text style={styles.trainerName}>{trainerName}</Text>
                    <Text style={styles.summaryMeta}>{tournamentName}</Text>
                  </View>
                </View>
                <View style={styles.summaryDivider} />
                {venue && <SummaryLine label="Sede" value={venue} />}
                {bookings.map((b) => (
                  <SummaryLine key={b.bookingId} label={b.dayLabel} value={`$${b.price}`} />
                ))}
              </>
            ) : (
              bookings.map((b, i) => (
                <View key={b.bookingId}>
                  {i > 0 && <View style={styles.summaryDivider} />}
                  <Text style={styles.itemTrainerName}>{b.trainerName}</Text>
                  <Text style={styles.summaryMeta}>{b.tournamentName}</Text>
                  <SummaryLine label={b.dayLabel} value={`$${b.price}`} />
                  {b.venue && <SummaryLine label="Sede" value={b.venue} />}
                </View>
              ))
            )}
            {note ? <SummaryLine label="Nota" value={note} /> : null}
            <View style={styles.summaryDivider} />
            <SummaryLine label="Total a pagar" value={`$${total}`} emphasize />
          </View>
        </Section>

        <Section label="Método de pago">
          {mockPaymentMethods.map((method) => (
            <PaymentMethodRow
              key={method.id}
              method={method}
              selected={methodId === method.id}
              onPress={() => setMethodId(method.id)}
            />
          ))}
        </Section>
      </ScrollView>

      <View style={styles.footer}>
        {error && <Text style={styles.errorText}>{error}</Text>}
        <Text style={styles.footerNote}>El cobro se libera al entrenador tras completar el partido</Text>
        <Pressable
          style={[styles.confirmButton, submitting && styles.confirmButtonDisabled]}
          onPress={handleConfirm}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={colors.courtBlueDeep} />
          ) : (
            <View style={styles.confirmContent}>
              <Ionicons name="card-outline" size={17} color={colors.courtBlueDeep} />
              <Text style={styles.confirmLabel}>Confirmar y pagar ${total}</Text>
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

function SummaryLine({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <View style={styles.summaryLine}>
      <Text style={styles.summaryLineLabel}>{label}</Text>
      <Text style={[styles.summaryLineValue, emphasize && styles.summaryLineValueEmphasized]} numberOfLines={2}>
        {value}
      </Text>
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
  },
  trainerName: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  itemTrainerName: {
    color: colors.lineWhite,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  summaryMeta: {
    color: colors.textDim,
    fontSize: 12,
    marginBottom: 8,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.borderSoft,
    marginVertical: 14,
  },
  summaryLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 12,
  },
  summaryLineLabel: {
    color: colors.textDim,
    fontSize: 12,
  },
  summaryLineValue: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  summaryLineValueEmphasized: {
    color: colors.courtBlue,
    fontSize: 17,
    fontWeight: '800',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.panel,
    padding: 16,
  },
  footerNote: {
    color: colors.textDim,
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 10,
  },
  confirmButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
  confirmContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
