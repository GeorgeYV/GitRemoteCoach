import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMatch } from '../context/MatchContext';
import { NewPointInput } from '../lib/matchReducer';
import { getCurrentServer } from '../lib/scoringEngine';
import { colors, radius } from '../lib/theme';
import { ErrorDirection, PlayerId, PointDetail, RallyLength, ServeDirection } from '../lib/types';
import PointButtons from './PointButtons';
import VoiceNoteRecorder from './VoiceNoteRecorder';

type Step = 'serve' | 'outcome' | 'meta';

interface PendingPoint {
  winner: PlayerId;
  server: PlayerId;
  step: Step;
  firstServeIn: boolean | null;
  serveDirection: ServeDirection | null;
  detail: PointDetail | null;
  isReturnError: boolean;
  errorDirection: ErrorDirection | null;
  rallyLength: RallyLength | null;
  netApproach: boolean;
}

const UNFORCED_ERROR_DETAILS: PointDetail[] = ['error_no_forzado', 'error_no_forzado_derecha', 'error_no_forzado_reves'];

export default function PointFlow({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { config, matchState, addPoint } = useMatch();
  const [pending, setPending] = useState<PendingPoint | null>(null);

  function startPoint(winner: PlayerId) {
    setPending({
      winner,
      server: getCurrentServer(matchState),
      step: 'serve',
      firstServeIn: null,
      serveDirection: null,
      detail: null,
      isReturnError: false,
      errorDirection: null,
      rallyLength: null,
      netApproach: false,
    });
  }

  function cancel() {
    setPending(null);
  }

  function commit(overrides: Partial<PendingPoint> = {}) {
    if (!pending) return;
    const final = { ...pending, ...overrides };
    const input: NewPointInput = {
      wonBy: final.winner,
      detail: final.detail,
      firstServeIn: final.firstServeIn ?? true,
      serveDirection: final.serveDirection,
      errorDirection: final.errorDirection,
      rallyLength: final.rallyLength,
      netApproach: final.netApproach,
      isReturnError: final.isReturnError,
    };
    addPoint(input);
    setPending(null);
  }

  if (matchState.matchEnded) {
    return <PointButtons disabled onPoint={() => {}} player1Name={config.player1Name} player2Name={config.player2Name} />;
  }

  if (!pending) {
    return (
      <View style={styles.baseContainer}>
        <PointButtons disabled={false} onPoint={startPoint} player1Name={config.player1Name} player2Name={config.player2Name} />
        <VoiceNoteRecorder onOpenMenu={onOpenMenu} />
      </View>
    );
  }

  const winnerName = pending.winner === 'player1' ? config.player1Name : config.player2Name;
  const serverName = pending.server === 'player1' ? config.player1Name : config.player2Name;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {pending.step === 'serve' && (
        <ServeStep
          pending={pending}
          serverName={serverName}
          onSetDirection={(dir) =>
            setPending((p) => (p ? { ...p, serveDirection: p.serveDirection === dir ? null : dir } : p))
          }
          onRallyInPlay={(firstServeIn) => setPending((p) => (p ? { ...p, firstServeIn, step: 'outcome' } : p))}
          onTerminal={(detail, firstServeIn) => commit({ detail, firstServeIn })}
          onCancel={cancel}
        />
      )}

      {pending.step === 'outcome' && (
        <OutcomeStep
          pending={pending}
          config={config}
          onAdvance={(detail) => setPending((p) => (p ? { ...p, detail, step: 'meta' } : p))}
          onReturnErrorShortcut={(detail) =>
            commit({ detail, isReturnError: true, rallyLength: 'corto', netApproach: false })
          }
          onCancel={cancel}
        />
      )}

      {pending.step === 'meta' && (
        <MetaStep
          pending={pending}
          winnerName={winnerName}
          onSetErrorDirection={(dir) =>
            setPending((p) => (p ? { ...p, errorDirection: p.errorDirection === dir ? null : dir } : p))
          }
          onToggleNet={() => setPending((p) => (p ? { ...p, netApproach: !p.netApproach } : p))}
          onSetRallyLength={(len) => commit({ rallyLength: len })}
          onSkip={() => commit({ rallyLength: null })}
        />
      )}
    </ScrollView>
  );
}

function ServeStep({
  pending,
  serverName,
  onSetDirection,
  onRallyInPlay,
  onTerminal,
  onCancel,
}: {
  pending: PendingPoint;
  serverName: string;
  onSetDirection: (dir: ServeDirection) => void;
  onRallyInPlay: (firstServeIn: boolean | null) => void;
  onTerminal: (detail: PointDetail, firstServeIn: boolean | null) => void;
  onCancel: () => void;
}) {
  const serverIsWinner = pending.server === pending.winner;

  return (
    <View>
      <StepHeader title={`PASO 1 · SERVICIO DE ${serverName.toUpperCase()}`} onCancel={onCancel} />

      <SectionLabel label="Dirección del saque" hint="OPCIONAL" />
      <View style={styles.row3}>
        <DirectionChip label="T" sub="A LA T" active={pending.serveDirection === 'T'} onPress={() => onSetDirection('T')} />
        <DirectionChip
          label="Cuerpo"
          sub="AL CUERPO"
          active={pending.serveDirection === 'cuerpo'}
          onPress={() => onSetDirection('cuerpo')}
        />
        <DirectionChip
          label="Abierto"
          sub="ABIERTO"
          active={pending.serveDirection === 'abierto'}
          onPress={() => onSetDirection('abierto')}
        />
      </View>

      <View style={styles.divider} />

      {pending.server === 'player1' ? (
        <>
          <OptionRow label="1º adentro" hint="RALLY EN JUEGO" onPress={() => onRallyInPlay(true)} />
          <OptionRow label="2º adentro" hint="RALLY EN JUEGO" onPress={() => onRallyInPlay(false)} />
        </>
      ) : (
        <OptionRow label="En juego" hint="RALLY EN JUEGO" onPress={() => onRallyInPlay(null)} />
      )}

      <View style={styles.divider} />
      <SectionLabel label="Cierra el punto ahora" />

      {serverIsWinner ? (
        <TerminalCard
          label={pending.server === 'player2' ? 'Ace / saque ganador rival' : 'Ace / saque ganador'}
          hint="2 TOQUES"
          onPress={() => onTerminal('ace', true)}
        />
      ) : (
        <TerminalCard
          label={pending.server === 'player2' ? 'Doble falta rival' : 'Doble falta'}
          hint="2 TOQUES"
          onPress={() => onTerminal('doble_falta', false)}
        />
      )}
    </View>
  );
}

function OutcomeStep({
  pending,
  config,
  onAdvance,
  onReturnErrorShortcut,
  onCancel,
}: {
  pending: PendingPoint;
  config: { player1Name: string; player2Name: string };
  onAdvance: (detail: PointDetail) => void;
  onReturnErrorShortcut: (detail: PointDetail) => void;
  onCancel: () => void;
}) {
  const wasRivalServing = pending.server === 'player2';

  return (
    <View>
      <StepHeader title="PASO 2 · DESENLACE DEL RALLY" onCancel={onCancel} />

      {pending.winner === 'player1' ? (
        <>
          <SectionLabel label="Ganadores" />
          <OptionRow label="Winner de derecha" onPress={() => onAdvance('winner_derecha')} />
          <OptionRow label="Winner de revés" onPress={() => onAdvance('winner_reves')} />
          <OptionRow label="Winner de volea / smash" onPress={() => onAdvance('winner_volea')} />

          <SectionLabel label="Errores" />
          <OptionRow label="Error forzado de la rival" onPress={() => onAdvance('error_forzado')} />
          <OptionRow label="Error no forzado de la rival" onPress={() => onAdvance('error_no_forzado')} />
        </>
      ) : (
        <>
          {wasRivalServing && (
            <>
              <SectionLabel label="Error en la devolución" hint="3 TOQUES" />
              <OptionRow
                label="Error NF de devolución · derecha"
                onPress={() => onReturnErrorShortcut('error_no_forzado_derecha')}
              />
              <OptionRow
                label="Error NF de devolución · revés"
                onPress={() => onReturnErrorShortcut('error_no_forzado_reves')}
              />
            </>
          )}

          <SectionLabel label="Ganador" />
          <OptionRow label="Winner de la rival" onPress={() => onAdvance('winner')} />

          <SectionLabel label="Errores" />
          <OptionRow label={`Error forzado de ${config.player1Name}`} onPress={() => onAdvance('error_forzado')} />
          <OptionRow label="Error no forzado de derecha" onPress={() => onAdvance('error_no_forzado_derecha')} />
          <OptionRow label="Error no forzado de revés" onPress={() => onAdvance('error_no_forzado_reves')} />
        </>
      )}
    </View>
  );
}

function MetaStep({
  pending,
  winnerName,
  onSetErrorDirection,
  onToggleNet,
  onSetRallyLength,
  onSkip,
}: {
  pending: PendingPoint;
  winnerName: string;
  onSetErrorDirection: (dir: ErrorDirection) => void;
  onToggleNet: () => void;
  onSetRallyLength: (len: RallyLength) => void;
  onSkip: () => void;
}) {
  const showErrorDirection = pending.detail !== null && UNFORCED_ERROR_DETAILS.includes(pending.detail);

  return (
    <View>
      <View style={styles.metaHeaderRow}>
        <Text style={styles.stepTitle}>PASO 3 · OPCIONAL, 1 TOQUE</Text>
        <Pressable onPress={onSkip} hitSlop={8}>
          <Text style={styles.cancelLabel}>Omitir y guardar</Text>
        </Pressable>
      </View>

      {showErrorDirection && (
        <>
          <SectionLabel label="Dirección del error" hint="OPCIONAL" />
          <View style={styles.row3}>
            <DirectionChip
              label="Red"
              sub="PIERNAS/MARGEN"
              active={pending.errorDirection === 'red'}
              onPress={() => onSetErrorDirection('red')}
            />
            <DirectionChip
              label="Larga"
              sub="CONTROL/TENSIÓN"
              active={pending.errorDirection === 'larga'}
              onPress={() => onSetErrorDirection('larga')}
            />
            <DirectionChip
              label="Ancha"
              sub="CONTROL/TENSIÓN"
              active={pending.errorDirection === 'ancha'}
              onPress={() => onSetErrorDirection('ancha')}
            />
          </View>
        </>
      )}

      <SectionLabel label="Duración del intercambio" />
      <View style={styles.row3}>
        <DirectionChip label="Corto" sub="1-4" active={false} onPress={() => onSetRallyLength('corto')} />
        <DirectionChip label="Medio" sub="5-8" active={false} onPress={() => onSetRallyLength('medio')} />
        <DirectionChip label="Largo" sub="9+" active={false} onPress={() => onSetRallyLength('largo')} />
      </View>

      <Pressable style={styles.netRow} onPress={onToggleNet}>
        <Text style={styles.netLabel}>Subida a la red</Text>
        <Text style={styles.netValue}>{pending.netApproach ? 'SÍ' : 'NO'}</Text>
      </Pressable>

      <Text style={styles.metaHint}>Punto para {winnerName}</Text>
    </View>
  );
}

function StepHeader({ title, onCancel }: { title: string; onCancel: () => void }) {
  return (
    <View style={styles.metaHeaderRow}>
      <Text style={styles.stepTitle}>{title}</Text>
      <Pressable onPress={onCancel} hitSlop={8}>
        <Text style={styles.cancelLabel}>Cancelar</Text>
      </Pressable>
    </View>
  );
}

function SectionLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {!!hint && <Text style={styles.sectionHint}>{hint}</Text>}
    </View>
  );
}

function OptionRow({ label, hint, onPress }: { label: string; hint?: string; onPress: () => void }) {
  return (
    <Pressable style={styles.optionRow} onPress={onPress}>
      <Text style={styles.optionLabel}>{label}</Text>
      {!!hint && <Text style={styles.optionHint}>{hint}</Text>}
    </Pressable>
  );
}

function TerminalCard({ label, hint, onPress }: { label: string; hint: string; onPress: () => void }) {
  return (
    <Pressable style={styles.terminalCard} onPress={onPress}>
      <Text style={styles.terminalLabel}>{label}</Text>
      {!!hint && <Text style={styles.terminalHint}>{hint}</Text>}
    </Pressable>
  );
}

function DirectionChip({
  label,
  sub,
  active,
  onPress,
}: {
  label: string;
  sub: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.directionChip, active && styles.directionChipActive]} onPress={onPress}>
      <Text style={[styles.directionLabel, active && styles.directionLabelActive]}>{label}</Text>
      <Text style={[styles.directionSub, active && styles.directionLabelActive]}>{sub}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 24,
  },
  baseContainer: {
    flex: 1,
    gap: 24,
  },
  metaHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  stepTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textDim,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cancelLabel: {
    fontSize: 12,
    color: colors.courtBlue,
    fontWeight: '700',
  },
  sectionLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 6,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textDim,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  sectionHint: {
    fontSize: 10,
    color: colors.textDim,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  row3: {
    flexDirection: 'row',
    gap: 8,
  },
  directionChip: {
    flex: 1,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  directionChipActive: {
    backgroundColor: colors.ballLime,
    borderColor: colors.ballLime,
  },
  directionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.lineWhite,
  },
  directionLabelActive: {
    color: colors.courtBlueDeep,
  },
  directionSub: {
    fontSize: 9,
    color: colors.textDim,
    marginTop: 2,
    letterSpacing: 0.4,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  optionRow: {
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
  optionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.lineWhite,
  },
  optionHint: {
    fontSize: 10,
    color: colors.textDim,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  terminalCard: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.courtBlue,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  terminalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.courtBlue,
  },
  terminalHint: {
    fontSize: 10,
    color: colors.courtBlue,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  netRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  netLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.lineWhite,
  },
  netValue: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textDim,
  },
  metaHint: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 12,
    color: colors.textDim,
  },
});
