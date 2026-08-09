import { withTransaction } from '../lib/db.js';
import * as bookingRepository from '../repositories/bookingRepository.js';
import * as matchPointEventRepository from '../repositories/matchPointEventRepository.js';
import type { PointInput } from '../repositories/matchPointEventRepository.js';
import * as matchRepository from '../repositories/matchRepository.js';
import type { CaptureMode, Match, MatchBestOf, MatchPlayerSlot, MatchPointEvent, MatchStatus } from '../types.js';

export interface GetOrCreateMatchParams {
  bookingId: string;
  player2Label: string;
  bestOf: MatchBestOf;
  noAd: boolean;
  initialServer: MatchPlayerSlot;
  captureMode: CaptureMode;
}

/** player1Id se deriva de la reserva (nunca lo manda el cliente) — evita que el
 * partido quede desincronizado del jugador real de esa reserva. */
/** Autorización a nivel de ruta: a qué entrenador pertenece este partido (vía la reserva). */
export async function getCoachIdForMatch(matchId: string): Promise<string> {
  const match = await matchRepository.getById(matchId);
  const { coachId } = await bookingRepository.getBookingParticipants(match.bookingId);
  return coachId;
}

export async function getOrCreateMatch(params: GetOrCreateMatchParams): Promise<Match> {
  const booking = await bookingRepository.getBookingById(params.bookingId);
  return matchRepository.getOrCreate({
    bookingId: params.bookingId,
    player1Id: booking.playerId,
    player2Label: params.player2Label,
    bestOf: params.bestOf,
    noAd: params.noAd,
    initialServer: params.initialServer,
    captureMode: params.captureMode,
  });
}

export async function addPoint(matchId: string, point: PointInput): Promise<MatchPointEvent> {
  return matchPointEventRepository.create(matchId, point);
}

export async function addPointsBulk(matchId: string, points: PointInput[]): Promise<MatchPointEvent[]> {
  return matchPointEventRepository.createBulk(matchId, points);
}

export async function removePoint(matchId: string, sequenceNumber: number): Promise<void> {
  return matchPointEventRepository.deleteBySequence(matchId, sequenceNumber);
}

/** "Nuevo partido": borra todos los puntos y vuelve el partido a in_progress, en vez de
 * crear una segunda fila matches (booking_id es UNIQUE). Ambos pasos van en una sola
 * transacción — un crash a mitad de camino no debe dejar los puntos borrados con el
 * partido todavía marcado 'completed'. */
export async function restartMatch(matchId: string): Promise<Match> {
  return withTransaction(async (client) => {
    await matchPointEventRepository.deleteAllForMatch(matchId, client);
    return matchRepository.updateStatus(matchId, 'in_progress', client);
  });
}

export async function setStatus(matchId: string, status: MatchStatus): Promise<Match> {
  return matchRepository.updateStatus(matchId, status);
}

export async function setObservations(matchId: string, coachObservations: string): Promise<Match> {
  return matchRepository.updateObservations(matchId, coachObservations);
}

export async function setCaptureMode(matchId: string, captureMode: CaptureMode): Promise<Match> {
  return matchRepository.updateCaptureMode(matchId, captureMode);
}

export interface MatchReport {
  match: Match;
  points: MatchPointEvent[];
}

/** ParentReportsScreen: null cuando la reserva nunca tuvo una captura en vivo (no es un error —
 * la mayoría de las reservas quedan así hasta que el entrenador arranca el partido). */
export async function getMatchReport(bookingId: string): Promise<MatchReport | null> {
  const match = await matchRepository.findByBookingId(bookingId);
  if (!match) return null;
  const points = await matchPointEventRepository.listByMatch(match.id);
  return { match, points };
}
