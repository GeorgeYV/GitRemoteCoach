import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ContingencyMenu from '../components/ContingencyMenu';
import PointFlow from '../components/PointFlow';
import ScoreHeader from '../components/ScoreHeader';
import { useMatch } from '../context/MatchContext';
import { colors, radius, withOpacity } from '../lib/theme';
import { PlayerId } from '../lib/types';

export default function LiveCaptureView({ roundLabel }: { roundLabel: string }) {
  const {
    config,
    matchState,
    match,
    addPoint,
    addAdjustment,
    undoLast,
    closeMatch,
    canUndo,
    undoBudget,
    pauseMatch,
    resumeMatch,
    suspendMatch,
    resumeSuspendedMatch,
    retireMatch,
    syncError,
    retrySync,
  } = useMatch();
  const [menuOpen, setMenuOpen] = useState(false);

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

  const contingencyMenu = (
    <ContingencyMenu
      visible={menuOpen}
      onClose={() => setMenuOpen(false)}
      player1Name={config.player1Name}
      player2Name={config.player2Name}
      matchState={matchState}
      match={match}
      onPointNotSeen={handlePointNotSeen}
      onManualAdjustment={addAdjustment}
      onPause={pauseMatch}
      onResume={resumeMatch}
      onSuspend={suspendMatch}
      onRetire={retireMatch}
      onFinish={closeMatch}
    />
  );

  if (match.status === 'suspended') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScoreHeader roundLabel={roundLabel} canUndo={canUndo} undoBudget={undoBudget} onUndo={undoLast} />

        <View style={styles.suspendedArea}>
          <Text style={styles.suspendedTitle}>Partido suspendido</Text>
          <Text style={styles.suspendedText}>
            El marcador quedó guardado en el mismo set, juego y saque. Reanudá cuando estén listos para seguir.
          </Text>
          <Pressable style={styles.resumeButton} onPress={resumeSuspendedMatch}>
            <Text style={styles.resumeLabel}>Reanudar partido</Text>
          </Pressable>
          <Pressable style={styles.sosButton} onPress={() => setMenuOpen(true)}>
            <Text style={styles.sosLabel}>SOS</Text>
          </Pressable>
        </View>

        {contingencyMenu}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScoreHeader roundLabel={roundLabel} canUndo={canUndo} undoBudget={undoBudget} onUndo={undoLast} />

      {syncError && (
        <View style={styles.syncBanner}>
          <Text style={styles.syncBannerText}>{syncError}</Text>
          <Pressable onPress={retrySync} hitSlop={8}>
            <Text style={styles.syncBannerRetry}>Reintentar</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.captureArea}>
        <PointFlow onOpenMenu={() => setMenuOpen(true)} />
      </View>

      {contingencyMenu}
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
  suspendedArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  suspendedTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.lineWhite,
    marginBottom: 10,
  },
  suspendedText: {
    fontSize: 13,
    color: colors.textDim,
    textAlign: 'center',
    marginBottom: 24,
  },
  resumeButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  resumeLabel: {
    color: colors.courtBlueDeep,
    fontSize: 15,
    fontWeight: '800',
  },
  sosButton: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: colors.panel,
  },
  sosLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.errorCoral,
  },
});
