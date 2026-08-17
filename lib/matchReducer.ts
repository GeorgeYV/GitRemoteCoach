import { PointEvent, ScoreAdjustment, VoiceNote } from './types';

export const UNDO_STACK_DEPTH = 3;

export interface MatchReducerState {
  events: PointEvent[];
  adjustments: ScoreAdjustment[];
  voiceNotes: VoiceNote[];
  matchClosed: boolean;
  observations: string;
  /** Bounded undo stack (0-UNDO_STACK_DEPTH): grows by 1 on each new point (capped), shrinks by
   * 1 on each undo. Resetting on new points — not just tracking events.length — is what keeps
   * "deshacer" from letting the coach walk arbitrarily far back into the match. */
  undoBudget: number;
}

export type MatchAction =
  | { type: 'ADD_POINT'; payload: PointEvent }
  | { type: 'ADD_ADJUSTMENT'; payload: ScoreAdjustment }
  | { type: 'ADD_VOICE_NOTE'; payload: VoiceNote }
  | { type: 'DELETE_VOICE_NOTE'; payload: { id: string } }
  | { type: 'UNDO_LAST' }
  /** Bypasses the 3-level cap — reopenMatch uses this to undo the point that just ended the
   * match, which isn't the "coach fixing a recent capture mistake" case the cap guards against. */
  | { type: 'FORCE_UNDO_LAST' }
  | { type: 'CLOSE_MATCH' }
  | { type: 'REOPEN_MATCH' }
  | { type: 'SET_OBSERVATIONS'; payload: string }
  | { type: 'LOAD_STATE'; payload: MatchReducerState }
  | { type: 'RESET' };

export const initialReducerState: MatchReducerState = {
  events: [],
  adjustments: [],
  voiceNotes: [],
  matchClosed: false,
  observations: '',
  undoBudget: 0,
};

export function matchReducer(state: MatchReducerState, action: MatchAction): MatchReducerState {
  switch (action.type) {
    case 'ADD_POINT':
      return {
        ...state,
        events: [...state.events, action.payload],
        undoBudget: Math.min(UNDO_STACK_DEPTH, state.undoBudget + 1),
      };
    case 'ADD_ADJUSTMENT':
      return { ...state, adjustments: [...state.adjustments, action.payload] };
    case 'ADD_VOICE_NOTE':
      return { ...state, voiceNotes: [...state.voiceNotes, action.payload] };
    case 'DELETE_VOICE_NOTE':
      return { ...state, voiceNotes: state.voiceNotes.filter((note) => note.id !== action.payload.id) };
    case 'UNDO_LAST':
      if (state.undoBudget <= 0) return state;
      return { ...state, events: state.events.slice(0, -1), undoBudget: state.undoBudget - 1 };
    case 'FORCE_UNDO_LAST':
      return { ...state, events: state.events.slice(0, -1) };
    case 'CLOSE_MATCH':
      return { ...state, matchClosed: true };
    case 'REOPEN_MATCH':
      return { ...state, matchClosed: false };
    case 'SET_OBSERVATIONS':
      return { ...state, observations: action.payload };
    case 'LOAD_STATE':
      // merge over defaults, not a raw replace — a persisted state from before a reducer-state
      // field existed (e.g. undoBudget, adjustments) would otherwise come back `undefined`.
      return { ...initialReducerState, ...action.payload };
    case 'RESET':
      return initialReducerState;
    default:
      return state;
  }
}

export type NewPointInput = Omit<PointEvent, 'id' | 'timestamp'>;

export function createPointEvent(input: NewPointInput): PointEvent {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    ...input,
  };
}

export type NewAdjustmentInput = Omit<ScoreAdjustment, 'id' | 'timestamp'>;

export function createScoreAdjustment(input: NewAdjustmentInput): ScoreAdjustment {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    ...input,
  };
}

export type NewVoiceNoteInput = Omit<VoiceNote, 'id' | 'timestamp'>;

export function createVoiceNote(input: NewVoiceNoteInput): VoiceNote {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    ...input,
  };
}
