import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMatch } from '../context/MatchContext';
import { NewPointInput } from '../lib/matchReducer';
import { getCurrentServer } from '../lib/scoringEngine';
import {
  CATEGORY_NEEDS_ERROR_DIRECTION,
  POINT_OUTCOME_CATEGORY_LABELS,
  PointOutcomeCategory,
  SHOT_TYPE_OPTIONS,
  ShotType,
} from '../lib/shotTypes';
import { colors, radius } from '../lib/theme';
import { ErrorDirection, Lado, PlayerId, PointDetail, RallyLength, ServeDirection, otherPlayer } from '../lib/types';
import PointButtons from './PointButtons';
import VoiceNoteRecorder from './VoiceNoteRecorder';

export default function PointFlow({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { config, matchState, match } = useMatch();

  if (matchState.matchEnded) {
    return <PointButtons disabled onPoint={() => {}} player1Name={config.player1Name} player2Name={config.player2Name} />;
  }

  return match.captureMode === 'detallada' ? (
    <DetailedPointFlow onOpenMenu={onOpenMenu} />
  ) : (
    <RapidaPointFlow onOpenMenu={onOpenMenu} />
  );
}

// =====================================================================
// Modo 'rapida' — flujo original, sin cambios.
// =====================================================================

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

function RapidaPointFlow({ onOpenMenu }: { onOpenMenu: () => void }) {
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
      lado: null,
      shotType: null,
    };
    addPoint(input);
    setPending(null);
  }

  if (!pending) {
    return (
      <View style={styles.baseContainer}>
        <PointButtons
          disabled={false}
          onPoint={startPoint}
          player1Name={config.player1Name}
          player2Name={config.player2Name}
          servingPlayer={getCurrentServer(matchState)}
        />
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

// =====================================================================
// Modo 'detallada' — árbol de tipo de golpe (ver lib/shotTypes.ts).
// Solo se monta cuando match.captureMode === 'detallada' — hoy ningún
// partido nuevo lo pide todavía (ver previewFlows.tsx), así que este
// árbol queda sin uso real hasta que se habilite ese modo a propósito.
// =====================================================================

type DetailedStep = 'serve' | 'returnError' | 'shotType' | 'close';

interface PendingDetailedPoint {
  winner: PlayerId;
  server: PlayerId;
  step: DetailedStep;
  serveDirection: ServeDirection | null;
  category: PointOutcomeCategory | null;
  shotType: ShotType | null;
  shotNetApproach: boolean;
  lado: Lado | null;
  errorDirection: ErrorDirection | null;
}

function DetailedPointFlow({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { config, matchState, addPoint } = useMatch();
  const [pending, setPending] = useState<PendingDetailedPoint | null>(null);

  function startPoint(winner: PlayerId) {
    setPending({
      winner,
      server: getCurrentServer(matchState),
      step: 'serve',
      serveDirection: null,
      category: null,
      shotType: null,
      shotNetApproach: false,
      lado: null,
      errorDirection: null,
    });
  }

  function cancel() {
    setPending(null);
  }

  function commit(input: NewPointInput) {
    addPoint(input);
    setPending(null);
  }

  function commitAce() {
    if (!pending || !pending.serveDirection) return;
    commit({
      wonBy: pending.winner,
      detail: 'ace',
      firstServeIn: true,
      serveDirection: pending.serveDirection,
      errorDirection: null,
      rallyLength: 'corto',
      netApproach: false,
      isReturnError: false,
      lado: null,
      shotType: null,
    });
  }

  function commitDoubleFault() {
    if (!pending) return;
    commit({
      wonBy: pending.winner,
      detail: 'doble_falta',
      firstServeIn: false,
      serveDirection: null,
      errorDirection: null,
      rallyLength: null,
      netApproach: false,
      isReturnError: false,
      lado: null,
      shotType: null,
    });
  }

  function commitReturnError(lado: Lado) {
    if (!pending) return;
    commit({
      wonBy: pending.winner,
      detail: lado === 'derecha' ? 'error_no_forzado_derecha' : 'error_no_forzado_reves',
      firstServeIn: true,
      serveDirection: null,
      errorDirection: pending.errorDirection,
      rallyLength: 'corto',
      netApproach: false,
      isReturnError: true,
      lado: null,
      shotType: null,
    });
  }

  function commitClose(rallyLength: RallyLength) {
    if (!pending || !pending.category || !pending.shotType) return;
    commit({
      wonBy: pending.winner,
      detail: pending.category,
      firstServeIn: true,
      serveDirection: null,
      errorDirection: pending.errorDirection,
      rallyLength,
      netApproach: pending.shotNetApproach,
      isReturnError: false,
      lado: pending.lado,
      shotType: pending.shotType,
    });
  }

  if (!pending) {
    return (
      <View style={styles.baseContainer}>
        <PointButtons
          disabled={false}
          onPoint={startPoint}
          player1Name={config.player1Name}
          player2Name={config.player2Name}
          servingPlayer={getCurrentServer(matchState)}
        />
        <VoiceNoteRecorder onOpenMenu={onOpenMenu} />
      </View>
    );
  }

  const serverName = pending.server === 'player1' ? config.player1Name : config.player2Name;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {pending.step === 'serve' && (
        <DetailedServeStep
          pending={pending}
          serverName={serverName}
          config={config}
          onSetDirection={(dir) =>
            setPending((p) => (p ? { ...p, serveDirection: p.serveDirection === dir ? null : dir } : p))
          }
          onAce={commitAce}
          onDoubleFault={commitDoubleFault}
          onReturnError={() => setPending((p) => (p ? { ...p, step: 'returnError' } : p))}
          onCategory={(category) => setPending((p) => (p ? { ...p, category, step: 'shotType' } : p))}
          onCancel={cancel}
        />
      )}

      {pending.step === 'returnError' && (
        <ReturnErrorStep
          pending={pending}
          onSetErrorDirection={(dir) =>
            setPending((p) => (p ? { ...p, errorDirection: p.errorDirection === dir ? null : dir } : p))
          }
          onClose={commitReturnError}
          onCancel={cancel}
        />
      )}

      {pending.step === 'shotType' && pending.category && (
        <ShotTypeStep
          category={pending.category}
          onSelect={(shotType, netApproach) =>
            setPending((p) => (p ? { ...p, shotType, shotNetApproach: netApproach, step: 'close' } : p))
          }
          onCancel={cancel}
        />
      )}

      {pending.step === 'close' && pending.category && (
        <CloseStep
          pending={pending}
          category={pending.category}
          onSetLado={(lado) => setPending((p) => (p ? { ...p, lado: p.lado === lado ? null : lado } : p))}
          onSetErrorDirection={(dir) =>
            setPending((p) => (p ? { ...p, errorDirection: p.errorDirection === dir ? null : dir } : p))
          }
          onClose={commitClose}
          onCancel={cancel}
        />
      )}
    </ScrollView>
  );
}

function DetailedServeStep({
  pending,
  serverName,
  config,
  onSetDirection,
  onAce,
  onDoubleFault,
  onReturnError,
  onCategory,
  onCancel,
}: {
  pending: PendingDetailedPoint;
  serverName: string;
  config: { player1Name: string };
  onSetDirection: (dir: ServeDirection) => void;
  onAce: () => void;
  onDoubleFault: () => void;
  onReturnError: () => void;
  onCategory: (category: PointOutcomeCategory) => void;
  onCancel: () => void;
}) {
  const serverIsWinner = pending.server === pending.winner;
  const loser = otherPlayer(pending.winner);
  const receiver = otherPlayer(pending.server);
  const receiverName = receiver === 'player1' ? config.player1Name : 'rival';
  const errorSectionLabel = `Error de ${loser === 'player1' ? config.player1Name : 'rival'}`;
  const winnerSectionLabel = `Winner de ${pending.winner === 'player1' ? config.player1Name : 'rival'}`;

  return (
    <View>
      <StepHeader title={`PASO 1 · SERVICIO DE ${serverName.toUpperCase()}`} onCancel={onCancel} />

      <SectionLabel label="Dirección del saque" hint="OBLIGATORIO PARA ACE" />
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
      <SectionLabel label="Cierra el punto ahora" />

      {serverIsWinner ? (
        <>
          <TerminalCard
            label={pending.server === 'player2' ? 'Ace / saque ganador rival' : 'Ace / saque ganador'}
            hint={pending.serveDirection ? '3 TOQUES' : 'ELEGÍ DIRECCIÓN'}
            disabled={!pending.serveDirection}
            onPress={onAce}
          />
          <TerminalCard label={`Error de devolución de ${receiverName}`} hint="" onPress={onReturnError} />
        </>
      ) : (
        <TerminalCard
          label={pending.server === 'player2' ? 'Doble falta rival' : 'Doble falta'}
          hint="2 TOQUES"
          onPress={onDoubleFault}
        />
      )}

      <View style={styles.divider} />
      <SectionLabel label="Rally en juego" />

      <SectionLabel label={errorSectionLabel} />
      <OptionRow label={POINT_OUTCOME_CATEGORY_LABELS.error_no_forzado} onPress={() => onCategory('error_no_forzado')} />
      <OptionRow
        label={POINT_OUTCOME_CATEGORY_LABELS.error_no_forzado_volea}
        onPress={() => onCategory('error_no_forzado_volea')}
      />
      <OptionRow label={POINT_OUTCOME_CATEGORY_LABELS.error_forzado} onPress={() => onCategory('error_forzado')} />

      <SectionLabel label={winnerSectionLabel} />
      <OptionRow label={POINT_OUTCOME_CATEGORY_LABELS.winner} onPress={() => onCategory('winner')} />
      <OptionRow label={POINT_OUTCOME_CATEGORY_LABELS.winner_volea} onPress={() => onCategory('winner_volea')} />
    </View>
  );
}

function ReturnErrorStep({
  pending,
  onSetErrorDirection,
  onClose,
  onCancel,
}: {
  pending: PendingDetailedPoint;
  onSetErrorDirection: (dir: ErrorDirection) => void;
  onClose: (lado: Lado) => void;
  onCancel: () => void;
}) {
  return (
    <View>
      <StepHeader title="PASO 2 · ERROR DE DEVOLUCIÓN" onCancel={onCancel} />

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

      <View style={styles.divider} />
      <SectionLabel label="Tipo de golpe" />
      <OptionRow label="Derecha" onPress={() => onClose('derecha')} />
      <OptionRow label="Revés" onPress={() => onClose('reves')} />
    </View>
  );
}

function ShotTypeStep({
  category,
  onSelect,
  onCancel,
}: {
  category: PointOutcomeCategory;
  onSelect: (shotType: ShotType, netApproach: boolean) => void;
  onCancel: () => void;
}) {
  return (
    <View>
      <StepHeader title="PASO 3 · TIPO DE GOLPE" onCancel={onCancel} />
      <SectionLabel label={`${POINT_OUTCOME_CATEGORY_LABELS[category]} — ¿con qué golpe?`} />
      {SHOT_TYPE_OPTIONS[category].map((option) => (
        <OptionRow
          key={option.value}
          label={option.label}
          hint={option.netApproach ? 'SUBE A LA RED' : undefined}
          onPress={() => onSelect(option.value, option.netApproach)}
        />
      ))}
    </View>
  );
}

function CloseStep({
  pending,
  category,
  onSetLado,
  onSetErrorDirection,
  onClose,
  onCancel,
}: {
  pending: PendingDetailedPoint;
  category: PointOutcomeCategory;
  onSetLado: (lado: Lado) => void;
  onSetErrorDirection: (dir: ErrorDirection) => void;
  onClose: (len: RallyLength) => void;
  onCancel: () => void;
}) {
  const needsErrorDirection = CATEGORY_NEEDS_ERROR_DIRECTION[category];

  return (
    <View>
      <StepHeader title="PASO 4 · CERRAR EL PUNTO" onCancel={onCancel} />

      <SectionLabel label="Lado" hint="OPCIONAL" />
      <View style={styles.row3}>
        <DirectionChip label="Derecha" sub="" active={pending.lado === 'derecha'} onPress={() => onSetLado('derecha')} />
        <DirectionChip label="Revés" sub="" active={pending.lado === 'reves'} onPress={() => onSetLado('reves')} />
      </View>

      {needsErrorDirection && (
        <>
          <View style={styles.divider} />
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

      <View style={styles.divider} />
      <SectionLabel label="Duración del intercambio" />
      <View style={styles.row3}>
        <DirectionChip label="Corto" sub="1-4" active={false} onPress={() => onClose('corto')} />
        <DirectionChip label="Medio" sub="5-8" active={false} onPress={() => onClose('medio')} />
        <DirectionChip label="Largo" sub="9+" active={false} onPress={() => onClose('largo')} />
      </View>
    </View>
  );
}

// =====================================================================
// Componentes y estilos compartidos por los dos modos.
// =====================================================================

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

function TerminalCard({
  label,
  hint,
  disabled,
  onPress,
}: {
  label: string;
  hint: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.terminalCard, disabled && styles.terminalCardDisabled]}
      disabled={disabled}
      onPress={onPress}
    >
      <Text style={[styles.terminalLabel, disabled && styles.terminalLabelDisabled]}>{label}</Text>
      {!!hint && <Text style={[styles.terminalHint, disabled && styles.terminalLabelDisabled]}>{hint}</Text>}
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
      {!!sub && <Text style={[styles.directionSub, active && styles.directionLabelActive]}>{sub}</Text>}
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
  terminalCardDisabled: {
    borderColor: colors.border,
    opacity: 0.6,
  },
  terminalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.courtBlue,
  },
  terminalLabelDisabled: {
    color: colors.textDim,
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
