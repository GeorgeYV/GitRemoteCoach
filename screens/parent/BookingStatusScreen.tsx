import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TrainerAvatarPlaceholder from '../../components/shared/TrainerAvatarPlaceholder';
import { useAuth } from '../../context/AuthContext';
import { AlternativeCoach, ApiError, Booking, getBooking, getBookingAlternatives, TournamentSearchResult } from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';
import { BookingSlotSelection } from '../../mock/parentFlow';

const ALTERNATIVES_STATUSES: Booking['status'][] = ['rejected', 'expired'];

/** El coach normalmente responde en minutos, pero la ventana real es de horas — pollear cada 4s alcanza para la demo. */
const POLL_INTERVAL_MS = 4000;
const WAITING_STATUSES: Booking['status'][] = ['requested'];
const TERMINAL_NEGATIVE_STATUSES: Booking['status'][] = ['rejected', 'expired', 'cancelled', 'payment_failed'];

export default function BookingStatusScreen({
  bookingId,
  selection,
  trainerName,
  tournament,
  price,
  onAccepted,
  onDone,
  onSelectAlternative,
}: {
  bookingId: string;
  selection: BookingSlotSelection;
  trainerName: string;
  tournament: TournamentSearchResult;
  price: number;
  /** Se llama una sola vez, la primera vez que el estado real pasa a 'accepted', para continuar a pago. */
  onAccepted: () => void;
  onDone: () => void;
  /** Reserva 'rejected' o 'expired': el padre eligió una alternativa sugerida para empezar de nuevo con ese coach. */
  onSelectAlternative?: (coachId: string) => void;
}) {
  const { token } = useAuth();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<AlternativeCoach[] | null>(null);

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

  useEffect(() => {
    if (!token || !booking || !ALTERNATIVES_STATUSES.includes(booking.status)) return;
    let cancelled = false;
    getBookingAlternatives(token, bookingId).then((result) => {
      if (!cancelled) setAlternatives(result);
    });
    return () => {
      cancelled = true;
    };
  }, [token, bookingId, booking?.status]);

  const negative = booking && TERMINAL_NEGATIVE_STATUSES.includes(booking.status);
  const confirmed = booking?.status === 'paid' || booking?.status === 'completed';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.statusCard, confirmed && styles.statusCardConfirmed, negative && styles.statusCardNegative]}>
          {!booking && !error && <ActivityIndicator color={colors.courtBlue} style={styles.statusSpinner} />}
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
                <Text style={styles.detailMeta}>{tournament.name}</Text>
              </View>
            </View>
            <View style={styles.detailDivider} />
            <DetailLine label="Día" value={selection.dayLabel} />
            <DetailLine label="Sede" value={tournament.venue} />
            <DetailLine
              label={booking?.totalAmountPaid ? 'Total pagado' : 'Tarifa acordada'}
              value={`$${booking?.totalAmountPaid ?? price}`}
            />
          </View>
        </Section>

        {booking && ALTERNATIVES_STATUSES.includes(booking.status) && (alternatives === null || alternatives.length > 0) && (
          <Section label="Otros entrenadores en este torneo">
            {alternatives === null ? (
              <ActivityIndicator color={colors.courtBlue} />
            ) : (
              <View style={styles.alternativesList}>
                {alternatives.map((coach) => (
                  <Pressable
                    key={coach.coachId}
                    style={styles.alternativeCard}
                    onPress={() => onSelectAlternative?.(coach.coachId)}
                  >
                    <TrainerAvatarPlaceholder size={40} />
                    <View style={styles.alternativeInfo}>
                      <Text style={styles.alternativeName}>{coach.name}</Text>
                      <Text style={styles.alternativeRating}>★ {coach.ratingAvg.toFixed(2)}</Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </Section>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {booking?.status === 'accepted' ? (
          <Pressable style={styles.doneButton} onPress={onAccepted}>
            <View style={styles.doneContent}>
              <Ionicons name="arrow-forward-outline" size={17} color={colors.courtBlueDeep} />
              <Text style={styles.doneLabel}>Continuar a pago</Text>
            </View>
          </Pressable>
        ) : (
          <Pressable style={styles.doneButton} onPress={onDone}>
            <View style={styles.doneContent}>
              <Ionicons name="home-outline" size={17} color={colors.courtBlueDeep} />
              <Text style={styles.doneLabel}>Volver al inicio</Text>
            </View>
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
    color: colors.courtBlue,
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
  alternativesList: {
    gap: 10,
  },
  alternativeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  alternativeInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  alternativeName: {
    color: colors.lineWhite,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  alternativeRating: {
    color: colors.courtBlue,
    fontSize: 12,
    fontWeight: '600',
  },
  chevron: {
    color: colors.textDim,
    fontSize: 20,
    fontWeight: '700',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.panel,
    padding: 16,
  },
  doneButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 16,
    alignItems: 'center',
  },
  doneContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  doneLabel: {
    color: colors.courtBlueDeep,
    fontSize: 15,
    fontWeight: '800',
  },
});
