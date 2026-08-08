import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { computeMatchState, MatchState } from '../lib/scoringEngine';
import { computeMatchStats, MatchStats } from '../lib/statsEngine';
import {
  CaptureMode,
  createPointEvent,
  initialReducerState,
  matchReducer,
  MatchReducerState,
} from '../lib/matchReducer';
import { MatchConfig, PlayerId, PointEvent, PointDetail } from '../lib/types';
import {
  ApiError,
  createMatchPoint,
  createMatchPointsBulk,
  deleteMatchPoint,
  MatchPointInput,
  restartMatch,
  updateMatchCaptureMode,
  updateMatchObservations,
  updateMatchStatus,
} from '../lib/api';

const STORAGE_KEY = 'tennis-live-capture:match-v1';
const OBSERVATIONS_DEBOUNCE_MS = 800;

interface MatchContextValue {
  config: MatchConfig;
  reducerState: MatchReducerState;
  matchState: MatchState;
  stats: MatchStats;
  addPoint: (wonBy: PlayerId, detail: PointDetail | null, firstServeIn?: boolean) => void;
  undoLast: () => void;
  setMode: (mode: CaptureMode) => void;
  closeMatch: () => void;
  reopenMatch: () => void;
  setObservations: (text: string) => void;
  resetMatch: () => void;
  canUndo: boolean;
  /** Error de la última sincronización con el servidor fallida (nunca bloquea la captura local). */
  syncError: string | null;
  /** Reenvía todos los puntos locales actuales — botón "Reintentar sincronización". */
  retrySync: () => void;
}

const MatchContext = createContext<MatchContextValue | null>(null);

function toPointInput(event: PointEvent, sequenceNumber: number): MatchPointInput {
  return { sequenceNumber, wonBy: event.wonBy, detail: event.detail, firstServeIn: event.firstServeIn };
}

export function MatchProvider({
  config,
  matchId,
  children,
}: {
  config: MatchConfig;
  /** Fila matches ya creada/resuelta (server) antes de montar este provider — ver App.tsx CoachMatchDayFlow. */
  matchId: string;
  children: React.ReactNode;
}) {
  const { token } = useAuth();
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

  function bulkSync(events: PointEvent[]) {
    if (events.length === 0) return;
    enqueue((authToken) => createMatchPointsBulk(authToken, matchId, events.map(toPointInput)));
  }

  /** Compartido por undoLast y reopenMatch (que también deshace el punto final del partido). */
  function performUndo() {
    const sequenceNumber = reducerState.events.length;
    dispatch({ type: 'UNDO_LAST' });
    if (sequenceNumber > 0) {
      enqueue((authToken) => deleteMatchPoint(authToken, matchId, sequenceNumber));
    }
  }

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed: MatchReducerState = JSON.parse(raw);
          dispatch({ type: 'LOAD_STATE', payload: parsed });
          // Recuperación tras cierre/crash: reenvía todo lo que ya estaba capturado localmente —
          // idempotente en el servidor (ON CONFLICT DO NOTHING por sequence_number), así que los
          // puntos que sí llegaron a sincronizarse antes no se duplican.
          bulkSync(parsed.events);
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
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reducerState)).catch(() => {});
  }, [reducerState]);

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
    () => computeMatchState(reducerState.events, config),
    [reducerState.events, config]
  );
  const stats = useMemo(() => computeMatchStats(matchState), [matchState]);

  const value: MatchContextValue = {
    config,
    reducerState,
    matchState,
    stats,
    addPoint: (wonBy, detail, firstServeIn = detail !== 'doble_falta') => {
      const sequenceNumber = reducerState.events.length + 1;
      const event = createPointEvent(wonBy, detail, firstServeIn);
      dispatch({ type: 'ADD_POINT', payload: event });
      enqueue((authToken) => createMatchPoint(authToken, matchId, toPointInput(event, sequenceNumber)));
    },
    undoLast: performUndo,
    setMode: (mode) => {
      dispatch({ type: 'SET_MODE', payload: mode });
      enqueue((authToken) => updateMatchCaptureMode(authToken, matchId, mode));
    },
    closeMatch: () => {
      dispatch({ type: 'CLOSE_MATCH' });
      enqueue((authToken) => updateMatchStatus(authToken, matchId, 'completed'));
    },
    reopenMatch: () => {
      // if the match ended on its own, undoing its final point is what actually
      // lets the coach get back into LiveCaptureView (matchEnded is derived from
      // events, not a flag REOPEN_MATCH alone can clear).
      if (matchState.matchEnded) performUndo();
      dispatch({ type: 'REOPEN_MATCH' });
      enqueue((authToken) => updateMatchStatus(authToken, matchId, 'in_progress'));
    },
    setObservations: (text) => dispatch({ type: 'SET_OBSERVATIONS', payload: text }),
    resetMatch: () => {
      dispatch({ type: 'RESET' });
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
      enqueue((authToken) => restartMatch(authToken, matchId));
    },
    canUndo: reducerState.events.length > 0,
    syncError,
    retrySync: () => bulkSync(reducerState.events),
  };

  return <MatchContext.Provider value={value}>{children}</MatchContext.Provider>;
}

export function useMatch(): MatchContextValue {
  const ctx = useContext(MatchContext);
  if (!ctx) throw new Error('useMatch must be used within a MatchProvider');
  return ctx;
}
