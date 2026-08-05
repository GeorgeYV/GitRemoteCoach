import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MatchProvider, useMatch } from './context/MatchContext';
import { colors } from './lib/theme';
import { mockMatchConfig, mockRoundLabel } from './mock/players';
import LiveCaptureView from './screens/LiveCaptureView';
import MatchSummaryView from './screens/MatchSummaryView';
import CoachAvailabilityScreen from './screens/coach/CoachAvailabilityScreen';
import CoachBookingCancelScreen from './screens/coach/CoachBookingCancelScreen';
import CoachBookingDetailScreen from './screens/coach/CoachBookingDetailScreen';
import CoachChatScreen from './screens/coach/CoachChatScreen';
import CoachClubInvitationScreen from './screens/coach/CoachClubInvitationScreen';
import CoachEarningsScreen from './screens/coach/CoachEarningsScreen';
import CoachHomeScreen from './screens/coach/CoachHomeScreen';
import CoachMatchSetupScreen from './screens/coach/CoachMatchSetupScreen';
import CoachPreMatchReminderScreen from './screens/coach/CoachPreMatchReminderScreen';
import CoachRegistrationScreen from './screens/coach/CoachRegistrationScreen';
import CoachReputationScreen from './screens/coach/CoachReputationScreen';
import CoachRequestInboxScreen from './screens/coach/CoachRequestInboxScreen';
import CoachSessionHistoryScreen from './screens/coach/CoachSessionHistoryScreen';
import CoachTournamentSearchScreen from './screens/coach/CoachTournamentSearchScreen';
import CoachVerificationPendingScreen from './screens/coach/CoachVerificationPendingScreen';
import ParentHomeScreen from './screens/parent/ParentHomeScreen';
import TrainerListScreen from './screens/parent/TrainerListScreen';
import TrainerProfileScreen from './screens/parent/TrainerProfileScreen';
import BookingConfirmScreen from './screens/parent/BookingConfirmScreen';
import BookingPaymentScreen from './screens/parent/BookingPaymentScreen';
import BookingStatusScreen from './screens/parent/BookingStatusScreen';
import ParentChatScreen from './screens/parent/ParentChatScreen';
import BookingHistoryScreen from './screens/parent/BookingHistoryScreen';
import ClubHomeScreen from './screens/club/ClubHomeScreen';
import ClubSettlementsScreen from './screens/club/ClubSettlementsScreen';
import ClubTournamentListScreen from './screens/club/ClubTournamentListScreen';
import ClubTournamentDetailScreen from './screens/club/ClubTournamentDetailScreen';
import ClubInviteCoachScreen from './screens/club/ClubInviteCoachScreen';
import { BookingSlotSelection, mockCarlosMedinaProfile, REAL_COMPLETED_BOOKING_ID, Tournament } from './mock/parentFlow';
import { MatchConfig } from './lib/types';
import {
  ApiError,
  BookingWithParticipants,
  cancelBooking,
  createOrGetMatch,
  getCoachProfile,
  listCoachBookings,
  TournamentSummary,
} from './lib/api';
import { isUpcoming, toCoachBooking } from './lib/coachBookingDisplay';

type PreviewScreen =
  | 'coachCapture'
  | 'coachRegister'
  | 'coachPending'
  | 'coachHome'
  | 'coachAvailability'
  | 'coachInbox'
  | 'coachChat'
  | 'coachPreMatch'
  | 'coachSessions'
  | 'coachEarnings'
  | 'coachReputation'
  | 'coachClubInvitation'
  | 'parentHome'
  | 'parentList'
  | 'parentProfile'
  | 'parentChat'
  | 'parentHistory'
  | 'clubSettlements'
  | 'clubTournaments'
  | 'clubHome';

const PREVIEW_OPTIONS: { key: PreviewScreen; label: string }[] = [
  { key: 'parentHome', label: 'Padre · Inicio' },
  { key: 'parentList', label: 'Padre · Lista' },
  { key: 'parentProfile', label: 'Padre · Reservar' },
  { key: 'parentChat', label: 'Padre · Chat' },
  { key: 'parentHistory', label: 'Padre · Historial' },
  { key: 'coachRegister', label: 'Coach · Registro' },
  { key: 'coachPending', label: 'Coach · Verificación' },
  { key: 'coachHome', label: 'Coach · Inicio' },
  { key: 'coachAvailability', label: 'Coach · Disponibilidad' },
  { key: 'coachInbox', label: 'Coach · Solicitudes' },
  { key: 'coachChat', label: 'Coach · Chat' },
  { key: 'coachPreMatch', label: 'Coach · Día de partido' },
  { key: 'coachCapture', label: 'Coach · Captura' },
  { key: 'coachSessions', label: 'Coach · Sesiones' },
  { key: 'coachEarnings', label: 'Coach · Ingresos' },
  { key: 'coachReputation', label: 'Coach · Reputación' },
  { key: 'coachClubInvitation', label: 'Coach · Invitación club' },
  { key: 'clubHome', label: 'Club · Inicio' },
  { key: 'clubTournaments', label: 'Club · Torneos' },
  { key: 'clubSettlements', label: 'Club · Liquidaciones' },
];

/** UUID real de Carlos Medina — coincide con coachAUserId en server/test/seed.ts. Toda la previsualización
 * del lado coach opera como este entrenador hasta que exista una sesión/login real. */
const COACH_ID = mockCarlosMedinaProfile.trainer.id;

function CoachFlow({ roundLabel = mockRoundLabel }: { roundLabel?: string }) {
  const { matchState, reducerState } = useMatch();
  const showSummary = matchState.matchEnded || reducerState.matchClosed;
  return showSummary ? <MatchSummaryView /> : <LiveCaptureView roundLabel={roundLabel} />;
}

/** Local two-step flow: pick a tournament, then configure days/rate within it. */
function CoachAvailabilityFlow() {
  const [tournament, setTournament] = useState<Tournament | null>(null);

  if (!tournament) {
    return <CoachTournamentSearchScreen onSelect={setTournament} />;
  }

  return <CoachAvailabilityScreen tournament={tournament} onBack={() => setTournament(null)} />;
}

/**
 * Local four-step flow: trainer profile → pick day/slot → wait for the coach's real acceptance → pay.
 * Payment requires the booking to already be 'accepted' server-side, so 'status' sits between 'confirm'
 * and 'payment' and polls the real booking until it is — it isn't just a post-payment receipt.
 */
function ParentBookingFlow() {
  const [step, setStep] = useState<'profile' | 'confirm' | 'status' | 'payment'>('profile');
  const [selection, setSelection] = useState<BookingSlotSelection | null>(null);
  const [note, setNote] = useState('');
  const [bookingId, setBookingId] = useState<string | null>(null);

  if (step === 'profile') {
    return <TrainerProfileScreen onReserve={() => setStep('confirm')} />;
  }

  if (step === 'confirm') {
    return (
      <BookingConfirmScreen
        onBack={() => setStep('profile')}
        onContinue={(nextSelection, nextNote, nextBookingId) => {
          setSelection(nextSelection);
          setNote(nextNote);
          setBookingId(nextBookingId);
          setStep('status');
        }}
      />
    );
  }

  if (step === 'status') {
    if (!selection || !bookingId) return null;
    return (
      <BookingStatusScreen
        bookingId={bookingId}
        selection={selection}
        onAccepted={() => setStep('payment')}
        onDone={() => setStep('profile')}
      />
    );
  }

  if (!selection || !bookingId) return null;

  return (
    <BookingPaymentScreen
      bookingId={bookingId}
      selection={selection}
      note={note}
      onBack={() => setStep('status')}
      onConfirm={() => setStep('status')}
    />
  );
}

/** Local three-step flow: home dashboard → booking detail → cancel, all sharing one local booking list. */
function CoachHomeFlow() {
  const [bookings, setBookings] = useState<BookingWithParticipants[] | null>(null);
  const [rating, setRating] = useState('—');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<'home' | 'detail' | 'cancel' | 'chat'>('home');

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    Promise.all([listCoachBookings(COACH_ID), getCoachProfile(COACH_ID)])
      .then(([bookingList, profile]) => {
        if (cancelled) return;
        setBookings(bookingList);
        setRating(profile.profile.ratingAvg);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : 'No se pudo cargar tu panel.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const nextBookingRaw =
    bookings
      ?.filter(isUpcoming)
      .sort((a, b) => new Date(a.matchDatetime).getTime() - new Date(b.matchDatetime).getTime())[0] ?? null;
  const nextBooking = nextBookingRaw ? toCoachBooking(nextBookingRaw) : undefined;
  const pendingRequests = bookings?.filter((b) => b.status === 'requested').length ?? 0;
  const pendingEarnings =
    bookings?.filter((b) => b.status === 'paid').reduce((sum, b) => sum + Number(b.coachNetAmount ?? 0), 0) ?? 0;

  function confirmCancel(_reason: string) {
    if (!nextBookingRaw) return;
    const targetId = nextBookingRaw.id;
    setBookings((prev) => prev?.map((b) => (b.id === targetId ? { ...b, status: 'cancelled' } : b)) ?? null);
    setStep('home');
  }

  if (step === 'detail' && nextBooking) {
    return (
      <CoachBookingDetailScreen
        booking={nextBooking}
        onBack={() => setStep('home')}
        onCancel={() => setStep('cancel')}
        onChat={() => setStep('chat')}
      />
    );
  }

  if (step === 'cancel' && nextBooking) {
    return (
      <CoachBookingCancelScreen booking={nextBooking} onBack={() => setStep('detail')} onConfirm={confirmCancel} />
    );
  }

  if (step === 'chat' && nextBookingRaw) {
    return <CoachChatScreen bookingId={nextBookingRaw.id} onBack={() => setStep('detail')} />;
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
        <ActivityIndicator color={colors.ballLime} />
      </View>
    );
  }

  return (
    <CoachHomeScreen
      coachName={mockCarlosMedinaProfile.trainer.name}
      rating={rating}
      pendingRequests={pendingRequests}
      pendingEarnings={pendingEarnings}
      nextBooking={nextBooking}
      onOpenBooking={() => setStep('detail')}
    />
  );
}

/**
 * Local four-step flow: pre-match reminder → confirm match setup → resolve/create the
 * server-side `matches` row for this booking → the existing, unmodified live-capture
 * wireframe. CoachPreMatchReminderScreen/CoachMatchSetupScreen keep showing mock content
 * (mockPreMatchReminder) — only the persistence plumbing (bookingId → matchId) is real;
 * re-wiring their displayed content to the real booking is separate follow-up work.
 */
function CoachMatchDayFlow({ bookingId }: { bookingId: string }) {
  const [step, setStep] = useState<'reminder' | 'setup' | 'loadingMatch' | 'live'>('reminder');
  const [session, setSession] = useState<{ config: MatchConfig; roundLabel: string } | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);

  useEffect(() => {
    if (step !== 'loadingMatch' || !session) return;
    let cancelled = false;
    setMatchError(null);
    createOrGetMatch({
      bookingId,
      player2Label: session.config.player2Name,
      bestOf: String(session.config.bestOf) as '1' | '3',
      noAd: session.config.noAd,
      initialServer: session.config.initialServer,
      captureMode: 'rapida',
    })
      .then((match) => {
        if (cancelled) return;
        setMatchId(match.id);
        setStep('live');
      })
      .catch((err) => {
        if (cancelled) return;
        setMatchError(err instanceof ApiError ? err.message : 'No se pudo iniciar el partido.');
      });
    return () => {
      cancelled = true;
    };
  }, [step, session, bookingId]);

  if (step === 'reminder') {
    return <CoachPreMatchReminderScreen onStartCapture={() => setStep('setup')} />;
  }

  if (step === 'setup') {
    return (
      <CoachMatchSetupScreen
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
          <ActivityIndicator color={colors.ballLime} />
        )}
      </View>
    );
  }

  if (!session || !matchId) return null;

  return (
    <MatchProvider config={session.config} matchId={matchId}>
      <CoachFlow roundLabel={session.roundLabel} />
    </MatchProvider>
  );
}

/** Atajo de previsualización directo a la captura (salta reminder/setup) — misma
 * persistencia real que CoachMatchDayFlow, contra el mismo booking fixture. */
function CoachCapturePreview() {
  const [matchId, setMatchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    createOrGetMatch({
      bookingId: REAL_COMPLETED_BOOKING_ID,
      player2Label: mockMatchConfig.player2Name,
      bestOf: String(mockMatchConfig.bestOf) as '1' | '3',
      noAd: mockMatchConfig.noAd,
      initialServer: mockMatchConfig.initialServer,
      captureMode: 'rapida',
    })
      .then((match) => {
        if (!cancelled) setMatchId(match.id);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'No se pudo iniciar el partido.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <View style={[styles.root, styles.centerState]}>
        <Text style={styles.centerStateText}>{error}</Text>
      </View>
    );
  }

  if (!matchId) {
    return (
      <View style={[styles.root, styles.centerState]}>
        <ActivityIndicator color={colors.ballLime} />
      </View>
    );
  }

  return (
    <MatchProvider config={mockMatchConfig} matchId={matchId}>
      <CoachFlow />
    </MatchProvider>
  );
}

/** Local three-step flow: lista de torneos del club → detalle (roster + liquidar) → invitar entrenador. */
function ClubTournamentFlow() {
  const [tournament, setTournament] = useState<TournamentSummary | null>(null);
  const [inviting, setInviting] = useState(false);

  if (!tournament) {
    return <ClubTournamentListScreen onSelect={setTournament} />;
  }

  if (inviting) {
    return <ClubInviteCoachScreen tournamentId={tournament.id} onBack={() => setInviting(false)} />;
  }

  return (
    <ClubTournamentDetailScreen
      tournament={tournament}
      onBack={() => setTournament(null)}
      onInvite={() => setInviting(true)}
    />
  );
}

/**
 * Selector temporal para previsualizar las pantallas del flujo padre junto
 * al flujo del entrenador, ya que todavía no hay navegación real entre
 * ellas. Quitar cuando se integre una librería de navegación.
 */
function ScreenPreviewSwitcher() {
  const [screen, setScreen] = useState<PreviewScreen>('parentHome');

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        {screen === 'coachCapture' ? (
          <CoachCapturePreview />
        ) : screen === 'coachRegister' ? (
          <CoachRegistrationScreen />
        ) : screen === 'coachPending' ? (
          <CoachVerificationPendingScreen />
        ) : screen === 'coachHome' ? (
          <CoachHomeFlow />
        ) : screen === 'coachAvailability' ? (
          <CoachAvailabilityFlow />
        ) : screen === 'coachInbox' ? (
          <CoachRequestInboxScreen />
        ) : screen === 'coachChat' ? (
          <CoachChatScreen bookingId={REAL_COMPLETED_BOOKING_ID} />
        ) : screen === 'coachPreMatch' ? (
          <CoachMatchDayFlow bookingId={REAL_COMPLETED_BOOKING_ID} />
        ) : screen === 'coachSessions' ? (
          <CoachSessionHistoryScreen />
        ) : screen === 'coachEarnings' ? (
          <CoachEarningsScreen />
        ) : screen === 'coachReputation' ? (
          <CoachReputationScreen />
        ) : screen === 'coachClubInvitation' ? (
          <CoachClubInvitationScreen />
        ) : screen === 'parentHome' ? (
          <ParentHomeScreen />
        ) : screen === 'parentList' ? (
          <TrainerListScreen />
        ) : screen === 'parentChat' ? (
          <ParentChatScreen bookingId={REAL_COMPLETED_BOOKING_ID} />
        ) : screen === 'parentHistory' ? (
          <BookingHistoryScreen />
        ) : screen === 'clubSettlements' ? (
          <ClubSettlementsScreen />
        ) : screen === 'clubTournaments' ? (
          <ClubTournamentFlow />
        ) : screen === 'clubHome' ? (
          <ClubHomeScreen
            onOpenTournaments={() => setScreen('clubTournaments')}
            onOpenSettlements={() => setScreen('clubSettlements')}
          />
        ) : (
          <ParentBookingFlow />
        )}
      </View>

      <View style={styles.switcher}>
        {PREVIEW_OPTIONS.map((opt) => (
          <Pressable
            key={opt.key}
            onPress={() => setScreen(opt.key)}
            style={[styles.switcherButton, screen === opt.key && styles.switcherButtonActive]}
          >
            <Text style={[styles.switcherLabel, screen === opt.key && styles.switcherLabelActive]}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ScreenPreviewSwitcher />
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
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
  content: {
    flex: 1,
  },
  switcher: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.courtBlueDeep,
    paddingVertical: 8,
    paddingHorizontal: 6,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  switcherButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  switcherButtonActive: {
    backgroundColor: colors.ballLime,
  },
  switcherLabel: {
    color: colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
  },
  switcherLabelActive: {
    color: colors.courtBlueDeep,
  },
});
