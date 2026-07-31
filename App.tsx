import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MatchProvider, useMatch } from './context/MatchContext';
import { colors } from './lib/theme';
import { mockMatchConfig, mockRoundLabel } from './mock/players';
import LiveCaptureView from './screens/LiveCaptureView';
import MatchSummaryView from './screens/MatchSummaryView';
import ParentHomeScreen from './screens/parent/ParentHomeScreen';
import TrainerListScreen from './screens/parent/TrainerListScreen';
import TrainerProfileScreen from './screens/parent/TrainerProfileScreen';

type PreviewScreen = 'coach' | 'parentHome' | 'parentList' | 'parentProfile';

const PREVIEW_OPTIONS: { key: PreviewScreen; label: string }[] = [
  { key: 'parentHome', label: 'Padre · Inicio' },
  { key: 'parentList', label: 'Padre · Lista' },
  { key: 'parentProfile', label: 'Padre · Perfil' },
  { key: 'coach', label: 'Entrenador' },
];

function CoachFlow() {
  const { matchState, reducerState } = useMatch();
  const showSummary = matchState.matchEnded || reducerState.matchClosed;
  return showSummary ? <MatchSummaryView /> : <LiveCaptureView roundLabel={mockRoundLabel} />;
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
        {screen === 'coach' ? (
          <MatchProvider config={mockMatchConfig}>
            <CoachFlow />
          </MatchProvider>
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
