import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Match } from '../lib/api';
import { useMatch } from '../context/MatchContext';
import { deciderSetIndex, MATCH_FORMAT_LABELS, MATCH_FORMAT_RULES, MatchFormatId } from '../lib/matchFormats';
import { getCurrentServer, getGamePointLabels, MatchState } from '../lib/scoringEngine';
import { colors, radius } from '../lib/theme';
import { MatchConfig, PlayerId } from '../lib/types';

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

/** "SET 2 · JUEGO 4 · SAQUE SOFÍA" (o "TIEBREAK"/"MATCH TIEBREAK"/"SÚPER TIEBREAK" en vez de
 * "JUEGO n" cuando corresponde) — una sola línea que dice todo lo que antes vivía repartido
 * entre una insignia de set separada y el puntito de saque junto al nombre. */
function getStatusLine(matchState: MatchState, config: MatchConfig, currentServer: PlayerId | null): string {
  const rules = MATCH_FORMAT_RULES[config.format];
  const setsPlayed = matchState.completedSets.length;
  const serverName = currentServer === 'player1' ? config.player1Name : currentServer === 'player2' ? config.player2Name : '';
  const saque = serverName ? ` · SAQUE ${serverName.toUpperCase()}` : '';

  if (rules.setsToWin === 1 && rules.deciderIsMatchTiebreak) {
    return `SÚPER TIEBREAK${saque}`;
  }

  const setPart = rules.setsToWin === 1 ? 'SET ÚNICO' : `SET ${setsPlayed + 1}`;
  const isDeciderSet = rules.deciderIsMatchTiebreak && setsPlayed === deciderSetIndex(rules);

  if (isDeciderSet) return `${setPart} · MATCH TIEBREAK${saque}`;
  if (matchState.inTiebreak) return `${setPart} · TIEBREAK${saque}`;

  const gameNumber = matchState.currentSetGames.length + 1;
  return `${setPart} · JUEGO ${gameNumber}${saque}`;
}

function getPointValue(matchState: MatchState, config: MatchConfig, player: PlayerId): string | null {
  if (matchState.matchEnded) return null;
  if (matchState.inTiebreak) return String(matchState.tiebreakPoints[player]);
  const gameLabels = getGamePointLabels(matchState.currentGamePoints, config.noAd);
  return player === 'player1' ? gameLabels.player1 : gameLabels.player2;
}

/** Fondo + color de texto de la píldora de puntos — los mismos pares que ya usa PointButtons
 * para el botón "PUNTO PARA" de cada jugadora, para que la cabecera y los botones se lean como
 * la misma identidad de color (lima con tinta oscura para la jugadora, coral con texto blanco
 * para la rival) en vez de inventar un azul nuevo acá. */
const PLAYER_ACCENT: Record<PlayerId, { background: string; text: string }> = {
  player1: { background: colors.ballLimeDim, text: colors.courtBlueDeep },
  player2: { background: colors.errorCoralDeep, text: '#FFFFFF' },
};

function PlayerScoreRow({
  name,
  player,
  isServing,
  sets,
  games,
  points,
}: {
  name: string;
  player: PlayerId;
  isServing: boolean;
  sets: number;
  games: number;
  points: string | null;
}) {
  const accent = PLAYER_ACCENT[player];
  return (
    <View style={styles.playerRow}>
      <View style={styles.playerRowLeft}>
        {/* Solo quien está sacando ahora mismo lleva el punto de color — no es una identidad fija
            por jugadora, es "esta es la que está sirviendo" (el resto lo dice el status bar).
            El slot del punto siempre ocupa su lugar (visible u oculto) para que el nombre arranque
            en la misma posición en las dos filas — si no, la fila sin punto se corre a la
            izquierda y los nombres quedan desalineados entre sí. */}
        <View style={[styles.identityDot, isServing ? { backgroundColor: accent.background } : styles.identityDotHidden]} />
        <Text style={styles.playerRowName} numberOfLines={1}>
          {name}
        </Text>
      </View>
      <View style={styles.playerRowRight}>
        <Text style={styles.setsValue}>{sets > 0 ? sets : '—'}</Text>
        <Text style={styles.gamesValue}>{games}</Text>
        {points !== null &&
          (isServing ? (
            <View style={[styles.pointsPill, { backgroundColor: accent.background }]}>
              <Text style={[styles.pointsPillText, { color: accent.text }]}>{points}</Text>
            </View>
          ) : (
            <Text style={styles.pointsPlain}>{points}</Text>
          ))}
      </View>
    </View>
  );
}

export default function ScoreHeader({ roundLabel }: { roundLabel: string }) {
  const { config, matchState, match } = useMatch();
  const currentServer = matchState.matchEnded ? null : getCurrentServer(matchState);
  const statusLine = matchState.matchEnded ? null : getStatusLine(matchState, config, currentServer);

  return (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.matchTag} numberOfLines={1}>
            {matchState.matchEnded ? 'PARTIDO FINALIZADO' : roundLabel}
          </Text>
          {!matchState.matchEnded && (
            <Text style={styles.formatTag} numberOfLines={1}>
              {MATCH_FORMAT_LABELS[config.format]}
            </Text>
          )}
        </View>
        {!matchState.matchEnded && <MatchTimerLabel match={match} />}
      </View>

      <View style={styles.card}>
        <PlayerScoreRow
          name={config.player1Name}
          player="player1"
          isServing={currentServer === 'player1'}
          sets={matchState.setsWon.player1}
          games={currentSetGames(matchState.currentSetGames, 'player1')}
          points={getPointValue(matchState, config, 'player1')}
        />
        <View style={styles.rowDivider} />
        <PlayerScoreRow
          name={config.player2Name}
          player="player2"
          isServing={currentServer === 'player2'}
          sets={matchState.setsWon.player2}
          games={currentSetGames(matchState.currentSetGames, 'player2')}
          points={getPointValue(matchState, config, 'player2')}
        />
        {statusLine && (
          <View style={styles.statusBar}>
            <Text style={styles.statusBarText} numberOfLines={1}>
              {statusLine}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.panel,
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  headerTop: {
    marginBottom: 12,
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  matchTag: {
    flexShrink: 1,
    marginRight: 10,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.courtBlue,
    fontWeight: '700',
  },
  formatTag: {
    flexShrink: 1,
    textAlign: 'right',
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textDim,
    fontWeight: '700',
  },
  timerLabel: {
    fontSize: 11,
    color: colors.textDim,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  card: {
    backgroundColor: colors.panelLight,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  playerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  playerRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: 8,
  },
  identityDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  identityDotHidden: {
    backgroundColor: 'transparent',
  },
  playerRowName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.lineWhite,
    flexShrink: 1,
  },
  playerRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  setsValue: {
    fontSize: 15,
    color: colors.textDim,
    minWidth: 14,
    textAlign: 'center',
  },
  gamesValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.lineWhite,
    minWidth: 22,
    textAlign: 'center',
  },
  pointsPill: {
    minWidth: 34,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    alignItems: 'center',
  },
  pointsPillText: {
    fontSize: 15,
    fontWeight: '800',
  },
  /** Puntos de quien está recibiendo — mismo tamaño que la píldora del que saca, pero sin
   * fondo de color, así el ancho de la fila no salta al cambiar el saque de lado. */
  pointsPlain: {
    minWidth: 34,
    fontSize: 15,
    fontWeight: '800',
    color: colors.textDim,
    textAlign: 'center',
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.borderSoft,
    marginHorizontal: 14,
  },
  statusBar: {
    backgroundColor: colors.panel,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  statusBarText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: colors.textDim,
  },
});
