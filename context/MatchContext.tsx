import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { computeMatchState, MatchState } from '../lib/scoringEngine';
import { computeMatchStats, MatchStats } from '../lib/statsEngine';
import {
  CaptureMode,
  createPointEvent,
  initialReducerState,
  matchReducer,
  MatchReducerState,
} from '../lib/matchReducer';
import { MatchConfig, PlayerId, PointDetail } from '../lib/types';

const STORAGE_KEY = 'tennis-live-capture:match-v1';

interface MatchContextValue {
  config: MatchConfig;
  reducerState: MatchReducerState;
  matchState: MatchState;
  stats: MatchStats;
  addPoint: (wonBy: PlayerId, detail: PointDetail | null, firstServeIn?: boolean) => void;
  undoLast: () => void;
  setMode: (mode: CaptureMode) => void;
  closeMatch: () => void;
  setObservations: (text: string) => void;
  resetMatch: () => void;
  canUndo: boolean;
}

const MatchContext = createContext<MatchContextValue | null>(null);

export function MatchProvider({
  config,
  children,
}: {
  config: MatchConfig;
  children: React.ReactNode;
}) {
  const [reducerState, dispatch] = useReducer(matchReducer, initialReducerState);
  const hydrated = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed: MatchReducerState = JSON.parse(raw);
          dispatch({ type: 'LOAD_STATE', payload: parsed });
        } catch {
          // ignore corrupt persisted state, start fresh
        }
      }
      hydrated.current = true;
    });
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reducerState)).catch(() => {});
  }, [reducerState]);

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
      dispatch({ type: 'ADD_POINT', payload: createPointEvent(wonBy, detail, firstServeIn) });
    },
    undoLast: () => dispatch({ type: 'UNDO_LAST' }),
    setMode: (mode) => dispatch({ type: 'SET_MODE', payload: mode }),
    closeMatch: () => dispatch({ type: 'CLOSE_MATCH' }),
    setObservations: (text) => dispatch({ type: 'SET_OBSERVATIONS', payload: text }),
    resetMatch: () => {
      dispatch({ type: 'RESET' });
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    },
    canUndo: reducerState.events.length > 0,
  };

  return <MatchContext.Provider value={value}>{children}</MatchContext.Provider>;
}

export function useMatch(): MatchContextValue {
  const ctx = useContext(MatchContext);
  if (!ctx) throw new Error('useMatch must be used within a MatchProvider');
  return ctx;
}
