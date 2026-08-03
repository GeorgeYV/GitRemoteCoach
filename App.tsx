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
import CoachChatScreen from './screens/coach/CoachChatScreen';
import CoachClubInvitationScreen from './screens/coach/CoachClubInvitationScreen';
import CoachEarningsScreen from './screens/coach/CoachEarningsScreen';
import CoachMatchSetupScreen from './screens/coach/CoachMatchSetupScreen';
import CoachPreMatchReminderScreen from './screens/coach/CoachPreMatchReminderScreen';
import CoachRegistrationScreen from './screens/coach/CoachRegistrationScreen';
import CoachReputationScreen from './screens/coach/CoachReputationScreen';
import CoachRequestInboxScreen from './screens/coach/CoachRequestInboxScreen';
import CoachTournamentSearchScreen from './screens/coach/CoachTournamentSearchScreen';
import CoachVerificationPendingScreen from './screens/coach/CoachVerificationPendingScreen';
import ParentHomeScreen from './screens/parent/ParentHomeScreen';
import TrainerListScreen from './screens/parent/TrainerListScreen';
import TrainerProfileScreen from './screens/parent/TrainerProfileScreen';
import { Tournament } from './mock/parentFlow';
import { MatchConfig } from './lib/types';

type PreviewScreen =
  | 'coachCapture'
  | 'coachRegister'
  | 'coachPending'
  | 'coachAvailability'
  | 'coachInbox'
  | 'coachChat'
  | 'coachPreMatch'
  | 'coachEarnings'
  | 'coachReputation'
  | 'coachClubInvitation'
  | 'parentHome'
  | 'parentList'
  | 'parentProfile';

const PREVIEW_OPTIONS: { key: PreviewScreen; label: string }[] = [
  { key: 'parentHome', label: 'Padre · Inicio' },
  { key: 'parentList', label: 'Padre · Lista' },
  { key: 'parentProfile', label: 'Padre · Perfil' },
  { key: 'coachRegister', label: 'Coach · Registro' },
  { key: 'coachPending', label: 'Coach · Verificación' },
  { key: 'coachAvailability', label: 'Coach · Disponibilidad' },
  { key: 'coachInbox', label: 'Coach · Solicitudes' },
  { key: 'coachChat', label: 'Coach · Chat' },
  { key: 'coachPreMatch', label: 'Coach · Día de partido' },
  { key: 'coachCapture', label: 'Coach · Captura' },
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
        ) : screen === 'coachAvailability' ? (
          <CoachAvailabilityFlow />
        ) : screen === 'coachInbox' ? (
          <CoachRequestInboxScreen />
        ) : screen === 'coachChat' ? (
          <CoachChatScreen />
        ) : screen === 'coachPreMatch' ? (
          <CoachMatchDayFlow />
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
        ) : (
          <TrainerProfileScreen />
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
