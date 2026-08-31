import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import IconTextInput from '../../components/shared/IconTextInput';
import TrainerAvatarPlaceholder from '../../components/shared/TrainerAvatarPlaceholder';
import { useAuth } from '../../context/AuthContext';
import { ApiError, Booking, listParentBookings, RateMode, requestBooking, TournamentSearchResult } from '../../lib/api';
import { STATUS_MAP } from '../../lib/parentBookingDisplay';
import { colors, radius, withOpacity } from '../../lib/theme';
import { AvailabilityDay, BOOKING_HISTORY_STATUS_LABELS, buildMatchDatetime } from '../../mock/parentFlow';

export interface CreatedDayBooking {
  bookingId: string;
  dayLabel: string;
  isoDate: string;
  price: number;
}

/** Mismo criterio que idx_bookings_no_duplicate_active (db/schema.sql): estos son los únicos
 * estados que bloquean una nueva solicitud para el mismo jugador+coach+horario. rejected/expired/
 * cancelled/payment_failed no cuentan — el padre puede volver a solicitar ese día. */
const BLOCKING_STATUSES: Booking['status'][] = ['requested', 'accepted', 'paid', 'completed'];

/** "Así funciona" (ver más abajo) — se muestra una sola vez, antes de la primera reserva de
 * cualquier padre en este dispositivo. El proceso real dura horas/días (el entrenador tiene una
 * ventana para aceptar, después hay que pagar y esperar a que se verifique), así que conviene
 * que el padre sepa eso ANTES de solicitar, no que le extrañe que nadie responda en 5 minutos. */
const INTRO_SEEN_KEY = 'tennis-live-capture:seen-booking-intro-v1';

export default function BookingConfirmScreen({
  playerId,
  playerName,
  coachId,
  tournament,
  trainerName,
  price,
  rateMode,
  availability,
  initialIsoDate,
  onBack,
  onContinue,
}: {
  playerId: string;
  playerName?: string;
  coachId: string;
  tournament: TournamentSearchResult;
  trainerName: string;
  price: number;
  rateMode: RateMode;
  availability: AvailabilityDay[];
  /** Preselecciona un día — llega cuando el padre tocó un día disponible directo desde la
   * "Disponibilidad" de solo lectura del perfil (TrainerProfileScreen), en vez de arrancar acá
   * sin nada elegido. Sigue pudiendo sumar más días como cualquier otra selección. */
  initialIsoDate?: string;
  onBack: () => void;
  onContinue: (created: CreatedDayBooking[], note: string) => void;
}) {
  const { token, user } = useAuth();
  const [selectedIsoDates, setSelectedIsoDates] = useState<Set<string>>(
    () => new Set(initialIsoDate ? [initialIsoDate] : []),
  );
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Reservas ya creadas en el servidor en un intento previo — se preservan entre reintentos
  // (ver handleContinue) para no perder de vista una solicitud real si otro día falla.
  const [created, setCreated] = useState<CreatedDayBooking[]>([]);
  // Días para los que este jugador ya tiene una solicitud activa con este coach en este torneo —
  // se muestran bloqueados con su estado real en vez de dejar que el padre los vuelva a pedir y
  // se entere recién al fallar el POST (ver duplicate_booking en requestBooking).
  const [bookedStatusByIsoDate, setBookedStatusByIsoDate] = useState<Map<string, Booking['status']>>(new Map());
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(INTRO_SEEN_KEY)
      .then((seen) => setShowIntro(!seen))
      .catch(() => {});
  }, []);

  function dismissIntro() {
    setShowIntro(false);
    AsyncStorage.setItem(INTRO_SEEN_KEY, '1').catch(() => {});
  }

  useEffect(() => {
    if (!token || !user) return;
    let cancelled = false;
    listParentBookings(token, user.id)
      .then((bookings) => {
        if (cancelled) return;
        const next = new Map<string, Booking['status']>();
        for (const booking of bookings) {
          if (
            booking.playerId === playerId &&
            booking.coachId === coachId &&
            booking.tournamentId === tournament.id &&
            BLOCKING_STATUSES.includes(booking.status)
          ) {
            next.set(booking.matchDatetime.slice(0, 10), booking.status);
          }
        }
        setBookedStatusByIsoDate(next);
        // Si el padre ya había marcado uno de estos días antes de que esto terminara de cargar,
        // se lo destildamos — evita enviar una solicitud que el servidor va a rechazar de todos modos.
        setSelectedIsoDates((prev) => {
          const filtered = new Set([...prev].filter((iso) => !next.has(iso)));
          return filtered.size === prev.size ? prev : filtered;
        });
      })
      .catch(() => {
        // Chequeo preventivo — si falla, el padre igual puede intentar reservar y se entera por
        // el mensaje de error del propio POST si el día ya estaba tomado.
      });
    return () => {
      cancelled = true;
    };
  }, [token, user, playerId, coachId, tournament.id]);

  function toggleDay(day: AvailabilityDay) {
    if (created.length > 0) return; // días ya bloqueados una vez que hay reservas reales creadas
    if (bookedStatusByIsoDate.has(day.isoDate)) return;
    setSelectedIsoDates((prev) => {
      const next = new Set(prev);
      if (next.has(day.isoDate)) next.delete(day.isoDate);
      else next.add(day.isoDate);
      return next;
    });
  }

  const selectedDays = availability
    .filter((day) => selectedIsoDates.has(day.isoDate))
    .sort((a, b) => a.isoDate.localeCompare(b.isoDate));

  // 'per_tournament' se cobra una sola vez sin importar cuántos días se reserven; 'per_day'
  // multiplica por la cantidad de días elegidos.
  const total = rateMode === 'per_tournament' ? price : price * selectedDays.length;

  async function handleContinue() {
    if (selectedDays.length === 0) return;
    if (!token) {
      setError('No hay una sesión activa.');
      return;
    }
    setSubmitting(true);
    setError(null);

    const alreadyCreated = new Set(created.map((c) => c.isoDate));
    const pendingDays = selectedDays.filter((day) => !alreadyCreated.has(day.isoDate));
    const newlyCreated: CreatedDayBooking[] = [];
    const failedDays: { label: string; message: string }[] = [];

    for (const day of pendingDays) {
      // Con 'per_tournament', solo el primer día (cronológicamente) de la selección carga el
      // monto total; el resto queda en $0 para que la suma real cobrada siga siendo el total.
      const isFirstDay = selectedDays[0].isoDate === day.isoDate;
      const dayPrice = rateMode === 'per_tournament' ? (isFirstDay ? price : 0) : price;
      try {
        const booking = await requestBooking(token, {
          playerId,
          coachId,
          tournamentId: tournament.id,
          matchDatetime: buildMatchDatetime(day),
          agreedRate: dayPrice,
          note: note.trim() || undefined,
        });
        newlyCreated.push({ bookingId: booking.id, dayLabel: day.dayLabel, isoDate: day.isoDate, price: dayPrice });
      } catch (err) {
        // El backend ya devuelve un mensaje claro (ej. duplicate_booking: "Ya existe una
        // solicitud activa..."), no hay que reemplazarlo por uno genérico.
        const message = err instanceof ApiError ? err.message : 'No se pudo completar la solicitud.';
        failedDays.push({ label: day.dayLabel, message });
      }
    }

    const allCreated = [...created, ...newlyCreated];
    setCreated(allCreated);
    setSubmitting(false);

    if (failedDays.length > 0) {
      setError(failedDays.map((f) => `${f.label}: ${f.message}`).join(' · '));
      return;
    }
    onContinue(allCreated, note.trim());
  }

  const canContinue = selectedDays.length > 0 && !submitting;
  const daysLocked = created.length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <TrainerAvatarPlaceholder size={44} />
        <View style={styles.headerText}>
          <Text style={styles.trainerName} numberOfLines={1}>
            Reservar con {trainerName}
          </Text>
          <Text style={styles.tournamentMeta} numberOfLines={1}>
            {tournament.name}
          </Text>
          {playerName && (
            <Text style={styles.playerMeta} numberOfLines={1}>
              Jugador: {playerName}
            </Text>
          )}
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flexArea}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={8}
      >
      <ScrollView contentContainerStyle={styles.content}>
        {showIntro && (
          <View style={styles.introCard}>
            <View style={styles.introHeaderRow}>
              <Ionicons name="information-circle-outline" size={18} color={colors.courtBlue} />
              <Text style={styles.introTitle}>Así funciona</Text>
            </View>
            <Text style={styles.introStep}>1. Elegís los días · 2. {trainerName.split(' ')[0]} confirma (unas horas) · 3. pagás · 4. ¡listo!</Text>
            <Pressable style={styles.introDismiss} onPress={dismissIntro} hitSlop={8}>
              <Text style={styles.introDismissLabel}>Entendido</Text>
            </Pressable>
          </View>
        )}

        <Section label="Elige uno o más días">
          <View style={styles.multiDayTip}>
            <Ionicons name="checkmark-done-outline" size={13} color={colors.courtBlue} />
            <Text style={styles.multiDayTipText}>Podés tocar varios días a la vez, no hace falta reservar de a uno</Text>
          </View>
          <View style={styles.daysGrid}>
            {availability.map((day) => {
              const active = selectedIsoDates.has(day.isoDate);
              const bookedStatus = bookedStatusByIsoDate.get(day.isoDate);
              const exception = day.available && day.unavailableFrom && day.unavailableTo
                ? `No disp. ${day.unavailableFrom}–${day.unavailableTo}`
                : null;
              return (
                <View key={day.isoDate} style={styles.dayColumn}>
                  <Text style={styles.dayLabel}>{day.dayLabel}</Text>
                  <Text style={styles.dayPreTag}>{day.isPreTournament ? 'Previo' : ' '}</Text>
                  <Pressable
                    disabled={!day.available || daysLocked || !!bookedStatus}
                    onPress={() => toggleDay(day)}
                    style={[
                      styles.slotPill,
                      !day.available && styles.slotPillDisabled,
                      active && styles.slotPillActive,
                      !!bookedStatus && styles.slotPillBooked,
                    ]}
                  >
                    <Text
                      style={[
                        styles.slotLabel,
                        !day.available && styles.slotLabelDisabled,
                        active && styles.slotLabelActive,
                        !!bookedStatus && styles.slotLabelBooked,
                      ]}
                    >
                      {bookedStatus ? BOOKING_HISTORY_STATUS_LABELS[STATUS_MAP[bookedStatus]] : 'Disponible'}
                    </Text>
                  </Pressable>
                  {exception && <Text style={styles.dayException}>{exception}</Text>}
                </View>
              );
            })}
          </View>
          {selectedDays.length > 0 && (
            <Text style={styles.hintSelected}>Elegiste: {selectedDays.map((d) => d.dayLabel).join(', ')}</Text>
          )}
        </Section>

        <Section label="Nota para el entrenador (opcional)">
          <IconTextInput
            icon="chatbubble-ellipses-outline"
            style={styles.noteInput}
            placeholder={`Ej. ${trainerName.split(' ')[0]}, es su primer torneo nacional…`}
            value={note}
            onChangeText={setNote}
            multiline
          />
        </Section>
      </ScrollView>

      <View style={styles.footer}>
        {error && <Text style={styles.errorText}>{error}</Text>}
        <Text style={styles.footerNote}>
          {rateMode === 'per_tournament'
            ? `$${total} · una sola vez por todo el torneo · sin costo de viáticos`
            : `$${price}/día × ${selectedDays.length || 0} = $${total} · sin costo de viáticos`}
        </Text>
        <Pressable
          style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
          disabled={!canContinue}
          onPress={handleContinue}
        >
          {submitting ? (
            <ActivityIndicator color={colors.courtBlueDeep} />
          ) : (
            <View style={styles.continueContent}>
              <Text style={styles.continueLabel}>{error ? 'Reintentar' : 'Enviar solicitud'}</Text>
              <Ionicons name="arrow-forward-outline" size={18} color={colors.courtBlueDeep} />
            </View>
          )}
        </Pressable>
      </View>
      </KeyboardAvoidingView>
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
  flexArea: {
    flex: 1,
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
  headerText: {
    flex: 1,
    marginLeft: 12,
  },
  trainerName: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
  },
  tournamentMeta: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 2,
  },
  playerMeta: {
    color: colors.textDim,
    fontSize: 11,
    marginTop: 2,
  },
  content: {
    padding: 20,
    paddingBottom: 24,
  },
  introCard: {
    backgroundColor: withOpacity(colors.courtBlue, 0.08),
    borderRadius: radius,
    borderWidth: 1,
    borderColor: withOpacity(colors.courtBlue, 0.25),
    padding: 14,
    marginBottom: 22,
  },
  introHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  introTitle: {
    color: colors.courtBlue,
    fontSize: 13,
    fontWeight: '800',
  },
  introStep: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  introDismiss: {
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  introDismissLabel: {
    color: colors.courtBlue,
    fontSize: 12,
    fontWeight: '700',
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
  multiDayTip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  multiDayTipText: {
    flex: 1,
    color: colors.courtBlue,
    fontSize: 12,
    fontWeight: '600',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    rowGap: 14,
    columnGap: 6,
    marginBottom: 12,
  },
  dayColumn: {
    // Máximo 5 columnas por fila (mismo criterio que TrainerProfileScreen#availabilityColumn) —
    // 18% en vez de 100/5=20% para dejarle margen a columnGap y que el 6to día efectivamente baje.
    width: '18%',
  },
  dayLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  dayPreTag: {
    color: colors.courtBlue,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: -4,
    marginBottom: 6,
  },
  dayException: {
    color: colors.errorCoral,
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
  },
  slotPill: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 6,
    borderWidth: 1.5,
    borderColor: colors.borderSoft,
    backgroundColor: colors.panel,
  },
  slotPillDisabled: {
    opacity: 0.4,
  },
  slotPillActive: {
    borderColor: colors.ballLime,
    backgroundColor: withOpacity(colors.ballLime, 0.16),
  },
  // Distinto de slotPillDisabled (día que el coach no ofrece) — este es un día que el propio
  // padre ya solicitó, así que se mantiene a opacidad completa y con el acento de la app en vez
  // de leer como "no disponible".
  slotPillBooked: {
    borderColor: colors.courtBlue,
    backgroundColor: withOpacity(colors.courtBlue, 0.12),
  },
  slotLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textDim,
  },
  slotLabelDisabled: {
    color: colors.textDim,
  },
  slotLabelActive: {
    color: colors.courtBlue,
  },
  slotLabelBooked: {
    color: colors.courtBlue,
  },
  hintSelected: {
    color: colors.courtBlue,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'left',
  },
  noteInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.panel,
    padding: 16,
  },
  footerNote: {
    color: colors.textDim,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
  },
  errorText: {
    color: colors.errorCoral,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
  },
  continueButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    backgroundColor: withOpacity(colors.ballLime, 0.3),
  },
  continueContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  continueLabel: {
    color: colors.courtBlueDeep,
    fontSize: 15,
    fontWeight: '800',
  },
});
