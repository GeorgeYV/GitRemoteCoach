import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TrainerAvatarPlaceholder from '../../components/shared/TrainerAvatarPlaceholder';
import { useAuth } from '../../context/AuthContext';
import { ApiError, Booking, getBooking } from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';
import { BOOKING_PERIOD_LABELS, BookingSlotSelection, mockFeaturedTournament } from '../../mock/parentFlow';

/** El coach normalmente responde en minutos, pero la ventana real es de horas — pollear cada 4s alcanza para la demo. */
const POLL_INTERVAL_MS = 4000;
const WAITING_STATUSES: Booking['status'][] = ['requested'];
const TERMINAL_NEGATIVE_STATUSES: Booking['status'][] = ['rejected', 'expired', 'cancelled', 'payment_failed'];

export default function BookingStatusScreen({
  bookingId,
  selection,
  trainerName,
  price,
  onAccepted,
  onDone,
}: {
  bookingId: string;
  selection: BookingSlotSelection;
  trainerName: string;
  price: number;
  /** Se llama una sola vez, la primera vez que el estado real pasa a 'accepted', para continuar a pago. */
  onAccepted: () => void;
  onDone: () => void;
}) {
  const { token } = useAuth();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('No hay una sesión activa.');
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const result = await getBooking(token!, bookingId);
        if (cancelled) return;
        setBooking(result);
        setError(null);
        if (WAITING_STATUSES.includes(result.status)) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'No se pudo consultar el estado de la reserva.');
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const negative = booking && TERMINAL_NEGATIVE_STATUSES.includes(booking.status);
  const confirmed = booking?.status === 'paid' || booking?.status === 'completed';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.statusCard, confirmed && styles.statusCardConfirmed, negative && styles.statusCardNegative]}>
          {!booking && !error && <ActivityIndicator color={colors.ballLime} style={styles.statusSpinner} />}
          <Text
            style={[
              styles.statusEyebrow,
              confirmed && styles.statusEyebrowConfirmed,
              negative && styles.statusEyebrowNegative,
            ]}
          >
            {statusTitle(booking, error)}
          </Text>
          <Text style={styles.statusBody}>{statusBody(booking, error, trainerName.split(' ')[0])}</Text>
        </View>

        <Section label="Detalle de la reserva">
          <View style={styles.detailCard}>
            <View style={styles.detailTopRow}>
              <TrainerAvatarPlaceholder size={48} />
              <View style={styles.detailInfo}>
                <Text style={styles.trainerName}>{trainerName}</Text>
                <Text style={styles.detailMeta}>{mockFeaturedTournament.name}</Text>
              </View>
            </View>
            <View style={styles.detailDivider} />
            <DetailLine label="Día y horario" value={`${selection.dayLabel} · ${BOOKING_PERIOD_LABELS[selection.period]}`} />
            <DetailLine label="Sede" value={mockFeaturedTournament.venue} />
            <DetailLine
              label={booking?.totalAmountPaid ? 'Total pagado' : 'Tarifa acordada'}
              value={`$${booking?.totalAmountPaid ?? price}`}
            />
          </View>
        </Section>
      </ScrollView>

      <View style={styles.footer}>
        {booking?.status === 'accepted' ? (
          <Pressable style={styles.doneButton} onPress={onAccepted}>
            <Text style={styles.doneLabel}>Continuar a pago</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.doneButton} onPress={onDone}>
            <Text style={styles.doneLabel}>Volver al inicio</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

function statusTitle(booking: Booking | null, error: string | null): string {
  if (error && !booking) return 'No se pudo cargar';
  if (!booking) return 'Consultando tu solicitud…';
  switch (booking.status) {
    case 'requested':
      return 'Solicitud enviada';
    case 'accepted':
      return '¡Buenas noticias!';
    case 'paid':
    case 'completed':
      return '¡Reserva confirmada!';
    case 'rejected':
      return 'Solicitud rechazada';
    case 'expired':
      return 'La solicitud expiró';
    case 'cancelled':
      return 'Reserva cancelada';
    case 'payment_failed':
      return 'El pago no se completó';
    default:
      return 'Estado de la reserva';
  }
}

function statusBody(booking: Booking | null, error: string | null, coachFirstName: string): string {
  if (error && !booking) return error;
  if (!booking) return 'Un momento…';
  switch (booking.status) {
    case 'requested':
      return `Esperando que ${coachFirstName} acepte tu solicitud. Normalmente responde en menos de 30 minutos.`;
    case 'accepted':
      return `${coachFirstName} aceptó tu solicitud. Continúa para completar el pago.`;
    case 'paid':
    case 'completed':
      return `${coachFirstName} confirmó tu solicitud. Te avisaremos cuando comparta el punto de encuentro exacto.`;
    case 'rejected':
      return `${coachFirstName} no pudo aceptar esta solicitud. Busca otro entrenador disponible.`;
    case 'expired':
      return `${coachFirstName} no respondió a tiempo. Intenta reservar con otro entrenador.`;
    case 'cancelled':
      return 'Esta reserva fue cancelada.';
    case 'payment_failed':
      return 'La pasarela de pago rechazó el cargo. Intenta con otro método de pago.';
    default:
      return '';
  }
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailLine}>
      <Text style={styles.detailLineLabel}>{label}</Text>
      <Text style={styles.detailLineValue} numberOfLines={2}>
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
  content: {
    padding: 20,
    paddingBottom: 24,
  },
  statusCard: {
    backgroundColor: colors.panelLight,
    borderRadius: radius,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginBottom: 26,
  },
  statusCardConfirmed: {
    backgroundColor: withOpacity(colors.ballLime, 0.1),
    borderColor: colors.ballLime,
  },
  statusCardNegative: {
    backgroundColor: withOpacity(colors.errorCoral, 0.1),
    borderColor: colors.errorCoral,
  },
  statusSpinner: {
    marginBottom: 10,
  },
  statusEyebrow: {
    color: colors.textSoft,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  statusEyebrowConfirmed: {
    color: colors.ballLime,
  },
  statusEyebrowNegative: {
    color: colors.errorCoral,
  },
  statusBody: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  section: {
    marginBottom: 22,
  },
  sectionLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  detailCard: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailInfo: {
    flex: 1,
    marginLeft: 12,
  },
  trainerName: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  detailMeta: {
    color: colors.textDim,
    fontSize: 12,
  },
  detailDivider: {
    height: 1,
    backgroundColor: colors.borderSoft,
    marginVertical: 14,
  },
  detailLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 12,
  },
  detailLineLabel: {
    color: colors.textDim,
    fontSize: 12,
  },
  detailLineValue: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.courtBlueDeep,
    padding: 16,
  },
  doneButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 16,
    alignItems: 'center',
  },
  doneLabel: {
    color: colors.courtBlueDeep,
    fontSize: 15,
    fontWeight: '800',
  },
});
