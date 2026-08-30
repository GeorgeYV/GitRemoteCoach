import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { MatchProvider, useMatch } from '../context/MatchContext';
import { colors } from '../lib/theme';
import { MatchConfig } from '../lib/types';
import {
  ApiError,
  BookingWithParticipants,
  Club,
  ClubCoachInvitationWithNames,
  CoachProfileWithTraining,
  CoachSearchResult,
  createOrGetMatch,
  getClubForAdmin,
  getCoachProfile,
  getSuspendedMatch,
  listClubInvitations,
  listCoachBookings,
  listConfiguredCoachTournamentIds,
  listPlayers,
  Match,
  Player,
  searchTournaments,
  SuspendedMatchSummary,
  TournamentSearchResult,
  TournamentSummary,
} from '../lib/api';
import { isUpcoming, toCoachBooking } from '../lib/coachBookingDisplay';
import { RateMode } from '../lib/api';
import { mockMatchConfig, mockRoundLabel } from '../mock/players';
import {
  AvailabilityDay,
  mockCarlosMedinaProfile,
  REAL_COMPLETED_BOOKING_ID,
} from '../mock/parentFlow';
import LiveCaptureView from './LiveCaptureView';
import MatchSummaryView from './MatchSummaryView';
import PlayerPickerScreen from './parent/PlayerPickerScreen';
import PlayerRegistrationScreen from './parent/PlayerRegistrationScreen';
import CoachTabBar from '../components/coach/CoachTabBar';
import CoachAvailabilityScreen from './coach/CoachAvailabilityScreen';
import CoachBookingCancelScreen from './coach/CoachBookingCancelScreen';
import CoachBookingDetailScreen from './coach/CoachBookingDetailScreen';
import CoachChatScreen from './coach/CoachChatScreen';
import CoachClubInvitationScreen from './coach/CoachClubInvitationScreen';
import CoachEarningsScreen from './coach/CoachEarningsScreen';
import CoachHomeScreen from './coach/CoachHomeScreen';
import CoachMatchSetupScreen from './coach/CoachMatchSetupScreen';
import CoachPreMatchReminderScreen from './coach/CoachPreMatchReminderScreen';
import CoachRegistrationScreen from './coach/CoachRegistrationScreen';
import CoachRequestInboxScreen from './coach/CoachRequestInboxScreen';
import CoachReputationScreen from './coach/CoachReputationScreen';
import CoachSessionHistoryScreen from './coach/CoachSessionHistoryScreen';
import CoachTournamentSearchScreen from './coach/CoachTournamentSearchScreen';
import TrainerListScreen from './parent/TrainerListScreen';
import TrainerProfileScreen from './parent/TrainerProfileScreen';
import BookingConfirmScreen, { CreatedDayBooking } from './parent/BookingConfirmScreen';
import BookingPaymentScreen from './parent/BookingPaymentScreen';
import BookingStatusScreen, { StatusDayBooking } from './parent/BookingStatusScreen';
import ClubHomeScreen from './club/ClubHomeScreen';
import ClubSettlementsScreen from './club/ClubSettlementsScreen';
import ClubTournamentListScreen from './club/ClubTournamentListScreen';
import ClubTournamentDetailScreen from './club/ClubTournamentDetailScreen';
import ClubTournamentShareScreen from './club/ClubTournamentShareScreen';
import ClubInviteCoachScreen from './club/ClubInviteCoachScreen';
import ClubCreateTournamentScreen from './club/ClubCreateTournamentScreen';
import ClubJoinScreen from './club/ClubJoinScreen';
import ClubRegistrationScreen from './club/ClubRegistrationScreen';
import ClubTabBar from '../components/club/ClubTabBar';

/** UUID real de Carlos Medina — coincide con coachAUserId en server/test/seed.ts. Toda la previsualización
 * del lado coach opera como este entrenador hasta que exista una sesión/login real. */
export const COACH_ID = mockCarlosMedinaProfile.trainer.id;

export function CoachFlow({
  roundLabel = mockRoundLabel,
  onExit,
}: {
  roundLabel?: string;
  /** Solo se usa en la pantalla de resumen final — volver a capturar/nuevo partido siguen sin
   * salida, la captura activa sigue siendo forward-only a propósito. */
  onExit?: () => void;
}) {
  const { matchState, reducerState, match } = useMatch();
  // match.status === 'completed' es la señal AUTORITATIVA (viene del servidor) — necesaria además
  // de matchState/reducerState (que solo reflejan lo que este dispositivo tiene en AsyncStorage)
  // porque un partido ya cerrado puede reabrirse en un dispositivo/instalación que nunca capturó
  // sus puntos localmente; sin este chequeo, ese dispositivo mostraría una captura en vivo en
  // 0-0 para un partido que el servidor ya considera terminado, con el riesgo real de que el
  // entrenador siga anotando puntos sobre un partido que ya se cerró.
  const showSummary = matchState.matchEnded || reducerState.matchClosed || match.status === 'completed';
  return showSummary ? <MatchSummaryView onGoHome={onExit} /> : <LiveCaptureView roundLabel={roundLabel} />;
}

/** Local two-step flow: pick a tournament, then configure days/rate within it. */
export function CoachAvailabilityFlow({
  onBack,
  tabBar,
  initialConfiguredFilter,
}: { onBack?: () => void; tabBar?: React.ReactNode; initialConfiguredFilter?: boolean } = {}) {
  const [tournament, setTournament] = useState<TournamentSearchResult | null>(null);

  if (!tournament) {
    return (
      <CoachTournamentSearchScreen
        onSelect={setTournament}
        onBack={onBack}
        tabBar={tabBar}
        initialConfiguredFilter={initialConfiguredFilter}
      />
    );
  }

  return <CoachAvailabilityScreen tournament={tournament} onBack={() => setTournament(null)} />;
}

/**
 * Local four-step flow: trainer profile → pick day/slot → wait for the coach's real acceptance → pay.
 * Payment requires the booking to already be 'accepted' server-side, so 'status' sits between 'confirm'
 * and 'payment' and polls the real booking until it is — it isn't just a post-payment receipt.
 */
interface SelectedTrainer {
  coachId: string;
  name: string;
  price: number;
  rateMode: RateMode;
  availability: AvailabilityDay[];
}

export function ParentBookingFlow({ initialTournamentId }: { initialTournamentId?: string } = {}) {
  const router = useRouter();
  const { token } = useAuth();
  const [step, setStep] = useState<'list' | 'profile' | 'confirm' | 'status' | 'payment'>('list');
  const [tournament, setTournament] = useState<TournamentSearchResult | null>(null);
  const [tournamentError, setTournamentError] = useState(false);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [selectedTrainer, setSelectedTrainer] = useState<SelectedTrainer | null>(null);
  // Fuerza un remount de BookingConfirmScreen cada vez que se entra a 'confirm' — sin esto React
  // reutiliza la misma instancia (mismo branch del render, sin key) y su estado interno de días ya
  // creados queda pegado entre un "reservar" y el siguiente, bloqueando la selección de días para
  // siempre después de la primera reserva exitosa con cualquier entrenador.
  const [confirmKey, setConfirmKey] = useState(0);
  // Reservas creadas al confirmar (una por día elegido); solo el subconjunto aceptado por el
  // coach (payableBookings) es lo que efectivamente se cobra en BookingPaymentScreen.
  const [createdBookings, setCreatedBookings] = useState<CreatedDayBooking[]>([]);
  const [payableBookings, setPayableBookings] = useState<StatusDayBooking[]>([]);
  const [note, setNote] = useState('');
  // undefined = todavía resolviendo; luego queda la lista real (puede estar vacía).
  const [players, setPlayers] = useState<Player[] | undefined>(undefined);
  // A quién se le reserva. Se autocompleta cuando solo hay un hijo/a; con 2+ hay que elegir
  // (PlayerPickerScreen) antes de seguir a BookingConfirmScreen.
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  useEffect(() => {
    // Sin token solo pasa en /dev-preview (fuera del guard de auth de app/_layout.tsx) — ahí no
    // hay sesión con la que pedir GET /players, así que se resuelve directo a "sin hijos/as".
    if (!token) {
      setPlayers([]);
      return;
    }
    listPlayers(token, { activeOnly: true })
      .then((result) => {
        setPlayers(result);
        if (result.length === 1) setSelectedPlayerId(result[0].id);
      })
      .catch(() => setPlayers([]));
  }, [token]);

  // ParentHomeScreen siempre manda el torneo elegido (tarjeta destacada o fila de "Torneos
  // activos") — ya no hay pantalla propia de búsqueda acá, así que solo queda resolverlo.
  // Si el torneo ya no aparece (torneo cerrado, id inválido, o no vino ninguno), se muestra
  // un estado de error en vez de dejar la pantalla en blanco.
  useEffect(() => {
    if (!initialTournamentId) {
      setTournamentError(true);
      return;
    }
    let cancelled = false;
    setTournamentError(false);
    searchTournaments()
      .then((results) => {
        if (cancelled) return;
        const match = results.find((t) => t.id === initialTournamentId);
        if (match) {
          setTournament(match);
        } else {
          setTournamentError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setTournamentError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [initialTournamentId]);

  if (tournamentError) {
    return (
      <View style={[styles.root, styles.centerState]}>
        <Text style={styles.centerStateText}>No se pudo cargar ese torneo.</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.centerStateText, styles.centerStateLink]}>Volver al inicio</Text>
        </Pressable>
      </View>
    );
  }

  if (!tournament) {
    return (
      <View style={[styles.root, styles.centerState]}>
        <ActivityIndicator color={colors.courtBlue} />
      </View>
    );
  }

  if (step === 'list') {
    return (
      <TrainerListScreen
        tournament={tournament}
        onBack={() => router.back()}
        onSelectTrainer={(coach: CoachSearchResult) => {
          setCoachId(coach.id);
          setStep('profile');
        }}
      />
    );
  }

  if (step === 'profile') {
    if (!coachId) return null;
    return (
      <TrainerProfileScreen
        coachId={coachId}
        tournament={tournament}
        onBack={() => setStep('list')}
        onReserve={(info) => {
          setSelectedTrainer(info);
          setConfirmKey((k) => k + 1);
          setStep('confirm');
        }}
      />
    );
  }

  if (step === 'confirm') {
    if (!selectedTrainer) return null;

    if (players === undefined) {
      return (
        <View style={[styles.root, styles.centerState]}>
          <ActivityIndicator color={colors.courtBlue} />
        </View>
      );
    }

    if (players.length === 0) {
      return (
        <PlayerRegistrationScreen
          onBack={() => setStep('profile')}
          onSubmit={(player) => {
            setPlayers([player]);
            setSelectedPlayerId(player.id);
          }}
        />
      );
    }

    if (!selectedPlayerId) {
      return (
        <PlayerPickerScreen
          players={players}
          onBack={() => setStep('profile')}
          onSelect={(player) => setSelectedPlayerId(player.id)}
        />
      );
    }

    return (
      <BookingConfirmScreen
        key={confirmKey}
        playerId={selectedPlayerId}
        playerName={players.find((p) => p.id === selectedPlayerId)?.fullName}
        coachId={selectedTrainer.coachId}
        tournament={tournament}
        trainerName={selectedTrainer.name}
        price={selectedTrainer.price}
        rateMode={selectedTrainer.rateMode}
        availability={selectedTrainer.availability}
        onBack={() => setStep('profile')}
        onContinue={(created, nextNote) => {
          setCreatedBookings(created);
          setNote(nextNote);
          setStep('status');
        }}
      />
    );
  }

  if (step === 'status') {
    if (createdBookings.length === 0 || !selectedTrainer) return null;
    return (
      <BookingStatusScreen
        bookings={createdBookings}
        trainerName={selectedTrainer.name}
        tournament={tournament}
        onAccepted={(accepted) => {
          setPayableBookings(accepted);
          setStep('payment');
        }}
        onDone={() => setStep('profile')}
        onSelectAlternative={(nextCoachId) => {
          setCoachId(nextCoachId);
          setSelectedTrainer(null);
          setCreatedBookings([]);
          setStep('profile');
        }}
      />
    );
  }

  if (payableBookings.length === 0 || !selectedTrainer) return null;

  return (
    <BookingPaymentScreen
      bookings={payableBookings}
      country={tournament.country ?? 'EC'}
      venue={tournament.venue}
      note={note}
      trainerName={selectedTrainer.name}
      tournamentName={tournament.name}
      onBack={() => setStep('status')}
      onConfirm={() => setStep('status')}
    />
  );
}

/** Local three-step flow: home dashboard → booking detail → cancel, all sharing one local booking list. */
export function CoachHomeFlow({ coachId, coachName }: { coachId: string; coachName: string }) {
  const { token, logout } = useAuth();
  const [bookings, setBookings] = useState<BookingWithParticipants[] | null>(null);
  const [rating, setRating] = useState('—');
  const [coachProfile, setCoachProfile] = useState<CoachProfileWithTraining | null>(null);
  const [pendingInvitation, setPendingInvitation] = useState<ClubCoachInvitationWithNames | null>(null);
  const [invitationRefreshKey, setInvitationRefreshKey] = useState(0);
  const [suspendedMatch, setSuspendedMatch] = useState<SuspendedMatchSummary | null>(null);
  // Píldora con la cantidad en "Mis torneos con disponibilidad" (Accesos rápidos) — ver
  // coachTournamentRepository.listConfiguredTournamentIdsForCoach: ya viene filtrado a vigentes.
  const [configuredTournamentsCount, setConfiguredTournamentsCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  // "Explora torneos disponibles" arranca en false, "Mis torneos con disponibilidad" en true —
  // mismo `step` ('availability') para las dos, solo cambia con qué filtro arranca la búsqueda.
  const [availabilityFilterOn, setAvailabilityFilterOn] = useState(false);
  const [step, setStep] = useState<
    | 'home'
    | 'detail'
    | 'cancel'
    | 'chat'
    | 'requests'
    | 'profile'
    | 'availability'
    | 'sessions'
    | 'earnings'
    | 'reputation'
    | 'invitation'
    | 'match'
    | 'resumeSuspended'
  >('home');

  useEffect(() => {
    if (!token) {
      setLoadError('No hay una sesión activa.');
      return;
    }
    let cancelled = false;
    setLoadError(null);
    Promise.all([listCoachBookings(token, coachId), getCoachProfile(coachId)])
      .then(([bookingList, profile]) => {
        if (cancelled) return;
        setBookings(bookingList);
        setRating(profile.profile.ratingAvg);
        setCoachProfile(profile);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : 'No se pudo cargar tu panel.');
      });
    return () => {
      cancelled = true;
    };
  }, [coachId, token]);

  // Depende de `step`, no solo de montar una vez: sin esto, configurar un torneo nuevo desde
  // "Explora torneos disponibles" y volver a Inicio dejaba la píldora con el número viejo hasta
  // recargar toda la app.
  useEffect(() => {
    if (!token || step !== 'home') return;
    let cancelled = false;
    listConfiguredCoachTournamentIds(token, coachId)
      .then(({ tournamentIds }) => {
        if (!cancelled) setConfiguredTournamentsCount(tournamentIds.length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [coachId, token, step]);

  // Invitaciones de club pendientes (CoachClubInvitationScreen) — separado del efecto de arriba para
  // poder refrescar solo esto al volver de la pantalla de invitación, sin recargar todo el panel.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listClubInvitations(token, coachId).then((result) => {
      if (!cancelled) setPendingInvitation(result[0] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [coachId, token, invitationRefreshKey]);

  // Banner prioritario de "Ajuste manual"/pausa: a lo sumo un partido suspendido a la vez en la
  // práctica, ya que hay que retomarlo antes de poder suspender otro.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getSuspendedMatch(token, coachId).then((result) => {
      if (!cancelled) setSuspendedMatch(result);
    });
    return () => {
      cancelled = true;
    };
  }, [coachId, token]);

  // Todas las próximas, ordenadas por fecha — CoachHomeScreen muestra las que caen en la fecha
  // más próxima (puede ser más de una) y linkea al resto vía "Ver todas".
  const upcomingBookingsRaw = (bookings ?? [])
    .filter(isUpcoming)
    .sort((a, b) => new Date(a.matchDatetime).getTime() - new Date(b.matchDatetime).getTime());
  const upcomingBookings = upcomingBookingsRaw.map(toCoachBooking);
  const nextDate = upcomingBookings[0]?.date;
  const nextSessions = nextDate ? upcomingBookings.filter((b) => b.date === nextDate) : [];

  // Booking elegido al tocar una tarjeta en el home — puede ser cualquiera de nextSessions, no
  // necesariamente la más próxima, así que detail/cancel/chat/match se resuelven contra esto.
  const selectedBookingRaw = bookings?.find((b) => b.id === selectedBookingId) ?? null;
  const selectedBooking = selectedBookingRaw ? toCoachBooking(selectedBookingRaw) : undefined;

  const suspendedBookingRaw = suspendedMatch ? bookings?.find((b) => b.id === suspendedMatch.bookingId) ?? null : null;
  const pendingRequests = bookings?.filter((b) => b.status === 'requested').length ?? 0;
  // 'paid' siempre está pendiente de liberar; 'completed' lo está hasta que el torneo cierre y
  // settleTournamentCoachPayouts le asigne un coach_payout_id (ver CoachEarningsScreen, mismo
  // criterio) — status==='paid' solo no alcanza, un partido ya completado sigue "por liberar".
  const pendingEarnings =
    bookings
      ?.filter((b) => b.status === 'paid' || (b.status === 'completed' && b.coachPayoutId === null))
      .reduce((sum, b) => sum + Number(b.coachNetAmount ?? 0), 0) ?? 0;

  function confirmCancel(_reason: string) {
    if (!selectedBookingRaw) return;
    const targetId = selectedBookingRaw.id;
    setBookings((prev) => prev?.map((b) => (b.id === targetId ? { ...b, status: 'cancelled' } : b)) ?? null);
    setStep('home');
  }

  function handleBookingCompleted() {
    if (!selectedBookingRaw) return;
    const targetId = selectedBookingRaw.id;
    setBookings((prev) => prev?.map((b) => (b.id === targetId ? { ...b, status: 'completed' } : b)) ?? null);
    setStep('home');
  }

  // "Ir al inicio" desde el resumen final del partido — el servidor ya completó la reserva sola
  // si ya estaba pagada (matchService#maybeCompleteBookingForFinishedMatch, disparado al terminar
  // el partido); si el pago todavía no se verificó, sigue como estaba. No hay forma honesta de
  // adivinar cuál de las dos pasó desde acá, así que se refresca la lista real en vez de simular
  // un estado local — a diferencia de handleBookingCompleted, que sí sabe con certeza que
  // completeBooking ya corrió porque lo esperó él mismo.
  function completeBookingAndGoHome() {
    setStep('home');
    if (!token) return;
    listCoachBookings(token, coachId)
      .then(setBookings)
      .catch(() => {
        // silencioso: si falla el refetch, el próximo montaje del panel va a traer el estado
        // real igual — no vale la pena bloquear la navegación por esto.
      });
  }

  if (step === 'detail' && selectedBooking) {
    return (
      <CoachBookingDetailScreen
        booking={selectedBooking}
        onBack={() => setStep('home')}
        onCancel={() => setStep('cancel')}
        onChat={() => setStep('chat')}
        onStartMatch={selectedBooking.status === 'confirmed' ? () => setStep('match') : undefined}
        onCompleted={handleBookingCompleted}
      />
    );
  }

  if (step === 'cancel' && selectedBooking) {
    return (
      <CoachBookingCancelScreen booking={selectedBooking} onBack={() => setStep('detail')} onConfirm={confirmCancel} />
    );
  }

  if (step === 'chat' && selectedBooking) {
    return <CoachChatScreen booking={selectedBooking} onBack={() => setStep('detail')} />;
  }

  if (step === 'resumeSuspended' && suspendedBookingRaw) {
    // Mismo flujo que "Iniciar partido" — createOrGetMatch es idempotente por booking_id, así
    // que devuelve la misma fila 'suspended' y LiveCaptureView muestra la pantalla de reanudar.
    return (
      <CoachMatchDayFlow
        booking={suspendedBookingRaw}
        onBack={() => setStep('home')}
        onExit={completeBookingAndGoHome}
      />
    );
  }

  if (step === 'match' && selectedBookingRaw) {
    // Sin onBack durante la captura activa (a propósito, igual que CoachCapturePreview en
    // /dev-preview) — onExit solo habilita "Ir al inicio" desde la pantalla de resumen final.
    // onBack solo se usa en el paso 'reminder', antes de arrancar a capturar.
    return (
      <CoachMatchDayFlow
        booking={selectedBookingRaw}
        onBack={() => setStep('detail')}
        onExit={completeBookingAndGoHome}
      />
    );
  }

  if (step === 'requests') {
    return (
      <CoachRequestInboxScreen
        coachId={coachId}
        onBack={() => setStep('home')}
        onOpenAvailability={() => {
          setAvailabilityFilterOn(false);
          setStep('availability');
        }}
        tabBar={<CoachTabBar active="requests" onSelect={setStep} />}
      />
    );
  }

  if (step === 'profile' && coachProfile) {
    return (
      <CoachRegistrationScreen
        profile={coachProfile}
        onBack={() => setStep('home')}
        onSubmit={() => {
          getCoachProfile(coachId).then((updated) => {
            setRating(updated.profile.ratingAvg);
            setCoachProfile(updated);
          });
          setStep('home');
        }}
        tabBar={<CoachTabBar active="profile" onSelect={setStep} />}
      />
    );
  }

  if (step === 'availability') {
    return (
      <CoachAvailabilityFlow
        onBack={() => setStep('home')}
        tabBar={<CoachTabBar active="availability" onSelect={setStep} />}
        initialConfiguredFilter={availabilityFilterOn}
      />
    );
  }

  if (step === 'sessions') {
    return <CoachSessionHistoryScreen coachId={coachId} onBack={() => setStep('home')} />;
  }

  if (step === 'earnings') {
    return (
      <CoachEarningsScreen
        coachId={coachId}
        onBack={() => setStep('home')}
        tabBar={<CoachTabBar active="earnings" onSelect={setStep} />}
      />
    );
  }

  if (step === 'reputation') {
    return <CoachReputationScreen coachId={coachId} coachName={coachName} onBack={() => setStep('home')} />;
  }

  if (step === 'invitation') {
    return (
      <CoachClubInvitationScreen
        coachId={coachId}
        onBack={() => {
          setStep('home');
          setInvitationRefreshKey((k) => k + 1);
        }}
      />
    );
  }

  if (loadError) {
    return (
      <View style={[styles.root, styles.centerState]}>
        <Text style={styles.centerStateText}>{loadError}</Text>
      </View>
    );
  }

  if (!bookings) {
    return (
      <View style={[styles.root, styles.centerState]}>
        <ActivityIndicator color={colors.courtBlue} />
      </View>
    );
  }

  return (
    <CoachHomeScreen
      coachName={coachName}
      rating={rating}
      pendingRequests={pendingRequests}
      pendingEarnings={pendingEarnings}
      nextSessions={nextSessions}
      upcomingCount={upcomingBookings.length}
      pendingInvitation={pendingInvitation}
      suspendedMatchPlayerName={suspendedBookingRaw ? suspendedMatch?.playerName : undefined}
      onOpenSuspendedMatch={suspendedBookingRaw ? () => setStep('resumeSuspended') : undefined}
      onOpenBooking={(bookingId) => {
        setSelectedBookingId(bookingId);
        setStep('detail');
      }}
      onOpenRequests={() => setStep('requests')}
      onOpenSessions={() => setStep('sessions')}
      onOpenEarnings={() => setStep('earnings')}
      onOpenReputation={() => setStep('reputation')}
      onOpenInvitation={() => setStep('invitation')}
      onOpenAvailability={() => {
        setAvailabilityFilterOn(false);
        setStep('availability');
      }}
      onOpenConfiguredTournaments={() => {
        setAvailabilityFilterOn(true);
        setStep('availability');
      }}
      configuredTournamentsCount={configuredTournamentsCount}
      onLogout={logout}
      tabBar={<CoachTabBar active="home" onSelect={setStep} />}
    />
  );
}

/**
 * Local flow: pre-match reminder (real booking data, editable cancha/punto de encuentro) →
 * confirm match setup → resolve/create the server-side `matches` row for this booking → the
 * existing, unmodified live-capture wireframe. Chat is a side-step off the reminder screen,
 * back to it on close.
 *
 * Si esta reserva YA tiene una fila `matches` (en curso, pausado, suspendido o ya terminado —
 * booking.matchStatus != null), reminder/setup se saltan por completo: createOrGetMatch es
 * idempotente por bookingId (ON CONFLICT DO NOTHING) y de todas formas ignora silenciosamente
 * cualquier formato/rival que el entrenador reescriba ahí, así que volver a mostrar ese formulario
 * no logra nada y encima arriesga que el MatchConfig local (reglas de scoring) diverja de los
 * puntos ya grabados con la configuración original. El config sale directo de la fila real.
 */
export function CoachMatchDayFlow({
  booking: initialBooking,
  onBack,
  onExit,
}: {
  booking: BookingWithParticipants;
  onBack?: () => void;
  onExit?: () => void;
}) {
  const { token } = useAuth();
  const [booking, setBooking] = useState(initialBooking);
  const bookingId = booking.id;
  const hasExistingMatch = initialBooking.matchStatus != null;
  const [step, setStep] = useState<'reminder' | 'setup' | 'loadingMatch' | 'live' | 'chat'>(
    hasExistingMatch ? 'loadingMatch' : 'reminder'
  );
  const [session, setSession] = useState<{ config: MatchConfig; roundLabel: string } | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);

  useEffect(() => {
    if (step !== 'loadingMatch' || hasExistingMatch) return;
    if (!session) return;
    if (!token) {
      setMatchError('No hay una sesión activa.');
      return;
    }
    let cancelled = false;
    setMatchError(null);
    createOrGetMatch(token, {
      bookingId,
      player2Label: session.config.player2Name,
      format: session.config.format,
      noAd: session.config.noAd,
      initialServer: session.config.initialServer,
      captureMode: 'detallada',
    })
      .then((createdMatch) => {
        if (cancelled) return;
        setMatch(createdMatch);
        setStep('live');
      })
      .catch((err) => {
        if (cancelled) return;
        setMatchError(err instanceof ApiError ? err.message : 'No se pudo iniciar el partido.');
      });
    return () => {
      cancelled = true;
    };
  }, [step, session, bookingId, token, hasExistingMatch]);

  useEffect(() => {
    if (step !== 'loadingMatch' || !hasExistingMatch) return;
    if (!token) {
      setMatchError('No hay una sesión activa.');
      return;
    }
    let cancelled = false;
    setMatchError(null);
    // player2Label/format/noAd/initialServer acá son solo el fallback si por alguna razón la fila
    // no existiera todavía — con hasExistingMatch=true, ON CONFLICT DO NOTHING los descarta y
    // devuelve la fila real de todas formas.
    createOrGetMatch(token, {
      bookingId,
      player2Label: 'Rival',
      format: 'best_of_3',
      noAd: false,
      initialServer: 'player1',
      captureMode: 'detallada',
    })
      .then((createdMatch) => {
        if (cancelled) return;
        setSession({
          config: {
            format: createdMatch.format,
            noAd: createdMatch.noAd,
            player1Name: booking.playerName,
            player2Name: createdMatch.player2Label,
            initialServer: createdMatch.initialServer,
          },
          roundLabel: booking.ageCategory,
        });
        setMatch(createdMatch);
        setStep('live');
      })
      .catch((err) => {
        if (cancelled) return;
        setMatchError(err instanceof ApiError ? err.message : 'No se pudo abrir el partido.');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, hasExistingMatch, bookingId, token]);

  if (step === 'reminder') {
    return (
      <CoachPreMatchReminderScreen
        booking={booking}
        onBack={onBack}
        onStartCapture={() => setStep('setup')}
        onOpenChat={() => setStep('chat')}
        onMeetingSaved={(details) => setBooking((b) => ({ ...b, ...details }))}
        onRescheduled={(updated) =>
          setBooking((b) => ({ ...b, matchDatetime: updated.matchDatetime, scheduleConfirmed: updated.scheduleConfirmed }))
        }
      />
    );
  }

  if (step === 'chat') {
    return <CoachChatScreen booking={toCoachBooking(booking)} onBack={() => setStep('reminder')} />;
  }

  if (step === 'setup') {
    return (
      <CoachMatchSetupScreen
        playerName={booking.playerName}
        category={booking.ageCategory}
        onBack={() => setStep('reminder')}
        onStart={(config, roundLabel) => {
          setSession({ config, roundLabel });
          setStep('loadingMatch');
        }}
      />
    );
  }

  if (step === 'loadingMatch') {
    return (
      <View style={[styles.root, styles.centerState]}>
        {matchError ? (
          <Text style={styles.centerStateText}>{matchError}</Text>
        ) : (
          <ActivityIndicator color={colors.courtBlue} />
        )}
      </View>
    );
  }

  if (!session || !match) return null;

  return (
    <MatchProvider config={session.config} initialMatch={match}>
      <CoachFlow roundLabel={session.roundLabel} onExit={onExit} />
    </MatchProvider>
  );
}

/** Atajo de previsualización directo a la captura (salta reminder/setup) — misma
 * persistencia real que CoachMatchDayFlow, contra el mismo booking fixture. */
export function CoachCapturePreview() {
  const { token } = useAuth();
  const [match, setMatch] = useState<Match | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('No hay una sesión activa.');
      return;
    }
    let cancelled = false;
    createOrGetMatch(token, {
      bookingId: REAL_COMPLETED_BOOKING_ID,
      player2Label: mockMatchConfig.player2Name,
      format: mockMatchConfig.format,
      noAd: mockMatchConfig.noAd,
      initialServer: mockMatchConfig.initialServer,
      captureMode: 'detallada',
    })
      .then((createdMatch) => {
        if (!cancelled) setMatch(createdMatch);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'No se pudo iniciar el partido.');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) {
    return (
      <View style={[styles.root, styles.centerState]}>
        <Text style={styles.centerStateText}>{error}</Text>
      </View>
    );
  }

  if (!match) {
    return (
      <View style={[styles.root, styles.centerState]}>
        <ActivityIndicator color={colors.courtBlue} />
      </View>
    );
  }

  return (
    <MatchProvider config={mockMatchConfig} initialMatch={match}>
      <CoachFlow />
    </MatchProvider>
  );
}

/** Local flow: lista de torneos del club (con opción de crear uno nuevo) → detalle (roster +
 * liquidar) → invitar entrenador. */
export function ClubTournamentFlow({
  clubId,
  clubName,
  onBack,
  tabBar,
}: {
  clubId: string;
  clubName: string;
  onBack?: () => void;
  tabBar?: React.ReactNode;
}) {
  const [tournament, setTournament] = useState<TournamentSummary | null>(null);
  const [inviting, setInviting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  if (creating) {
    return (
      <ClubCreateTournamentScreen
        clubId={clubId}
        onBack={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          setRefreshKey((k) => k + 1);
        }}
      />
    );
  }

  if (editing && tournament) {
    return (
      <ClubCreateTournamentScreen
        clubId={clubId}
        tournament={tournament}
        onBack={() => setEditing(false)}
        onSaved={(saved) => {
          setTournament(saved);
          setEditing(false);
          setRefreshKey((k) => k + 1);
        }}
      />
    );
  }

  if (!tournament) {
    return (
      <ClubTournamentListScreen
        clubId={clubId}
        clubName={clubName}
        refreshKey={refreshKey}
        onSelect={setTournament}
        onCreate={() => setCreating(true)}
        onBack={onBack}
        tabBar={tabBar}
      />
    );
  }

  if (inviting) {
    return (
      <ClubInviteCoachScreen
        clubId={clubId}
        tournamentId={tournament.id}
        onBack={() => setInviting(false)}
      />
    );
  }

  if (sharing) {
    return <ClubTournamentShareScreen tournament={tournament} onBack={() => setSharing(false)} />;
  }

  return (
    <ClubTournamentDetailScreen
      tournament={tournament}
      onBack={() => setTournament(null)}
      onInvite={() => setInviting(true)}
      onShare={() => setSharing(true)}
      onEdit={() => setEditing(true)}
    />
  );
}

/**
 * Local three-step flow para el club_admin autenticado: inicio → torneos → liquidaciones.
 * Lifted tal cual del switch inline que tenía ScreenPreviewSwitcher para 'clubHome'. Primero
 * resuelve qué club administra este usuario (club_admins no es 1:1 con users — ver
 * clubService.getClubForAdmin) antes de montar cualquier pantalla.
 */
export function ClubFlow({ adminUserId }: { adminUserId: string }) {
  const { logout } = useAuth();
  const [club, setClub] = useState<Club | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 404 en GET /club-admins/:userId/club no es un error real: significa que este club_admin
  // todavía no tiene ningún club vinculado — antes esto dejaba a ClubFlow atascado para siempre
  // en un mensaje de error estático. Ahora se resuelve con un onboarding real: ClubJoinScreen
  // primero (invitación pendiente / buscar y pedir acceso a uno existente), con la opción de
  // igual crear uno nuevo (ver decisión #42 en db/schema.sql).
  const [needsRegistration, setNeedsRegistration] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setNeedsRegistration(false);
    setCreatingNew(false);
    getClubForAdmin(adminUserId)
      .then((result) => {
        if (!cancelled) setClub(result);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setNeedsRegistration(true);
          return;
        }
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar tu club o federación.');
      });
    return () => {
      cancelled = true;
    };
  }, [adminUserId]);

  const [screen, setScreen] = useState<'home' | 'tournaments' | 'settlements' | 'editProfile'>('home');

  if (needsRegistration && creatingNew) {
    return (
      <ClubRegistrationScreen
        onBack={() => setCreatingNew(false)}
        onSuccess={(newClub) => { setClub(newClub); setNeedsRegistration(false); }}
      />
    );
  }

  if (needsRegistration) {
    return (
      <ClubJoinScreen
        onJoined={(joinedClub) => { setClub(joinedClub); setNeedsRegistration(false); }}
        onCreateNew={() => setCreatingNew(true)}
      />
    );
  }

  if (screen === 'editProfile' && club) {
    return (
      <ClubRegistrationScreen
        club={club}
        onBack={() => setScreen('home')}
        onSuccess={(updated) => {
          setClub(updated);
          setScreen('home');
        }}
        tabBar={<ClubTabBar active="editProfile" onSelect={setScreen} />}
      />
    );
  }

  if (error) {
    return (
      <View style={[styles.root, styles.centerState]}>
        <Text style={styles.centerStateText}>{error}</Text>
      </View>
    );
  }

  if (!club) {
    return (
      <View style={[styles.root, styles.centerState]}>
        <ActivityIndicator color={colors.courtBlue} />
      </View>
    );
  }

  if (screen === 'tournaments') {
    return (
      <ClubTournamentFlow
        clubId={club.id}
        clubName={club.name}
        onBack={() => setScreen('home')}
        tabBar={<ClubTabBar active="tournaments" onSelect={setScreen} />}
      />
    );
  }

  if (screen === 'settlements') {
    return (
      <ClubSettlementsScreen
        clubId={club.id}
        clubName={club.name}
        onBack={() => setScreen('home')}
        tabBar={<ClubTabBar active="settlements" onSelect={setScreen} />}
      />
    );
  }

  return (
    <ClubHomeScreen
      clubId={club.id}
      onOpenTournaments={() => setScreen('tournaments')}
      onOpenSettlements={() => setScreen('settlements')}
      onOpenProfile={() => setScreen('editProfile')}
      onLogout={logout}
      tabBar={<ClubTabBar active="home" onSelect={setScreen} />}
    />
  );
}

export const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  centerStateText: {
    color: colors.textDim,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  centerStateLink: {
    color: colors.courtBlue,
    fontWeight: '700',
    marginTop: 12,
  },
});
