import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Match } from '../lib/api';
import { useMatch } from '../context/MatchContext';
import { getCurrentServer, getGamePointLabels } from '../lib/scoringEngine';
import { colors } from '../lib/theme';
import { PlayerId } from '../lib/types';

function elapsedSeconds(match: Match): number {
  const startedMs = new Date(match.startedAt).getTime();
  const nowMs = match.pausedAt ? new Date(match.pausedAt).getTime() : Date.now();
  return Math.max(0, Math.floor((nowMs - startedMs) / 1000) - match.totalPausedSeconds);
}

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Ticks once a second while the match is running; frozen (no interval) while paused/suspended. */
function MatchTimerLabel({ match }: { match: Match }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (match.pausedAt) return;
    const interval = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [match.pausedAt]);

  const statusLabel = match.status === 'suspended' ? 'Suspendido' : match.pausedAt ? 'Pausado' : 'Capturando';

  return (
    <Text style={styles.timerLabel} numberOfLines={1}>
      {formatElapsed(elapsedSeconds(match))} · {statusLabel}
    </Text>
  );
}

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
  undoBudget,
  onUndo,
  onOpenMenu,
}: {
  roundLabel: string;
  canUndo: boolean;
  undoBudget: number;
  onUndo: () => void;
  onOpenMenu: () => void;
}) {
  const { config, matchState, match } = useMatch();
  const currentServer = matchState.matchEnded ? null : getCurrentServer(matchState);

  return (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <View style={styles.headerTitleColumn}>
          <Text style={styles.matchTag} numberOfLines={1}>
            {matchState.matchEnded ? 'PARTIDO FINALIZADO' : roundLabel}
          </Text>
          {!matchState.matchEnded && <MatchTimerLabel match={match} />}
        </View>
        <View style={styles.headerActions}>
          <Pressable disabled={!canUndo} onPress={onUndo} style={[styles.undoBtn, !canUndo && styles.undoBtnDisabled]}>
            <Text style={styles.undoLabel}>↺ Deshacer {undoBudget}/3</Text>
          </Pressable>
          <Pressable onPress={onOpenMenu} style={styles.menuBtn} hitSlop={8}>
            <Text style={styles.menuLabel}>⋯</Text>
          </Pressable>
        </View>
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
  headerTitleColumn: {
    flexShrink: 1,
    marginRight: 10,
  },
  matchTag: {
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.courtBlue,
    fontWeight: '700',
  },
  timerLabel: {
    fontSize: 11,
    color: colors.textDim,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  menuBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    color: colors.lineWhite,
    fontSize: 16,
    fontWeight: '800',
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
