import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DetailSheet from '../components/DetailSheet';
import LiveStatsBar from '../components/LiveStatsBar';
import ModeSwitch from '../components/ModeSwitch';
import PointButtons from '../components/PointButtons';
import ScoreHeader from '../components/ScoreHeader';
import { useMatch } from '../context/MatchContext';
import { colors } from '../lib/theme';
import { PlayerId, PointDetail } from '../lib/types';

export default function LiveCaptureView({ roundLabel }: { roundLabel: string }) {
  const { reducerState, matchState, addPoint, undoLast, setMode, closeMatch, canUndo } = useMatch();
  const [pendingWonBy, setPendingWonBy] = useState<PlayerId | null>(null);

  const matchEnded = matchState.matchEnded;

  function handlePoint(wonBy: PlayerId) {
    if (reducerState.mode === 'rapida') {
      addPoint(wonBy, null);
    } else {
      setPendingWonBy(wonBy);
    }
  }

  function handleDetailConfirm(detail: PointDetail | null) {
    if (pendingWonBy) {
      addPoint(pendingWonBy, detail);
    }
    setPendingWonBy(null);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScoreHeader roundLabel={roundLabel} canUndo={canUndo} onUndo={undoLast} />

      <View style={styles.captureArea}>
        <Pressable style={styles.finishLink} onPress={closeMatch} disabled={matchEnded}>
          <Text style={styles.finishLabel}>{matchEnded ? 'Ver resumen ↓' : 'Finalizar partido'}</Text>
        </Pressable>

        <ModeSwitch mode={reducerState.mode} onChange={setMode} />

        <PointButtons disabled={matchEnded || pendingWonBy !== null} onPoint={handlePoint} />

        <DetailSheet pendingWonBy={pendingWonBy} onConfirm={handleDetailConfirm} />
      </View>

      <LiveStatsBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.courtBlue,
  },
  captureArea: {
    flex: 1,
    padding: 16,
    paddingTop: 10,
    gap: 14,
    position: 'relative',
  },
  finishLink: {
    alignSelf: 'center',
  },
  finishLabel: {
    color: colors.textDim,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
});
