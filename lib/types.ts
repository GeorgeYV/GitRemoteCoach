import type { MatchFormatId } from './matchFormats';
import type { ShotType } from './shotTypes';

export type PlayerId = 'player1' | 'player2';

export type PointDetail =
  | 'winner_derecha'
  | 'winner_reves'
  | 'winner_volea'
  /** side unspecified — used for the rival's winners, which this app doesn't break down by side. */
  | 'winner'
  | 'ace'
  | 'doble_falta'
  | 'error_forzado'
  | 'error_no_forzado'
  | 'error_no_forzado_derecha'
  | 'error_no_forzado_reves'
  /** solo modo 'detallada' — espejo "de volea" de error_no_forzado (ver lib/shotTypes.ts). */
  | 'error_no_forzado_volea'
  /** "Punto no visto" con Hija/Rival — el marcador avanza pero el punto queda fuera de los % (saque, etc). */
  | 'dato_no_capturado';

export type ServeDirection = 'T' | 'cuerpo' | 'abierto';
export type ErrorDirection = 'red' | 'larga' | 'ancha';
export type RallyLength = 'corto' | 'medio' | 'largo';
/** Lado del golpe — solo modo 'detallada' (ver PointFlow.tsx Paso 4), independiente de detail:
 * detail dice la categoría (winner/error/…), lado dice de qué lado del cuerpo salió el golpe. */
export type Lado = 'derecha' | 'reves';

export interface PointEvent {
  id: string;
  timestamp: number;
  wonBy: PlayerId;
  detail: PointDetail | null;
  /** false only when the coach explicitly flags the point as coming off a second serve. */
  firstServeIn: boolean;
  serveDirection: ServeDirection | null;
  /** only meaningful when detail is one of the error_no_forzado* variants */
  errorDirection: ErrorDirection | null;
  rallyLength: RallyLength | null;
  netApproach: boolean;
  /** true only for the 3-tap "error de devolución" shortcut in Paso 2 */
  isReturnError: boolean;
  /** solo modo 'detallada' — opcional, se completa en el Paso 4 (ver PointFlow.tsx). */
  lado: Lado | null;
  /** solo modo 'detallada' — elegido en el Paso 3 (ver lib/shotTypes.ts). */
  shotType: ShotType | null;
}

/**
 * Ajuste manual del marcador — un evento distinto de PointEvent, no una secuencia de puntos
 * sintéticos. Fija valores absolutos del SET EN CURSO (nunca toca sets ya completados):
 * `points*` usa el mismo índice interno que el motor de puntaje (0/15/30/40 → 0-3).
 */
export interface ScoreAdjustment {
  id: string;
  timestamp: number;
  gamesPlayer1: number;
  gamesPlayer2: number;
  pointsPlayer1: number;
  pointsPlayer2: number;
  server: PlayerId;
}

/** Clip de audio grabado durante la captura en vivo — uri de archivo/blob local para reproducirlo
 * en el momento, más los campos que se suben al servidor (audio + transcripción real, ver
 * lib/api.ts#uploadVoiceNote) para que el reporte del padre las incluya. */
export interface VoiceNote {
  id: string;
  timestamp: number;
  /** Asignado al grabar (no la posición en la lista) — a diferencia de los puntos, una nota se
   * puede borrar desde cualquier posición, no solo la última. Ver matchReducer#nextVoiceNoteSequence. */
  sequenceNumber: number;
  uri: string;
  durationMs: number;
  /** Marcador del partido en el instante en que se grabó (ver scoringEngine#getScoreLabel) —
   * congelado al crear la nota, no recalculado después, para que siga siendo el momento exacto
   * aunque se deshagan/ajusten puntos más tarde. */
  scoreLabel: string;
  /** set/juego/tiebreak en el instante de grabar (ver scoringEngine#getSetGameIndex) — mismo
   * criterio de "congelado al grabar" que scoreLabel, para el "dato duro" del reporte. */
  setIndex: number;
  gameIndex: number;
  isTiebreak: boolean;
}

export interface MatchConfig {
  format: MatchFormatId;
  noAd: boolean;
  player1Name: string;
  player2Name: string;
  initialServer: PlayerId;
}

export function otherPlayer(p: PlayerId): PlayerId {
  return p === 'player1' ? 'player2' : 'player1';
}

export const POINT_DETAIL_LABELS: Record<PointDetail, string> = {
  winner_derecha: 'Winner derecha',
  winner_reves: 'Winner revés',
  winner_volea: 'Winner volea',
  winner: 'Winner',
  ace: 'Ace',
  doble_falta: 'Doble falta',
  error_forzado: 'Error forzado',
  error_no_forzado: 'Error no forzado',
  error_no_forzado_derecha: 'Error no forzado (derecha)',
  error_no_forzado_reves: 'Error no forzado (revés)',
  error_no_forzado_volea: 'Error no forzado de volea',
  dato_no_capturado: 'Punto no visto',
};
