export type PlayerId = 'player1' | 'player2';

export type PointDetail =
  | 'winner_derecha'
  | 'winner_reves'
  | 'winner_volea'
  | 'ace'
  | 'doble_falta'
  | 'error_no_forzado'
  | 'error_forzado';

export interface PointEvent {
  id: string;
  timestamp: number;
  wonBy: PlayerId;
  detail: PointDetail | null;
  /** false only when the coach explicitly flags the point as coming off a second serve. */
  firstServeIn: boolean;
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
  ace: 'Ace',
  doble_falta: 'Doble falta',
  error_no_forzado: 'Error no forzado',
  error_forzado: 'Error forzado',
};
