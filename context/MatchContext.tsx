import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { computeMatchState, MatchState } from '../lib/scoringEngine';
import { computeMatchStats, MatchStats } from '../lib/statsEngine';
import {
  createPointEvent,
  createScoreAdjustment,
  createVoiceNote,
  initialReducerState,
  matchReducer,
  MatchReducerState,
  NewAdjustmentInput,
  NewPointInput,
  NewVoiceNoteInput,
} from '../lib/matchReducer';
import { MatchConfig, PlayerId, PointEvent, ScoreAdjustment, VoiceNote } from '../lib/types';
import { getRecordingFileInfo } from '../lib/useVoiceRecorder';
import {
  ApiError,
  createMatchPoint,
  createMatchPointsBulk,
  createMatchScoreAdjustment,
  deleteMatchPoint,
  deleteMatchVoiceNote,
  Match,
  MatchPointInput,
  MatchScoreAdjustmentInput,
  pauseMatch as apiPauseMatch,
  resumeMatch as apiResumeMatch,
  resumeSuspendedMatch as apiResumeSuspendedMatch,
  restartMatch,
  retireMatch as apiRetireMatch,
  suspendMatch as apiSuspendMatch,
  updateMatchObservations,
  updateMatchStatus,
  uploadVoiceNote,
} from '../lib/api';

const STORAGE_KEY_PREFIX = 'tennis-live-capture:match-v1';
const OBSERVATIONS_DEBOUNCE_MS = 800;

/** Sin el matchId, un partido recién terminado (matchClosed: true, ya persistido) quedaba en la
 * misma clave global y se lo "heredaba" el próximo partido con otro alumno — el coach terminaba
 * en la pantalla de resumen del partido anterior en vez de arrancar uno nuevo. Cada partido ahora
 * tiene su propio slot; retomar el MISMO partido (recarga, reanudar suspendido) sigue funcionando
 * porque createOrGetMatch es idempotente por bookingId y por lo tanto devuelve el mismo matchId. */
function storageKeyFor(matchId: string): string {
  return `${STORAGE_KEY_PREFIX}:${matchId}`;
}

interface MatchContextValue {
  config: MatchConfig;
  reducerState: MatchReducerState;
  matchState: MatchState;
  stats: MatchStats;
  /** Fila `matches` en vivo — status/pausedAt/totalPausedSeconds/retiredBy, para el cronómetro
   * del header y las pantallas de pausado/suspendido/retiro. */
  match: Match;
  addPoint: (input: NewPointInput) => void;
  addAdjustment: (input: NewAdjustmentInput) => void;
  addVoiceNote: (input: NewVoiceNoteInput) => void;
  deleteVoiceNote: (id: string) => void;
  undoLast: () => void;
  closeMatch: () => void;
  reopenMatch: () => void;
  pauseMatch: () => void;
  resumeMatch: () => void;
  suspendMatch: () => void;
  resumeSuspendedMatch: () => void;
  retireMatch: (retiredBy: PlayerId) => void;
  setObservations: (text: string) => void;
  resetMatch: () => void;
  canUndo: boolean;
  /** 0-3: cuántos niveles de deshacer quedan disponibles ahora mismo. */
  undoBudget: number;
  /** Error de la última sincronización con el servidor fallida (nunca bloquea la captura local). */
  syncError: string | null;
  /** Reenvía todos los puntos y ajustes locales actuales — botón "Reintentar sincronización". */
  retrySync: () => void;
}

const MatchContext = createContext<MatchContextValue | null>(null);

function toPointInput(event: PointEvent, sequenceNumber: number): MatchPointInput {
  return {
    sequenceNumber,
    wonBy: event.wonBy,
    detail: event.detail,
    firstServeIn: event.firstServeIn,
    serveDirection: event.serveDirection,
    errorDirection: event.errorDirection,
    rallyLength: event.rallyLength,
    netApproach: event.netApproach,
    isReturnError: event.isReturnError,
  };
}

function toAdjustmentInput(adjustment: ScoreAdjustment, sequenceNumber: number): MatchScoreAdjustmentInput {
  return {
    sequenceNumber,
    gamesPlayer1: adjustment.gamesPlayer1,
    gamesPlayer2: adjustment.gamesPlayer2,
    pointsPlayer1: adjustment.pointsPlayer1,
    pointsPlayer2: adjustment.pointsPlayer2,
    server: adjustment.server,
  };
}

function uploadVoiceNoteInput(note: VoiceNote) {
  const { name, type } = getRecordingFileInfo();
  return {
    uri: note.uri,
    name,
    type,
    sequenceNumber: note.sequenceNumber,
    durationMs: note.durationMs,
    scoreLabel: note.scoreLabel,
    setIndex: note.setIndex,
    gameIndex: note.gameIndex,
    isTiebreak: note.isTiebreak,
  };
}

/** Segundos transcurridos de una pausa que empezó en `pausedAtIso`, nunca negativo (protege
 * contra reloj del cliente desincronizado). */
function elapsedPauseSeconds(pausedAtIso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(pausedAtIso).getTime()) / 1000));
}

export function MatchProvider({
  config,
  initialMatch,
  children,
}: {
  config: MatchConfig;
  /** Fila matches ya creada/resuelta (server) antes de montar este provider — ver App.tsx CoachMatchDayFlow. */
  initialMatch: Match;
  children: React.ReactNode;
}) {
  const { token } = useAuth();
  const matchId = initialMatch.id;
  const [match, setMatch] = useState<Match>(initialMatch);
  const [reducerState, dispatch] = useReducer(matchReducer, initialReducerState);
  const hydrated = useRef(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  // Cadena de sincronización: cada llamada al servidor se encola aquí para que nunca compitan
  // entre sí (crítico para respetar el UNIQUE(match_id, sequence_number) ante un undo rápido
  // seguido de un punto nuevo, por ejemplo). Un fallo no rompe la cadena — solo se reporta.
  const chainRef = useRef<Promise<void>>(Promise.resolve());

  // Sin token solo pasa en /dev-preview (fuera del guard de auth) — la captura sigue funcionando
  // 100% local (AsyncStorage es la fuente de verdad durante el partido), simplemente no hay con
  // qué sesión sincronizar todavía, así que enqueue se vuelve un no-op en vez de fallar.
  function enqueue(fn: (authToken: string) => Promise<unknown>) {
    if (!token) return;
    const authToken = token;
    chainRef.current = chainRef.current.then(async () => {
      try {
        await fn(authToken);
        setSyncError(null);
      } catch (err) {
        setSyncError(err instanceof ApiError ? err.message : 'No se pudo sincronizar con el servidor');
      }
    });
  }

  function bulkSync(events: PointEvent[], adjustments: ScoreAdjustment[], voiceNotes: VoiceNote[]) {
    if (events.length > 0) {
      // events.map(toPointInput) would pass Array.map's 0-based index straight through as
      // sequenceNumber — off by one against the server's 1-based, positive-only sequence.
      enqueue((authToken) => createMatchPointsBulk(authToken, matchId, events.map((event, i) => toPointInput(event, i + 1))));
    }
    // No bulk endpoint for adjustments (rare enough not to need one) — each call is idempotent
    // by (match_id, sequence_number), same as points, so resending already-synced ones is safe.
    adjustments.forEach((adjustment, i) => {
      enqueue((authToken) => createMatchScoreAdjustment(authToken, matchId, toAdjustmentInput(adjustment, i + 1)));
    });
    // Tampoco hay bulk endpoint para notas de voz — cada nota ya trae su propio sequenceNumber
    // (asignado al grabar, no por posición), así que reenviarlas todas es tan idempotente como
    // los puntos: ON CONFLICT (match_id, sequence_number) DO NOTHING en el servidor.
    voiceNotes.forEach((note) => {
      enqueue((authToken) => uploadVoiceNote(authToken, matchId, uploadVoiceNoteInput(note)));
    });
  }

  /** Undo del botón "Deshacer" del header — respeta la pila de 3 niveles. */
  function performUndo() {
    if (reducerState.undoBudget <= 0) return;
    const sequenceNumber = reducerState.events.length;
    dispatch({ type: 'UNDO_LAST' });
    enqueue((authToken) => deleteMatchPoint(authToken, matchId, sequenceNumber));
  }

  /** Deshace el último punto sin tocar la pila de 3 niveles — usado solo por reopenMatch para
   * corregir el punto que acaba de cerrar el partido, que no es el caso que ese límite protege. */
  function forceUndo() {
    if (reducerState.events.length === 0) return;
    const sequenceNumber = reducerState.events.length;
    dispatch({ type: 'FORCE_UNDO_LAST' });
    enqueue((authToken) => deleteMatchPoint(authToken, matchId, sequenceNumber));
  }

  useEffect(() => {
    AsyncStorage.getItem(storageKeyFor(matchId)).then((raw) => {
      if (raw) {
        try {
          const parsed: MatchReducerState = JSON.parse(raw);
          dispatch({ type: 'LOAD_STATE', payload: parsed });
          // Recuperación tras cierre/crash: reenvía todo lo que ya estaba capturado localmente —
          // idempotente en el servidor (ON CONFLICT DO NOTHING por sequence_number), así que lo
          // que sí llegó a sincronizarse antes no se duplica.
          bulkSync(parsed.events, parsed.adjustments, parsed.voiceNotes);
        } catch {
          // ignore corrupt persisted state, start fresh
        }
      }
      hydrated.current = true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(storageKeyFor(matchId), JSON.stringify(reducerState)).catch(() => {});
  }, [reducerState, matchId]);

  // Observaciones del entrenador: el TextInput actualiza el estado local en cada tecla (sin
  // cambio de UX); solo se sincroniza al servidor cuando el usuario deja de escribir.
  useEffect(() => {
    if (!hydrated.current) return;
    const handle = setTimeout(() => {
      enqueue((authToken) => updateMatchObservations(authToken, matchId, reducerState.observations));
    }, OBSERVATIONS_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducerState.observations]);

  const matchState = useMemo(
    () => computeMatchState(reducerState.events, config, reducerState.adjustments),
    [reducerState.events, reducerState.adjustments, config]
  );
  const stats = useMemo(() => computeMatchStats(matchState), [matchState]);

  const value: MatchContextValue = {
    config,
    reducerState,
    matchState,
    stats,
    match,
    addPoint: (input) => {
      const sequenceNumber = reducerState.events.length + 1;
      const event = createPointEvent(input);
      dispatch({ type: 'ADD_POINT', payload: event });
      enqueue((authToken) => createMatchPoint(authToken, matchId, toPointInput(event, sequenceNumber)));
    },
    addAdjustment: (input) => {
      const sequenceNumber = reducerState.adjustments.length + 1;
      const adjustment = createScoreAdjustment(input);
      dispatch({ type: 'ADD_ADJUSTMENT', payload: adjustment });
      enqueue((authToken) => createMatchScoreAdjustment(authToken, matchId, toAdjustmentInput(adjustment, sequenceNumber)));
    },
    addVoiceNote: (input) => {
      const note = createVoiceNote(input, reducerState.nextVoiceNoteSequence);
      dispatch({ type: 'ADD_VOICE_NOTE', payload: note });
      enqueue((authToken) => uploadVoiceNote(authToken, matchId, uploadVoiceNoteInput(note)));
    },
    deleteVoiceNote: (id) => {
      const note = reducerState.voiceNotes.find((n) => n.id === id);
      dispatch({ type: 'DELETE_VOICE_NOTE', payload: { id } });
      if (note) enqueue((authToken) => deleteMatchVoiceNote(authToken, matchId, note.sequenceNumber));
    },
    undoLast: performUndo,
    closeMatch: () => {
      dispatch({ type: 'CLOSE_MATCH' });
      enqueue((authToken) => updateMatchStatus(authToken, matchId, 'completed'));
    },
    reopenMatch: () => {
      // if the match ended on its own, undoing its final point is what actually
      // lets the coach get back into LiveCaptureView (matchEnded is derived from
      // events, not a flag REOPEN_MATCH alone can clear).
      if (matchState.matchEnded) forceUndo();
      dispatch({ type: 'REOPEN_MATCH' });
      enqueue((authToken) => updateMatchStatus(authToken, matchId, 'in_progress'));
    },
    pauseMatch: () => {
      if (match.pausedAt) return;
      setMatch((m) => ({ ...m, pausedAt: new Date().toISOString() }));
      enqueue((authToken) => apiPauseMatch(authToken, matchId));
    },
    resumeMatch: () => {
      if (!match.pausedAt) return;
      const paused = elapsedPauseSeconds(match.pausedAt);
      setMatch((m) => ({ ...m, pausedAt: null, totalPausedSeconds: m.totalPausedSeconds + paused }));
      enqueue((authToken) => apiResumeMatch(authToken, matchId));
    },
    suspendMatch: () => {
      setMatch((m) => ({ ...m, status: 'suspended', pausedAt: m.pausedAt ?? new Date().toISOString() }));
      enqueue((authToken) => apiSuspendMatch(authToken, matchId));
    },
    resumeSuspendedMatch: () => {
      const paused = match.pausedAt ? elapsedPauseSeconds(match.pausedAt) : 0;
      setMatch((m) => ({ ...m, status: 'in_progress', pausedAt: null, totalPausedSeconds: m.totalPausedSeconds + paused }));
      enqueue((authToken) => apiResumeSuspendedMatch(authToken, matchId));
    },
    retireMatch: (retiredBy) => {
      setMatch((m) => ({ ...m, status: 'completed', retiredBy }));
      dispatch({ type: 'CLOSE_MATCH' });
      enqueue((authToken) => apiRetireMatch(authToken, matchId, retiredBy));
    },
    setObservations: (text) => dispatch({ type: 'SET_OBSERVATIONS', payload: text }),
    resetMatch: () => {
      dispatch({ type: 'RESET' });
      // clears status/pausedAt/totalPausedSeconds/retiredBy too — matchRepository.resetForRestart
      // does the same server-side, so stale retiro/pausa data from the previous match doesn't
      // leak into what the coach sees as a brand new one.
      setMatch((m) => ({ ...m, status: 'in_progress', completedAt: null, pausedAt: null, totalPausedSeconds: 0, retiredBy: null }));
      AsyncStorage.removeItem(storageKeyFor(matchId)).catch(() => {});
      enqueue((authToken) => restartMatch(authToken, matchId));
    },
    canUndo: reducerState.undoBudget > 0,
    undoBudget: reducerState.undoBudget,
    syncError,
    retrySync: () => bulkSync(reducerState.events, reducerState.adjustments, reducerState.voiceNotes),
  };

  return <MatchContext.Provider value={value}>{children}</MatchContext.Provider>;
}

export function useMatch(): MatchContextValue {
  const ctx = useContext(MatchContext);
  if (!ctx) throw new Error('useMatch must be used within a MatchProvider');
  return ctx;
}
