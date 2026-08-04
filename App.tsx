import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
import { CoachBooking, mockCoachBookings } from './mock/coachFlow';
import ParentHomeScreen from './screens/parent/ParentHomeScreen';
import TrainerListScreen from './screens/parent/TrainerListScreen';
import TrainerProfileScreen from './screens/parent/TrainerProfileScreen';
import BookingConfirmScreen from './screens/parent/BookingConfirmScreen';
import BookingPaymentScreen from './screens/parent/BookingPaymentScreen';
import BookingStatusScreen from './screens/parent/BookingStatusScreen';
import ParentChatScreen from './screens/parent/ParentChatScreen';
import BookingHistoryScreen from './screens/parent/BookingHistoryScreen';
import { BookingSlotSelection, REAL_COMPLETED_BOOKING_ID, Tournament } from './mock/parentFlow';
import { MatchConfig } from './lib/types';

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
  | 'parentHistory';

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
];

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
  const [bookings, setBookings] = useState<CoachBooking[]>(mockCoachBookings);
  const [step, setStep] = useState<'home' | 'detail' | 'cancel'>('home');
  const nextBooking = bookings.find((b) => b.status === 'confirmed') ?? null;

  function confirmCancel(_reason: string) {
    if (!nextBooking) return;
    const targetId = nextBooking.id;
    setBookings((prev) => prev.map((b) => (b.id === targetId ? { ...b, status: 'cancelled' } : b)));
    setStep('home');
  }

  if (step === 'detail' && nextBooking) {
    return (
      <CoachBookingDetailScreen
        booking={nextBooking}
        onBack={() => setStep('home')}
        onCancel={() => setStep('cancel')}
      />
    );
  }

  if (step === 'cancel' && nextBooking) {
    return (
      <CoachBookingCancelScreen booking={nextBooking} onBack={() => setStep('detail')} onConfirm={confirmCancel} />
    );
  }

  return <CoachHomeScreen nextBooking={nextBooking ?? undefined} onOpenBooking={() => setStep('detail')} />;
}

/**
 * Local three-step flow: pre-match reminder → confirm match setup → the existing,
 * unmodified live-capture wireframe. This is the "transición" requested — it does not
 * change LiveCaptureView/MatchSummaryView at all, only how the coach arrives at them.
 */
function CoachMatchDayFlow() {
  const [step, setStep] = useState<'reminder' | 'setup' | 'live'>('reminder');
  const [session, setSession] = useState<{ config: MatchConfig; roundLabel: string } | null>(null);

  if (step === 'reminder') {
    return <CoachPreMatchReminderScreen onStartCapture={() => setStep('setup')} />;
  }

  if (step === 'setup') {
    return (
      <CoachMatchSetupScreen
        onStart={(config, roundLabel) => {
          setSession({ config, roundLabel });
          setStep('live');
        }}
      />
    );
  }

  if (!session) return null;

  return (
    <MatchProvider config={session.config}>
      <CoachFlow roundLabel={session.roundLabel} />
    </MatchProvider>
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
          <MatchProvider config={mockMatchConfig}>
            <CoachFlow />
          </MatchProvider>
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
          <CoachChatScreen />
        ) : screen === 'coachPreMatch' ? (
          <CoachMatchDayFlow />
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
