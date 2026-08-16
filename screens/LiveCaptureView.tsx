import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ContingencyMenu from '../components/ContingencyMenu';
import PointFlow from '../components/PointFlow';
import LiveStatsBar from '../components/LiveStatsBar';
import ScoreHeader from '../components/ScoreHeader';
import { useMatch } from '../context/MatchContext';
import { colors, withOpacity } from '../lib/theme';
import { PlayerId } from '../lib/types';

export default function LiveCaptureView({ roundLabel }: { roundLabel: string }) {
  const { config, matchState, addPoint, undoLast, closeMatch, canUndo, undoBudget, syncError, retrySync } =
    useMatch();
  const [menuOpen, setMenuOpen] = useState(false);
  const matchEnded = matchState.matchEnded;

  function handlePointNotSeen(winner: PlayerId) {
    addPoint({
      wonBy: winner,
      detail: 'dato_no_capturado',
      firstServeIn: true,
      serveDirection: null,
      errorDirection: null,
      rallyLength: null,
      netApproach: false,
      isReturnError: false,
    });
    setMenuOpen(false);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScoreHeader
        roundLabel={roundLabel}
        canUndo={canUndo}
        undoBudget={undoBudget}
        onUndo={undoLast}
        onOpenMenu={() => setMenuOpen(true)}
      />

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

        <PointFlow />
      </View>

      <LiveStatsBar />

      <ContingencyMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        player1Name={config.player1Name}
        player2Name={config.player2Name}
        onPointNotSeen={handlePointNotSeen}
      />
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
    gap: 10,
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
