import { withTransaction } from '../lib/db.js';
import { computeGamePointHistory, computeMatchReportStats, computePlayer1MatchStats } from '../lib/matchStatsEngine.js';
import { buildDatoDuro, buildSemaforo, buildTacticalDiagnosis } from '../lib/matchReportNarratives.js';
import * as bookingRepository from '../repositories/bookingRepository.js';
import * as matchPointEventRepository from '../repositories/matchPointEventRepository.js';
import type { PointInput } from '../repositories/matchPointEventRepository.js';
import * as matchScoreAdjustmentRepository from '../repositories/matchScoreAdjustmentRepository.js';
import type { AdjustmentInput } from '../repositories/matchScoreAdjustmentRepository.js';
import * as matchRepository from '../repositories/matchRepository.js';
import * as voiceNoteRepository from '../repositories/voiceNoteRepository.js';
import * as voiceNoteService from './voiceNoteService.js';
import type { VoiceNoteFields } from './voiceNoteService.js';
import * as paymentService from './paymentService.js';
import type { MatchFormatId } from '../lib/matchFormats.js';
import type {
  CaptureMode,
  CoachReportSummary,
  Match,
  MatchPlayerSlot,
  MatchPointEvent,
  MatchReportView,
  MatchScoreAdjustment,
  MatchStatus,
  VoiceNote,
  VoiceNoteWithDatoDuro,
} from '../types.js';
import type { StatsPointEvent, StatsScoreAdjustment } from '../lib/matchStatsEngine.js';

function toStatsPointEvents(points: MatchPointEvent[]): StatsPointEvent[] {
  return points.map((p) => ({
    timestamp: new Date(p.occurredAt).getTime(),
    wonBy: p.wonBy,
    detail: p.detail,
    firstServeIn: p.firstServeIn,
    errorDirection: p.errorDirection,
    rallyLength: p.rallyLength,
  }));
}

function toStatsAdjustments(adjustments: MatchScoreAdjustment[]): StatsScoreAdjustment[] {
  return adjustments.map((a) => ({
    timestamp: new Date(a.occurredAt).getTime(),
    gamesPlayer1: a.gamesPlayer1,
    gamesPlayer2: a.gamesPlayer2,
    pointsPlayer1: a.pointsPlayer1,
    pointsPlayer2: a.pointsPlayer2,
    server: a.server,
  }));
}

export interface GetOrCreateMatchParams {
  bookingId: string;
  player2Label: string;
  format: MatchFormatId;
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
    format: params.format,
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

export async function addAdjustment(matchId: string, adjustment: AdjustmentInput): Promise<MatchScoreAdjustment> {
  return matchScoreAdjustmentRepository.create(matchId, adjustment);
}

export async function addVoiceNote(
  matchId: string,
  buffer: Buffer,
  mimeType: string,
  fields: VoiceNoteFields,
): Promise<VoiceNote> {
  return voiceNoteService.addVoiceNote(matchId, buffer, mimeType, fields);
}

export async function removeVoiceNote(matchId: string, sequenceNumber: number): Promise<void> {
  return voiceNoteService.deleteVoiceNote(matchId, sequenceNumber);
}

/** "Nuevo partido": borra todos los puntos, ajustes y notas de voz, y vuelve el partido a
 * in_progress, en vez de crear una segunda fila matches (booking_id es UNIQUE). Todo en una sola
 * transacción — un crash a mitad de camino no debe dejar el partido a medio borrar pero todavía
 * 'completed'. La limpieza del audio en R2 de las notas de voz pasa DESPUÉS de que la transacción
 * confirma — un side effect externo (red) no debe vivir dentro de un BEGIN/COMMIT. */
export async function restartMatch(matchId: string): Promise<Match> {
  const { match, deletedAudioUrls } = await withTransaction(async (client) => {
    await matchPointEventRepository.deleteAllForMatch(matchId, client);
    await matchScoreAdjustmentRepository.deleteAllForMatch(matchId, client);
    const deletedAudioUrls = await voiceNoteRepository.deleteAllForMatch(matchId, client);
    const match = await matchRepository.resetForRestart(matchId, client);
    return { match, deletedAudioUrls };
  });
  await voiceNoteService.deleteAudioObjects(deletedAudioUrls);
  return match;
}

/** Terminar el partido (fin natural, "Finalizar partido" antes de tiempo, o retiro) ya no debería
 * dejar la reserva "pagada para siempre" — si el padre ya pagó, libera el pago al entrenador y
 * marca la reserva completada en el mismo momento, sin depender de que el entrenador se acuerde
 * de ir a tocar "Marcar sesión como completada" aparte. Si el pago todavía no se verificó, no hay
 * nada que hacer acá — paymentService.verifyPayment cubre el orden inverso (pago verificado
 * después de que el partido ya terminó). Nunca tira: completar la reserva es una consecuencia del
 * partido, no debe romper la respuesta de "terminar partido" si algo sale mal acá. */
async function maybeCompleteBookingForFinishedMatch(match: Match): Promise<void> {
  if (match.status !== 'completed') return;
  try {
    const booking = await bookingRepository.getBookingById(match.bookingId);
    if (booking.status === 'paid') {
      await paymentService.completeBooking(match.bookingId);
    }
  } catch (err) {
    console.error(`No se pudo completar automáticamente la reserva ${match.bookingId} al terminar el partido:`, err);
  }
}

export async function setStatus(matchId: string, status: MatchStatus): Promise<Match> {
  const match = await matchRepository.updateStatus(matchId, status);
  await maybeCompleteBookingForFinishedMatch(match);
  return match;
}

export async function pauseMatch(matchId: string): Promise<Match> {
  return matchRepository.pause(matchId);
}

export async function resumeMatch(matchId: string): Promise<Match> {
  return matchRepository.resume(matchId);
}

export async function suspendMatch(matchId: string): Promise<Match> {
  return matchRepository.suspend(matchId);
}

export async function resumeSuspendedMatch(matchId: string): Promise<Match> {
  return matchRepository.resumeFromSuspension(matchId);
}

export async function retireMatch(matchId: string, retiredBy: MatchPlayerSlot): Promise<Match> {
  const match = await matchRepository.retire(matchId, retiredBy);
  await maybeCompleteBookingForFinishedMatch(match);
  return match;
}

export async function getSuspendedMatchForCoach(coachId: string) {
  return matchRepository.findSuspendedByCoach(coachId);
}

export async function getRetiredBookingIds(coachId: string): Promise<string[]> {
  return matchRepository.listRetiredBookingIdsByCoach(coachId);
}

export async function setObservations(matchId: string, coachObservations: string): Promise<Match> {
  return matchRepository.updateObservations(matchId, coachObservations);
}

export interface MatchReport {
  match: Match;
  points: MatchPointEvent[];
  adjustments: MatchScoreAdjustment[];
  voiceNotes: VoiceNoteWithDatoDuro[];
  report?: MatchReportView;
}

/** ParentReportsScreen: null cuando la reserva nunca tuvo una captura en vivo (no es un error —
 * la mayoría de las reservas quedan así hasta que el entrenador arranca el partido). `report` y el
 * "dato duro" de cada nota solo se calculan para partidos ya terminados — mientras está en curso,
 * el marcador puede seguir moviéndose y las stats enriquecidas todavía no cuentan una historia
 * estable. */
export async function getMatchReport(bookingId: string): Promise<MatchReport | null> {
  const match = await matchRepository.findByBookingId(bookingId);
  if (!match) return null;
  const points = await matchPointEventRepository.listByMatch(match.id);
  const adjustments = await matchScoreAdjustmentRepository.listByMatch(match.id);
  const voiceNotes = await voiceNoteRepository.listByMatch(match.id);

  if (match.status !== 'completed') {
    return { match, points, adjustments, voiceNotes: voiceNotes.map((note) => ({ ...note, datoDuro: null })) };
  }

  const config = { format: match.format, noAd: match.noAd, initialServer: match.initialServer };
  const statsEvents = toStatsPointEvents(points);
  const statsAdjustments = toStatsAdjustments(adjustments);

  const stats = computeMatchReportStats(statsEvents, config, statsAdjustments);
  const report: MatchReportView = {
    ...stats,
    semaforo: buildSemaforo(stats),
    tacticalDiagnosis: buildTacticalDiagnosis(stats),
  };

  const gamePointHistory = computeGamePointHistory(statsEvents, config, statsAdjustments);
  const voiceNotesWithDatoDuro = voiceNotes.map((note) => {
    const gamePoints = gamePointHistory.filter(
      (p) => p.setIndex === note.setIndex && p.gameIndex === note.gameIndex && p.isTiebreak === note.isTiebreak,
    );
    return { ...note, datoDuro: buildDatoDuro(gamePoints) };
  });

  return { match, points, adjustments, voiceNotes: voiceNotesWithDatoDuro, report };
}

/**
 * TrainerProfileScreen ("Estadísticas de partidos"): agrega stats reales de todos los partidos
 * completados del coach — null si todavía no tiene ninguno, para que la pantalla muestre un
 * estado vacío honesto en vez de un ejemplo inventado. Nunca expone el detalle de un partido
 * individual (belongs a un padre/hijo específico) — solo sumas/promedios.
 */
export async function getCoachReportSummary(coachId: string): Promise<CoachReportSummary | null> {
  const matches = await matchRepository.listCompletedByCoach(coachId);
  if (matches.length === 0) return null;

  let winners = 0;
  let unforcedErrors = 0;
  let breaksConverted = 0;
  let returnGamesPlayed = 0;
  const firstServePcts: number[] = [];

  for (const match of matches) {
    const points = await matchPointEventRepository.listByMatch(match.id);
    const adjustments = await matchScoreAdjustmentRepository.listByMatch(match.id);
    const stats = computePlayer1MatchStats(
      toStatsPointEvents(points),
      { format: match.format, noAd: match.noAd, initialServer: match.initialServer },
      toStatsAdjustments(adjustments),
    );
    winners += stats.winners;
    unforcedErrors += stats.unforcedErrors;
    breaksConverted += stats.breaksConverted;
    returnGamesPlayed += stats.returnGamesPlayed;
    if (stats.firstServePct !== null) firstServePcts.push(stats.firstServePct);
  }

  const firstServePct =
    firstServePcts.length > 0 ? Math.round(firstServePcts.reduce((a, b) => a + b, 0) / firstServePcts.length) : null;

  return { matchesCount: matches.length, winners, unforcedErrors, firstServePct, breaksConverted, returnGamesPlayed };
}
