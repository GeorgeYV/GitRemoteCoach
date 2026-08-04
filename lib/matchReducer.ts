import { PointEvent } from './types';

export type CaptureMode = 'rapida' | 'detallada';

export interface MatchReducerState {
  events: PointEvent[];
  mode: CaptureMode;
  matchClosed: boolean;
  observations: string;
}

export type MatchAction =
  | { type: 'ADD_POINT'; payload: PointEvent }
  | { type: 'UNDO_LAST' }
  | { type: 'SET_MODE'; payload: CaptureMode }
  | { type: 'CLOSE_MATCH' }
  | { type: 'REOPEN_MATCH' }
  | { type: 'SET_OBSERVATIONS'; payload: string }
  | { type: 'LOAD_STATE'; payload: MatchReducerState }
  | { type: 'RESET' };

export const initialReducerState: MatchReducerState = {
  events: [],
  mode: 'rapida',
  matchClosed: false,
  observations: '',
};

export function matchReducer(state: MatchReducerState, action: MatchAction): MatchReducerState {
  switch (action.type) {
    case 'ADD_POINT':
      return { ...state, events: [...state.events, action.payload] };
    case 'UNDO_LAST':
      return { ...state, events: state.events.slice(0, -1) };
    case 'SET_MODE':
      return { ...state, mode: action.payload };
    case 'CLOSE_MATCH':
      return { ...state, matchClosed: true };
    case 'REOPEN_MATCH':
      return { ...state, matchClosed: false };
    case 'SET_OBSERVATIONS':
      return { ...state, observations: action.payload };
    case 'LOAD_STATE':
      return action.payload;
    case 'RESET':
      return initialReducerState;
    default:
      return state;
  }
}

export function createPointEvent(
  wonBy: PointEvent['wonBy'],
  detail: PointEvent['detail'],
  firstServeIn: boolean
): PointEvent {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    wonBy,
    detail,
    firstServeIn,
  };
}
