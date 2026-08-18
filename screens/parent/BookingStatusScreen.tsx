import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TrainerAvatarPlaceholder from '../../components/shared/TrainerAvatarPlaceholder';
import { useAuth } from '../../context/AuthContext';
import { AlternativeCoach, ApiError, Booking, getBooking, getBookingAlternatives, TournamentSearchResult } from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';

export interface StatusDayBooking {
  bookingId: string;
  dayLabel: string;
  price: number;
}

/** El coach normalmente responde en minutos, pero la ventana real es de horas — pollear cada 4s alcanza para la demo. */
const POLL_INTERVAL_MS = 4000;
const WAITING_STATUSES: Booking['status'][] = ['requested'];
const DAY_STATUS_LABELS: Record<Booking['status'], string> = {
  requested: 'Por confirmar',
  accepted: 'Aceptado',
  paid: 'Aceptado',
  completed: 'Aceptado',
  rejected: 'Rechazado',
  expired: 'Expiró',
  cancelled: 'Cancelado',
  payment_failed: 'Aceptado',
};

export default function BookingStatusScreen({
  bookings,
  trainerName,
  tournament,
  onAccepted,
  onDone,
  onSelectAlternative,
}: {
  bookings: StatusDayBooking[];
  trainerName: string;
  tournament: TournamentSearchResult;
  /** Se llama una sola vez, cuando todos los días ya fueron decididos y al menos uno fue
   * aceptado — solo los días aceptados se cobran (ver decisión de negocio). */
  onAccepted: (accepted: StatusDayBooking[]) => void;
  onDone: () => void;
  /** Ningún día fue aceptado: el padre eligió una alternativa sugerida para empezar de nuevo con ese coach. */
  onSelectAlternative?: (coachId: string) => void;
}) {
  const { token } = useAuth();
  const [statusById, setStatusById] = useState<Record<string, Booking>>({});
  const [error, setError] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<AlternativeCoach[] | null>(null);

  const bookingIdsKey = bookings.map((b) => b.bookingId).join(',');

  useEffect(() => {
    if (!token) {
      setError('No hay una sesión activa.');
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const results = await Promise.all(bookings.map((b) => getBooking(token!, b.bookingId)));
        if (cancelled) return;
        const next: Record<string, Booking> = {};
        results.forEach((result, i) => {
          next[bookings[i].bookingId] = result;
        });
        setStatusById(next);
        setError(null);
        if (results.some((result) => WAITING_STATUSES.includes(result.status))) {
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
  }, [bookingIdsKey]);

  const allLoaded = bookings.every((b) => statusById[b.bookingId]);
  const anyWaiting = bookings.some((b) => WAITING_STATUSES.includes(statusById[b.bookingId]?.status));
  const allDecided = allLoaded && !anyWaiting;
  const acceptedBookings = bookings.filter((b) => statusById[b.bookingId]?.status === 'accepted');
  const noneAccepted = allDecided && acceptedBookings.length === 0;

  useEffect(() => {
    if (!token || !noneAccepted) return;
    let cancelled = false;
    getBookingAlternatives(token, bookings[0].bookingId).then((result) => {
      if (!cancelled) setAlternatives(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, noneAccepted]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.statusCard, allDecided && acceptedBookings.length > 0 && styles.statusCardConfirmed, noneAccepted && styles.statusCardNegative]}>
          {!allLoaded && !error && <ActivityIndicator color={colors.courtBlue} style={styles.statusSpinner} />}
          <Text
            style={[
              styles.statusEyebrow,
              allDecided && acceptedBookings.length > 0 && styles.statusEyebrowConfirmed,
              noneAccepted && styles.statusEyebrowNegative,
            ]}
          >
            {statusTitle(allLoaded, error, allDecided, acceptedBookings.length, bookings.length)}
          </Text>
          <Text style={styles.statusBody}>
            {statusBody(allLoaded, error, allDecided, acceptedBookings.length, bookings.length, trainerName.split(' ')[0])}
          </Text>
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
            <DetailLine label="Sede" value={tournament.venue} />
            {bookings.map((b) => (
              <DetailLine
                key={b.bookingId}
                label={b.dayLabel}
                value={statusById[b.bookingId] ? DAY_STATUS_LABELS[statusById[b.bookingId].status] : 'Consultando…'}
              />
            ))}
          </View>
        </Section>

        {noneAccepted && (alternatives === null || alternatives.length > 0) && (
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
        {allDecided && acceptedBookings.length > 0 ? (
          <Pressable style={styles.doneButton} onPress={() => onAccepted(acceptedBookings)}>
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

function statusTitle(
  allLoaded: boolean,
  error: string | null,
  allDecided: boolean,
  acceptedCount: number,
  totalCount: number,
): string {
  if (error && !allLoaded) return 'No se pudo cargar';
  if (!allLoaded) return 'Consultando tu solicitud…';
  if (!allDecided) return 'Solicitud enviada';
  if (acceptedCount === 0) return totalCount > 1 ? 'Solicitudes rechazadas' : 'Solicitud rechazada';
  if (acceptedCount === totalCount) return '¡Buenas noticias!';
  return '¡Buenas noticias parciales!';
}

function statusBody(
  allLoaded: boolean,
  error: string | null,
  allDecided: boolean,
  acceptedCount: number,
  totalCount: number,
  coachFirstName: string,
): string {
  if (error && !allLoaded) return error;
  if (!allLoaded) return 'Un momento…';
  if (!allDecided) {
    return totalCount > 1
      ? `Esperando que ${coachFirstName} responda cada día. Normalmente responde en menos de 30 minutos.`
      : `Esperando que ${coachFirstName} acepte tu solicitud. Normalmente responde en menos de 30 minutos.`;
  }
  if (acceptedCount === 0) {
    return `${coachFirstName} no pudo aceptar esta solicitud. Busca otro entrenador disponible.`;
  }
  if (acceptedCount === totalCount) {
    return `${coachFirstName} aceptó tu solicitud. Continúa para completar el pago.`;
  }
  return `${coachFirstName} aceptó ${acceptedCount} de ${totalCount} días. Solo se te cobrará por los días aceptados.`;
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
