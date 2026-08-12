import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DetailSheet from '../components/DetailSheet';
import LiveStatsBar from '../components/LiveStatsBar';
import ModeSwitch from '../components/ModeSwitch';
import PointButtons from '../components/PointButtons';
import ScoreHeader from '../components/ScoreHeader';
import { useMatch } from '../context/MatchContext';
import { colors, withOpacity } from '../lib/theme';
import { PlayerId, PointDetail } from '../lib/types';

export default function LiveCaptureView({ roundLabel }: { roundLabel: string }) {
  const { reducerState, matchState, addPoint, undoLast, setMode, closeMatch, canUndo, syncError, retrySync } =
    useMatch();
  const [pendingWonBy, setPendingWonBy] = useState<PlayerId | null>(null);

  const matchEnded = matchState.matchEnded;

  function handlePoint(wonBy: PlayerId) {
    if (reducerState.mode === 'rapida') {
      addPoint(wonBy, null);
      return;
    }
    // A detail sheet may already be open for the previous point. Never make the
    // coach wait for it: commit that one with no detail (same as a timeout) and
    // immediately open the sheet for the new point.
    if (pendingWonBy) {
      addPoint(pendingWonBy, null);
    }
    setPendingWonBy(wonBy);
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

      {syncError && (
        <View style={styles.syncBanner}>
          <Text style={styles.syncBannerText}>{syncError}</Text>
          <Pressable onPress={retrySync} hitSlop={8}>
            <Text style={styles.syncBannerRetry}>Reintentar</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.captureArea}>
        <Pressable style={styles.finishLink} onPress={closeMatch} disabled={matchEnded}>
          <Text style={styles.finishLabel}>{matchEnded ? 'Ver resumen ↓' : 'Finalizar partido'}</Text>
        </Pressable>

        <ModeSwitch mode={reducerState.mode} onChange={setMode} />

        <PointButtons disabled={matchEnded} onPoint={handlePoint} />

        <DetailSheet pendingWonBy={pendingWonBy} onConfirm={handleDetailConfirm} />
      </View>

      <LiveStatsBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
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
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: withOpacity(colors.errorCoral, 0.12),
    borderBottomWidth: 1,
    borderBottomColor: withOpacity(colors.errorCoral, 0.35),
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  syncBannerText: {
    flex: 1,
    color: colors.errorCoral,
    fontSize: 11,
    marginRight: 10,
  },
  syncBannerRetry: {
    color: colors.errorCoral,
    fontSize: 11,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
});
