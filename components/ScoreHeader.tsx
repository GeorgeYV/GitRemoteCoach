import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMatch } from '../context/MatchContext';
import { getCurrentServer, getGamePointLabels } from '../lib/scoringEngine';
import { colors } from '../lib/theme';
import { PlayerId } from '../lib/types';

function currentSetGames(games: { winner: PlayerId }[], player: PlayerId): number {
  return games.filter((g) => g.winner === player).length;
}

function SetScoresLine({ player }: { player: PlayerId }) {
  const { matchState } = useMatch();
  const completed = matchState.completedSets.map((s) => (player === 'player1' ? s.gamesPlayer1 : s.gamesPlayer2));
  const inProgress = matchState.matchEnded ? [] : [currentSetGames(matchState.currentSetGames, player)];
  const values = [...completed, ...inProgress];

  return (
    <Text style={[styles.setScores, player === 'player1' && styles.setScoresYou]}>{values.join('  ')}</Text>
  );
}

function PointScore({ player }: { player: PlayerId }) {
  const { config, matchState } = useMatch();
  if (matchState.matchEnded) return null;

  const gameLabels = getGamePointLabels(matchState.currentGamePoints, config.noAd);
  const value = matchState.inTiebreak
    ? String(matchState.tiebreakPoints[player])
    : player === 'player1'
    ? gameLabels.player1
    : gameLabels.player2;

  return <Text style={styles.pointScore}>{value}</Text>;
}

export default function ScoreHeader({
  roundLabel,
  canUndo,
  onUndo,
}: {
  roundLabel: string;
  canUndo: boolean;
  onUndo: () => void;
}) {
  const { config, matchState } = useMatch();
  const currentServer = matchState.matchEnded ? null : getCurrentServer(matchState);

  return (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <Text style={styles.matchTag} numberOfLines={1}>
          {matchState.matchEnded ? 'PARTIDO FINALIZADO' : roundLabel}
        </Text>
        <Pressable disabled={!canUndo} onPress={onUndo} style={[styles.undoBtn, !canUndo && styles.undoBtnDisabled]}>
          <Text style={styles.undoLabel}>↺ Deshacer</Text>
        </Pressable>
      </View>

      <View style={styles.playersRow}>
        <View style={styles.playerYou}>
          <Text style={[styles.playerName, styles.playerNameYou]} numberOfLines={1}>
            {config.player1Name} {currentServer === 'player1' ? '●' : ''}
          </Text>
          <View style={styles.scoreBlockYou}>
            <SetScoresLine player="player1" />
            <PointScore player="player1" />
          </View>
        </View>

        <View style={styles.playerRival}>
          <Text style={styles.playerName} numberOfLines={1}>
            {currentServer === 'player2' ? '● ' : ''}
            {config.player2Name}
          </Text>
          <View style={styles.scoreBlockRival}>
            <PointScore player="player2" />
            <SetScoresLine player="player2" />
          </View>
        </View>
      </View>

      {matchState.inTiebreak && <Text style={styles.tiebreakBadge}>TIE-BREAK</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.panel,
    paddingTop: 14,
    paddingBottom: 10,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  matchTag: {
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.courtBlue,
    fontWeight: '700',
    flexShrink: 1,
    marginRight: 10,
  },
  undoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  undoBtnDisabled: {
    opacity: 0.4,
  },
  undoLabel: {
    color: colors.lineWhite,
    fontSize: 12,
    fontWeight: '600',
  },
  playersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  playerYou: {
    flex: 1,
  },
  playerRival: {
    flex: 1,
    alignItems: 'flex-end',
  },
  playerName: {
    fontSize: 13,
    color: colors.textDim,
    marginBottom: 2,
  },
  playerNameYou: {
    color: colors.courtBlue,
  },
  scoreBlockYou: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  scoreBlockRival: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  setScores: {
    fontSize: 15,
    color: colors.textDim,
    letterSpacing: 0.5,
  },
  setScoresYou: {
    color: colors.textSoft,
  },
  pointScore: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: colors.lineWhite,
  },
  tiebreakBadge: {
    alignSelf: 'center',
    marginTop: 8,
    color: colors.courtBlue,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 1,
  },
});
