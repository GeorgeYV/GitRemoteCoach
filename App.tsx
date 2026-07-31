import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MatchProvider, useMatch } from './context/MatchContext';
import { mockMatchConfig, mockRoundLabel } from './mock/players';
import LiveCaptureView from './screens/LiveCaptureView';
import MatchSummaryView from './screens/MatchSummaryView';

function Root() {
  const { matchState, reducerState } = useMatch();
  const showSummary = matchState.matchEnded || reducerState.matchClosed;

  return showSummary ? <MatchSummaryView /> : <LiveCaptureView roundLabel={mockRoundLabel} />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MatchProvider config={mockMatchConfig}>
        <Root />
      </MatchProvider>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
