import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import IconTextInput from '../components/shared/IconTextInput';
import { useMatch } from '../context/MatchContext';
import { colors, radius } from '../lib/theme';

export default function MatchSummaryView() {
  const { config, matchState, stats, reducerState, setObservations, resetMatch, reopenMatch } = useMatch();
  const p1 = stats.player1;

  const setScoresLine = matchState.completedSets.map((s) => `${s.gamesPlayer1}-${s.gamesPlayer2}`).join(', ');

  let subtitle: string;
  if (matchState.matchEnded && matchState.winner) {
    const winnerName = matchState.winner === 'player1' ? config.player1Name : config.player2Name;
    const loserName = matchState.winner === 'player1' ? config.player2Name : config.player1Name;
    subtitle = setScoresLine ? `${winnerName} venció a ${loserName} · ${setScoresLine}` : `${winnerName} venció a ${loserName}`;
  } else {
    subtitle = setScoresLine
      ? `Partido finalizado antes de completarse · ${setScoresLine}`
      : 'Partido finalizado antes de completarse';
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Partido finalizado</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <View style={styles.summaryGrid}>
          <SummaryCard bigNum={p1.winners} cap="Winners" />
          <SummaryCard bigNum={p1.unforcedErrors} cap="Errores no forzados" />
          <SummaryCard bigNum={p1.firstServePct === null ? '—' : `${p1.firstServePct}%`} cap="1er saque adentro" />
          <SummaryCard bigNum={`${p1.breaksConverted}/${p1.returnGamesPlayed}`} cap="Quiebres convertidos" />
        </View>

        <View style={styles.obsLabel}>
          <Text style={styles.obsLabelText}>Observaciones del entrenador</Text>
          <Pressable
            style={styles.micButton}
            onPress={() =>
              Alert.alert('Dictado por voz', 'Próximamente: dictado por voz para agregar observaciones más rápido.')
            }
          >
            <Ionicons name="mic-outline" size={13} color={colors.courtBlueDeep} />
          </Pressable>
        </View>
        <IconTextInput
          icon="create-outline"
          containerStyle={styles.obsWrapper}
          style={styles.obsInput}
          multiline
          placeholder="Ej: mejoró el segundo saque en el 2do set, sigue rompiendo el revés bajo presión..."
          value={reducerState.observations}
          onChangeText={setObservations}
          textAlignVertical="top"
        />

        <Pressable style={styles.backButton} onPress={reopenMatch}>
          <Text style={styles.backLabel}>
            {matchState.matchEnded ? '↺ Deshacer último punto y volver' : '← Volver a capturar'}
          </Text>
        </Pressable>

        <Pressable style={styles.finishButton} onPress={resetMatch}>
          <View style={styles.finishContent}>
            <Ionicons name="refresh-outline" size={18} color={colors.courtBlueDeep} />
            <Text style={styles.finishLabel}>Nuevo partido</Text>
          </View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryCard({ bigNum, cap }: { bigNum: string | number; cap: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.bigNum}>{bigNum}</Text>
      <Text style={styles.cap}>{cap}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.courtBlueDeep,
  },
  content: {
    padding: 22,
    paddingBottom: 40,
  },
  title: {
    color: colors.lineWhite,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 2,
  },
  subtitle: {
    color: colors.textDim,
    fontSize: 13,
    marginBottom: 20,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  summaryCard: {
    width: '48.5%',
    backgroundColor: colors.panel,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  bigNum: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.ballLime,
  },
  cap: {
    fontSize: 11,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  obsLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  obsLabelText: {
    fontSize: 12,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  micButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.ballLime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  obsWrapper: {
    marginBottom: 20,
  },
  obsInput: {
    minHeight: 110,
  },
  backButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  backLabel: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: '600',
  },
  finishButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 16,
    alignItems: 'center',
  },
  finishContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  finishLabel: {
    color: colors.courtBlueDeep,
    fontSize: 15,
    fontWeight: '800',
  },
});
