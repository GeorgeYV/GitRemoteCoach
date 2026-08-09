import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { MatchProvider, useMatch } from '../context/MatchContext';
import { colors } from '../lib/theme';
import { MatchConfig } from '../lib/types';
import {
  ApiError,
  BookingWithParticipants,
  Club,
  CoachSearchResult,
  createOrGetMatch,
  getClubForAdmin,
  getCoachProfile,
  listCoachBookings,
  listPlayers,
  TournamentSummary,
} from '../lib/api';
import { isUpcoming, toCoachBooking } from '../lib/coachBookingDisplay';
import { mockMatchConfig, mockRoundLabel } from '../mock/players';
import {
  AvailabilityDay,
  BookingSlotSelection,
  mockCarlosMedinaProfile,
  REAL_COMPLETED_BOOKING_ID,
  Tournament,
} from '../mock/parentFlow';
import LiveCaptureView from './LiveCaptureView';
import MatchSummaryView from './MatchSummaryView';
import PlayerRegistrationScreen from './parent/PlayerRegistrationScreen';
import CoachAvailabilityScreen from './coach/CoachAvailabilityScreen';
import CoachBookingCancelScreen from './coach/CoachBookingCancelScreen';
import CoachBookingDetailScreen from './coach/CoachBookingDetailScreen';
import CoachChatScreen from './coach/CoachChatScreen';
import CoachClubInvitationScreen from './coach/CoachClubInvitationScreen';
import CoachEarningsScreen from './coach/CoachEarningsScreen';
import CoachHomeScreen from './coach/CoachHomeScreen';
import CoachMatchSetupScreen from './coach/CoachMatchSetupScreen';
import CoachPreMatchReminderScreen from './coach/CoachPreMatchReminderScreen';
import CoachRequestInboxScreen from './coach/CoachRequestInboxScreen';
import CoachReputationScreen from './coach/CoachReputationScreen';
import CoachSessionHistoryScreen from './coach/CoachSessionHistoryScreen';
import CoachTournamentSearchScreen from './coach/CoachTournamentSearchScreen';
import TrainerListScreen from './parent/TrainerListScreen';
import TrainerProfileScreen from './parent/TrainerProfileScreen';
import BookingConfirmScreen from './parent/BookingConfirmScreen';
import BookingPaymentScreen from './parent/BookingPaymentScreen';
import BookingStatusScreen from './parent/BookingStatusScreen';
import ClubHomeScreen from './club/ClubHomeScreen';
import ClubSettlementsScreen from './club/ClubSettlementsScreen';
import ClubTournamentListScreen from './club/ClubTournamentListScreen';
import ClubTournamentDetailScreen from './club/ClubTournamentDetailScreen';
import ClubInviteCoachScreen from './club/ClubInviteCoachScreen';

/** UUID real de Carlos Medina — coincide con coachAUserId en server/test/seed.ts. Toda la previsualización
 * del lado coach opera como este entrenador hasta que exista una sesión/login real. */
export const COACH_ID = mockCarlosMedinaProfile.trainer.id;

export function CoachFlow({ roundLabel = mockRoundLabel }: { roundLabel?: string }) {
  const { matchState, reducerState } = useMatch();
  const showSummary = matchState.matchEnded || reducerState.matchClosed;
  return showSummary ? <MatchSummaryView /> : <LiveCaptureView roundLabel={roundLabel} />;
}

/** Local two-step flow: pick a tournament, then configure days/rate within it. */
export function CoachAvailabilityFlow({ onBack }: { onBack?: () => void } = {}) {
  const [tournament, setTournament] = useState<Tournament | null>(null);

  if (!tournament) {
    return <CoachTournamentSearchScreen onSelect={setTournament} onBack={onBack} />;
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
  availability: AvailabilityDay[];
}

export function ParentBookingFlow() {
  const router = useRouter();
  const { token } = useAuth();
  const [step, setStep] = useState<'list' | 'profile' | 'confirm' | 'status' | 'payment'>('list');
  const [coachId, setCoachId] = useState<string | null>(null);
  const [selectedTrainer, setSelectedTrainer] = useState<SelectedTrainer | null>(null);
  const [selection, setSelection] = useState<BookingSlotSelection | null>(null);
  const [note, setNote] = useState('');
  const [bookingId, setBookingId] = useState<string | null>(null);
  // undefined = todavía resolviendo; null = confirmado que el padre no tiene hijos/as todavía.
  const [playerId, setPlayerId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    // Sin token solo pasa en /dev-preview (fuera del guard de auth de app/_layout.tsx) — ahí no
    // hay sesión con la que pedir GET /players, así que se resuelve directo a "sin hijos/as".
    if (!token) {
      setPlayerId(null);
      return;
    }
    listPlayers(token)
      .then((players) => setPlayerId(players[0]?.id ?? null))
      .catch(() => setPlayerId(null));
  }, [token]);

  if (step === 'list') {
    return (
      <TrainerListScreen
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
        onBack={() => setStep('list')}
        onReserve={(info) => {
          setSelectedTrainer(info);
          setStep('confirm');
        }}
      />
    );
  }

  if (step === 'confirm') {
    if (!selectedTrainer) return null;

    if (playerId === undefined) {
      return (
        <View style={[styles.root, styles.centerState]}>
          <ActivityIndicator color={colors.ballLime} />
        </View>
      );
    }

    if (playerId === null) {
      return (
        <PlayerRegistrationScreen
          onBack={() => setStep('profile')}
          onSubmit={(player) => setPlayerId(player.id)}
        />
      );
    }

    return (
      <BookingConfirmScreen
        playerId={playerId}
        coachId={selectedTrainer.coachId}
        trainerName={selectedTrainer.name}
        price={selectedTrainer.price}
        availability={selectedTrainer.availability}
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
    if (!selection || !bookingId || !selectedTrainer) return null;
    return (
      <BookingStatusScreen
        bookingId={bookingId}
        selection={selection}
        trainerName={selectedTrainer.name}
        price={selectedTrainer.price}
        onAccepted={() => setStep('payment')}
        onDone={() => setStep('profile')}
      />
    );
  }

  if (!selection || !bookingId || !selectedTrainer) return null;

  return (
    <BookingPaymentScreen
      bookingId={bookingId}
      selection={selection}
      note={note}
      trainerName={selectedTrainer.name}
      price={selectedTrainer.price}
      onBack={() => setStep('status')}
      onConfirm={() => setStep('status')}
    />
  );
}

/** Local three-step flow: home dashboard → booking detail → cancel, all sharing one local booking list. */
export function CoachHomeFlow({ coachId, coachName }: { coachId: string; coachName: string }) {
  const { token } = useAuth();
  const [bookings, setBookings] = useState<BookingWithParticipants[] | null>(null);
  const [rating, setRating] = useState('—');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<
    'home' | 'detail' | 'cancel' | 'chat' | 'requests' | 'availability' | 'sessions' | 'earnings' | 'reputation' | 'match'
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
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : 'No se pudo cargar tu panel.');
      });
    return () => {
      cancelled = true;
    };
  }, [coachId, token]);

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
        onStartMatch={nextBooking.status === 'confirmed' ? () => setStep('match') : undefined}
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

  if (step === 'match' && nextBookingRaw) {
    // Sin onBack: una vez iniciado el partido es forward-only, igual que CoachCapturePreview en /dev-preview.
    return <CoachMatchDayFlow bookingId={nextBookingRaw.id} />;
  }

  if (step === 'requests') {
    return <CoachRequestInboxScreen coachId={coachId} onBack={() => setStep('home')} />;
  }

  if (step === 'availability') {
    return <CoachAvailabilityFlow onBack={() => setStep('home')} />;
  }

  if (step === 'sessions') {
    return <CoachSessionHistoryScreen coachId={coachId} onBack={() => setStep('home')} />;
  }

  if (step === 'earnings') {
    return <CoachEarningsScreen coachId={coachId} onBack={() => setStep('home')} />;
  }

  if (step === 'reputation') {
    return <CoachReputationScreen coachId={coachId} coachName={coachName} onBack={() => setStep('home')} />;
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
      coachName={coachName}
      rating={rating}
      pendingRequests={pendingRequests}
      pendingEarnings={pendingEarnings}
      nextBooking={nextBooking}
      onOpenBooking={() => setStep('detail')}
      onOpenRequests={() => setStep('requests')}
      onOpenAvailability={() => setStep('availability')}
      onOpenSessions={() => setStep('sessions')}
      onOpenEarnings={() => setStep('earnings')}
      onOpenReputation={() => setStep('reputation')}
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
export function CoachMatchDayFlow({ bookingId }: { bookingId: string }) {
  const { token } = useAuth();
  const [step, setStep] = useState<'reminder' | 'setup' | 'loadingMatch' | 'live'>('reminder');
  const [session, setSession] = useState<{ config: MatchConfig; roundLabel: string } | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);

  useEffect(() => {
    if (step !== 'loadingMatch' || !session) return;
    if (!token) {
      setMatchError('No hay una sesión activa.');
      return;
    }
    let cancelled = false;
    setMatchError(null);
    createOrGetMatch(token, {
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
  }, [step, session, bookingId, token]);

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
export function CoachCapturePreview() {
  const { token } = useAuth();
  const [matchId, setMatchId] = useState<string | null>(null);
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
  }, [token]);

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
export function ClubTournamentFlow({ clubId, clubName }: { clubId: string; clubName: string }) {
  const [tournament, setTournament] = useState<TournamentSummary | null>(null);
  const [inviting, setInviting] = useState(false);

  if (!tournament) {
    return <ClubTournamentListScreen clubId={clubId} clubName={clubName} onSelect={setTournament} />;
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

  return (
    <ClubTournamentDetailScreen
      tournament={tournament}
      onBack={() => setTournament(null)}
      onInvite={() => setInviting(true)}
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
  const [club, setClub] = useState<Club | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    getClubForAdmin(adminUserId)
      .then((result) => {
        if (!cancelled) setClub(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar tu club.');
      });
    return () => {
      cancelled = true;
    };
  }, [adminUserId]);

  const [screen, setScreen] = useState<'home' | 'tournaments' | 'settlements'>('home');

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
        <ActivityIndicator color={colors.ballLime} />
      </View>
    );
  }

  if (screen === 'tournaments') {
    return <ClubTournamentFlow clubId={club.id} clubName={club.name} />;
  }

  if (screen === 'settlements') {
    return <ClubSettlementsScreen clubId={club.id} clubName={club.name} />;
  }

  return (
    <ClubHomeScreen
      clubId={club.id}
      onOpenTournaments={() => setScreen('tournaments')}
      onOpenSettlements={() => setScreen('settlements')}
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
});
