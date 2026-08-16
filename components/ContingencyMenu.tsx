import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Match } from '../lib/api';
import { NewAdjustmentInput } from '../lib/matchReducer';
import { getCurrentServer, MatchState } from '../lib/scoringEngine';
import { colors, radius } from '../lib/theme';
import { PlayerId } from '../lib/types';

type SubView = 'menu' | 'pointNotSeen' | 'manualAdjustment' | 'suspendConfirm' | 'retire';

const GAME_POINT_LABELS = ['0', '15', '30', '40'];

function countCurrentGames(state: MatchState, player: PlayerId): number {
  return state.currentSetGames.filter((g) => g.winner === player).length;
}

export default function ContingencyMenu({
  visible,
  onClose,
  player1Name,
  player2Name,
  matchState,
  match,
  onPointNotSeen,
  onManualAdjustment,
  onPause,
  onResume,
  onSuspend,
  onRetire,
}: {
  visible: boolean;
  onClose: () => void;
  player1Name: string;
  player2Name: string;
  matchState: MatchState;
  match: Match;
  onPointNotSeen: (winner: PlayerId) => void;
  onManualAdjustment: (input: NewAdjustmentInput) => void;
  onPause: () => void;
  onResume: () => void;
  onSuspend: () => void;
  onRetire: (retiredBy: PlayerId) => void;
}) {
  const [subView, setSubView] = useState<SubView>('menu');
  const [gamesP1, setGamesP1] = useState(0);
  const [gamesP2, setGamesP2] = useState(0);
  const [pointsP1, setPointsP1] = useState(0);
  const [pointsP2, setPointsP2] = useState(0);
  const [server, setServer] = useState<PlayerId>('player1');

  useEffect(() => {
    if (!visible) return;
    setSubView('menu');
    setGamesP1(countCurrentGames(matchState, 'player1'));
    setGamesP2(countCurrentGames(matchState, 'player2'));
    setPointsP1(matchState.inTiebreak ? 0 : Math.min(3, matchState.currentGamePoints.player1));
    setPointsP2(matchState.inTiebreak ? 0 : Math.min(3, matchState.currentGamePoints.player2));
    setServer(getCurrentServer(matchState));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function applyAdjustment() {
    onManualAdjustment({
      gamesPlayer1: gamesP1,
      gamesPlayer2: gamesP2,
      pointsPlayer1: pointsP1,
      pointsPlayer2: pointsP2,
      server,
    });
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {subView === 'menu' && (
            <>
              <View style={styles.titleRow}>
                <Text style={styles.title}>Contingencias</Text>
                <Pressable onPress={onClose} hitSlop={8}>
                  <Text style={styles.closeLabel}>Cerrar</Text>
                </Pressable>
              </View>
              <Text style={styles.subtitle}>Todo se resuelve sin salir de la captura.</Text>

              <MenuRow label="Punto no visto" hint="SIN DATOS ANALÍT." onPress={() => setSubView('pointNotSeen')} />
              <MenuRow label="Ajuste manual del marcador" onPress={() => setSubView('manualAdjustment')} />
              <MenuRow
                label={match.pausedAt ? 'Reanudar' : 'Pausa temporal'}
                hint="LLUVIA · MÉDICO · LUZ"
                onPress={() => {
                  if (match.pausedAt) onResume();
                  else onPause();
                  onClose();
                }}
              />
              <MenuRow label="Suspender partido" onPress={() => setSubView('suspendConfirm')} />
              <MenuRow
                label="Terminar por retiro"
                hint="LESIÓN · DESCALIF."
                onPress={() => setSubView('retire')}
              />
            </>
          )}

          {subView === 'pointNotSeen' && (
            <>
              <View style={styles.titleRow}>
                <Text style={styles.title}>¿Quién ganó el punto?</Text>
                <Pressable onPress={() => setSubView('menu')} hitSlop={8}>
                  <Text style={styles.closeLabel}>Atrás</Text>
                </Pressable>
              </View>
              <Text style={styles.subtitle}>
                El marcador avanza igual — el punto queda fuera de los porcentajes de saque, winners y errores.
              </Text>

              <MenuRow label={player1Name} onPress={() => onPointNotSeen('player1')} />
              <MenuRow label={player2Name} onPress={() => onPointNotSeen('player2')} />
              <MenuRow label="Desconocido" hint="NO AVANZA" onPress={onClose} />
            </>
          )}

          {subView === 'manualAdjustment' && (
            <ScrollView>
              <View style={styles.titleRow}>
                <Text style={styles.title}>Ajuste manual del marcador</Text>
                <Pressable onPress={() => setSubView('menu')} hitSlop={8}>
                  <Text style={styles.closeLabel}>Atrás</Text>
                </Pressable>
              </View>
              <Text style={styles.subtitle}>Solo afecta el set en curso.</Text>

              <Text style={styles.fieldLabel}>Juegos</Text>
              <GameStepper label={player1Name} value={gamesP1} onChange={setGamesP1} />
              <GameStepper label={player2Name} value={gamesP2} onChange={setGamesP2} />

              <Text style={styles.fieldLabel}>Puntos de {player1Name}</Text>
              <PointShortcuts value={pointsP1} onChange={setPointsP1} />

              <Text style={styles.fieldLabel}>Puntos de {player2Name}</Text>
              <PointShortcuts value={pointsP2} onChange={setPointsP2} />

              <Text style={styles.fieldLabel}>Saca ahora</Text>
              <View style={styles.row3}>
                <ChoiceChip label={player1Name} active={server === 'player1'} onPress={() => setServer('player1')} />
                <ChoiceChip label={player2Name} active={server === 'player2'} onPress={() => setServer('player2')} />
              </View>

              <Pressable style={styles.applyButton} onPress={applyAdjustment}>
                <Text style={styles.applyLabel}>Aplicar ajuste</Text>
              </Pressable>
            </ScrollView>
          )}

          {subView === 'suspendConfirm' && (
            <>
              <View style={styles.titleRow}>
                <Text style={styles.title}>Suspender partido</Text>
                <Pressable onPress={() => setSubView('menu')} hitSlop={8}>
                  <Text style={styles.closeLabel}>Atrás</Text>
                </Pressable>
              </View>
              <Text style={styles.subtitle}>
                El marcador queda guardado. Al reabrir la app vas a poder retomar en el mismo set, juego y saque.
              </Text>

              <Pressable
                style={styles.applyButton}
                onPress={() => {
                  onSuspend();
                  onClose();
                }}
              >
                <Text style={styles.applyLabel}>Suspender ahora</Text>
              </Pressable>
            </>
          )}

          {subView === 'retire' && (
            <>
              <View style={styles.titleRow}>
                <Text style={styles.title}>¿Quién abandona?</Text>
                <Pressable onPress={() => setSubView('menu')} hitSlop={8}>
                  <Text style={styles.closeLabel}>Atrás</Text>
                </Pressable>
              </View>
              <Text style={styles.subtitle}>
                El partido se cierra con las métricas hasta este punto y queda marcado como retiro.
              </Text>

              <MenuRow
                label={player1Name}
                onPress={() => {
                  onRetire('player1');
                  onClose();
                }}
              />
              <MenuRow
                label={player2Name}
                onPress={() => {
                  onRetire('player2');
                  onClose();
                }}
              />
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MenuRow({ label, hint, onPress }: { label: string; hint?: string; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Text style={styles.rowLabel}>{label}</Text>
      {!!hint && <Text style={styles.rowHint}>{hint}</Text>}
    </Pressable>
  );
}

function GameStepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable style={styles.stepperBtn} onPress={() => onChange(Math.max(0, value - 1))}>
          <Text style={styles.stepperBtnLabel}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{value}</Text>
        <Pressable style={styles.stepperBtn} onPress={() => onChange(Math.min(7, value + 1))}>
          <Text style={styles.stepperBtnLabel}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PointShortcuts({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.row3}>
      {GAME_POINT_LABELS.map((label, index) => (
        <ChoiceChip key={label} label={label} active={value === index} onPress={() => onChange(index)} />
      ))}
    </View>
  );
}

function ChoiceChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(14,32,56,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.panelLight,
    borderTopLeftRadius: radius,
    borderTopRightRadius: radius,
    padding: 20,
    paddingBottom: 32,
    maxHeight: '85%',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.lineWhite,
  },
  closeLabel: {
    fontSize: 13,
    color: colors.courtBlue,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    color: colors.textDim,
    marginTop: 4,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.lineWhite,
  },
  rowHint: {
    fontSize: 10,
    color: colors.textDim,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textDim,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 8,
  },
  stepperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  stepperLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.lineWhite,
    flexShrink: 1,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.ballLime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.courtBlueDeep,
  },
  stepperValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.lineWhite,
    minWidth: 20,
    textAlign: 'center',
  },
  row3: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  chip: {
    flex: 1,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: colors.ballLime,
    borderColor: colors.ballLime,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.lineWhite,
  },
  chipLabelActive: {
    color: colors.courtBlueDeep,
  },
  applyButton: {
    backgroundColor: colors.courtBlue,
    borderRadius: radius,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  applyLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});
