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
  | 'error_no_forzado_reves';

export type ServeDirection = 'T' | 'cuerpo' | 'abierto';
export type ErrorDirection = 'red' | 'larga' | 'ancha';
export type RallyLength = 'corto' | 'medio' | 'largo';

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
}

export interface MatchConfig {
  bestOf: 1 | 3;
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
};
