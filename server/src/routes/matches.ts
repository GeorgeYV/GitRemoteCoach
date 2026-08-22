import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as bookingRepository from '../repositories/bookingRepository.js';
import * as matchService from '../services/matchService.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';
import { SHOT_TYPE_IDS, type ShotType } from '../lib/shotTypes.js';

// Mismos 6 ids que lib/matchFormats.ts#MatchFormatId — repetidos como tupla literal para que
// z.enum() los acepte (mismo patrón que COUNTRY_CODES en routes/clubs.ts y routes/tournaments.ts).
const MATCH_FORMAT = [
  'single_set',
  'best_of_3',
  'best_of_3_short',
  'match_tiebreak',
  'match_tiebreak_short',
  'super_tiebreak_only',
] as const;
const PLAYER_SLOT = ['player1', 'player2'] as const;
const CAPTURE_MODE = ['rapida', 'detallada'] as const;
const MATCH_STATUS = ['in_progress', 'completed'] as const;
const POINT_DETAIL = [
  'winner_derecha',
  'winner_reves',
  'winner_volea',
  'winner',
  'ace',
  'doble_falta',
  'error_forzado',
  'error_no_forzado',
  'error_no_forzado_derecha',
  'error_no_forzado_reves',
  'error_no_forzado_volea',
  'dato_no_capturado',
] as const;
const SERVE_DIRECTION = ['T', 'cuerpo', 'abierto'] as const;
const ERROR_DIRECTION = ['red', 'larga', 'ancha'] as const;
const RALLY_LENGTH = ['corto', 'medio', 'largo'] as const;
const LADO = ['derecha', 'reves'] as const;
// SHOT_TYPE_IDS ya es la lista completa (lib/shotTypes.ts) — z.enum() necesita una tupla no
// vacía y literal, no un array plano, de ahí el "as [ShotType, ...ShotType[]]".
const SHOT_TYPE = SHOT_TYPE_IDS as [ShotType, ...ShotType[]];

const getOrCreateMatchSchema = z.object({
  bookingId: z.string().uuid(),
  player2Label: z.string().min(1).max(200),
  format: z.enum(MATCH_FORMAT),
  noAd: z.boolean(),
  initialServer: z.enum(PLAYER_SLOT),
  captureMode: z.enum(CAPTURE_MODE),
});

const pointSchema = z.object({
  sequenceNumber: z.number().int().positive(),
  wonBy: z.enum(PLAYER_SLOT),
  detail: z.enum(POINT_DETAIL).nullable(),
  firstServeIn: z.boolean(),
  serveDirection: z.enum(SERVE_DIRECTION).nullable(),
  errorDirection: z.enum(ERROR_DIRECTION).nullable(),
  rallyLength: z.enum(RALLY_LENGTH).nullable(),
  // .default(null) en vez de solo .nullable(): los puntos de modo 'rapida' (y cualquier smoke
  // test/cliente viejo) nunca mandan estos dos campos — sin el default, zod los exige presentes
  // (aunque sea en null) y rechaza el payload entero con 422.
  lado: z.enum(LADO).nullable().default(null),
  shotType: z.enum(SHOT_TYPE).nullable().default(null),
  netApproach: z.boolean(),
  isReturnError: z.boolean(),
});

const pointsBulkSchema = z.object({
  points: z.array(pointSchema),
});

const statusSchema = z.object({
  status: z.enum(MATCH_STATUS),
});

const observationsSchema = z.object({
  coachObservations: z.string().max(4000),
});

const retireSchema = z.object({
  retiredBy: z.enum(PLAYER_SLOT),
});

const adjustmentSchema = z.object({
  sequenceNumber: z.number().int().positive(),
  gamesPlayer1: z.number().int().min(0),
  gamesPlayer2: z.number().int().min(0),
  pointsPlayer1: z.number().int().min(0).max(3),
  pointsPlayer2: z.number().int().min(0).max(3),
  server: z.enum(PLAYER_SLOT),
});

// Campos del multipart de POST /matches/:id/voice-notes — llegan como string (mismo formato que
// cualquier campo de <form>), de ahí z.coerce en vez de z.number()/z.boolean() directo.
const voiceNoteFieldsSchema = z.object({
  sequenceNumber: z.coerce.number().int().positive(),
  durationMs: z.coerce.number().int().positive(),
  scoreLabel: z.string().min(1).max(200),
  setIndex: z.coerce.number().int().min(0),
  gameIndex: z.coerce.number().int().min(0),
  isTiebreak: z.enum(['true', 'false']).transform((v) => v === 'true'),
});

/** Autorización compartida por todas las rutas de :id — solo el entrenador dueño de la
 * reserva del partido puede leer/modificarlo. */
async function assertOwnsMatch(matchId: string, sub: string): Promise<void> {
  const coachId = await matchService.getCoachIdForMatch(matchId);
  if (sub !== coachId) throw new ForbiddenError('Solo el entrenador de la reserva puede acceder a este partido');
}

export async function matchRoutes(app: FastifyInstance): Promise<void> {
  // ParentReportsScreen: el padre o el entrenador de la reserva pueden leer el resultado y los
  // puntos — null si la reserva nunca tuvo una captura en vivo (no es un error).
  app.get('/bookings/:id/match', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };
    const { coachId, guardianUserId } = await bookingRepository.getBookingParticipants(id);
    if (sub !== coachId && sub !== guardianUserId) {
      throw new ForbiddenError('No tienes acceso a esta reserva');
    }
    return matchService.getMatchReport(id);
  });

  // LiveCaptureView: "Comenzar captura en vivo" (CoachMatchSetupScreen). Idempotente por booking_id.
  app.post('/matches', { preHandler: app.authenticate }, async (req, reply) => {
    const parsed = getOrCreateMatchSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);

    const { sub } = req.user as { sub: string };
    const { coachId } = await bookingRepository.getBookingParticipants(parsed.data.bookingId);
    if (sub !== coachId) throw new ForbiddenError('Solo el entrenador de la reserva puede iniciar la captura');

    const match = await matchService.getOrCreateMatch(parsed.data);
    reply.code(201).send(match);
  });

  // LiveCaptureView: cada punto anotado en vivo.
  app.post('/matches/:id/points', { preHandler: app.authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = pointSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const { sub } = req.user as { sub: string };
    await assertOwnsMatch(id, sub);
    const point = await matchService.addPoint(id, parsed.data);
    reply.code(201).send(point);
  });

  // LiveCaptureView: catálogo de recuperación tras hidratar AsyncStorage o botón "Reintentar sincronización".
  app.post('/matches/:id/points/bulk', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const parsed = pointsBulkSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const { sub } = req.user as { sub: string };
    await assertOwnsMatch(id, sub);
    return matchService.addPointsBulk(id, parsed.data.points);
  });

  // LiveCaptureView: deshacer último punto.
  app.delete('/matches/:id/points/:sequenceNumber', { preHandler: app.authenticate }, async (req, reply) => {
    const { id, sequenceNumber } = req.params as { id: string; sequenceNumber: string };
    const { sub } = req.user as { sub: string };
    await assertOwnsMatch(id, sub);
    await matchService.removePoint(id, Number(sequenceNumber));
    reply.code(204).send();
  });

  // LiveCaptureView: Contingencias → Ajuste manual del marcador.
  app.post('/matches/:id/adjustments', { preHandler: app.authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = adjustmentSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const { sub } = req.user as { sub: string };
    await assertOwnsMatch(id, sub);
    const adjustment = await matchService.addAdjustment(id, parsed.data);
    reply.code(201).send(adjustment);
  });

  // LiveCaptureView: Contingencias → Pausa temporal / tiempo médico.
  app.post('/matches/:id/pause', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };
    await assertOwnsMatch(id, sub);
    return matchService.pauseMatch(id);
  });

  app.post('/matches/:id/resume', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };
    await assertOwnsMatch(id, sub);
    return matchService.resumeMatch(id);
  });

  // LiveCaptureView: Contingencias → Suspender partido.
  app.post('/matches/:id/suspend', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };
    await assertOwnsMatch(id, sub);
    return matchService.suspendMatch(id);
  });

  // Banner del dashboard del coach: "Reanudar" un partido suspendido.
  app.post('/matches/:id/resume-suspension', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };
    await assertOwnsMatch(id, sub);
    return matchService.resumeSuspendedMatch(id);
  });

  // LiveCaptureView: Contingencias → Terminar por retiro.
  app.post('/matches/:id/retire', { preHandler: app.authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = retireSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const { sub } = req.user as { sub: string };
    await assertOwnsMatch(id, sub);
    const match = await matchService.retireMatch(id, parsed.data.retiredBy);
    reply.code(200).send(match);
  });

  // MatchSummaryView: "Nuevo partido" — reinicia el mismo partido (booking_id es UNIQUE, no crea uno nuevo).
  app.post('/matches/:id/restart', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };
    await assertOwnsMatch(id, sub);
    return matchService.restartMatch(id);
  });

  // LiveCaptureView/MatchSummaryView: finalizar ("Finalizar partido") / reabrir ("Deshacer último punto y volver").
  app.patch('/matches/:id/status', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const { sub } = req.user as { sub: string };
    await assertOwnsMatch(id, sub);
    return matchService.setStatus(id, parsed.data.status);
  });

  // MatchSummaryView: observaciones del entrenador (debounced en el cliente).
  app.patch('/matches/:id/observations', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const parsed = observationsSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const { sub } = req.user as { sub: string };
    await assertOwnsMatch(id, sub);
    return matchService.setObservations(id, parsed.data.coachObservations);
  });

  // VoiceNoteRecorder: nota de voz grabada en vivo — multipart (archivo + campos de texto), sin
  // attachFieldsToBody global (ver app.ts) así que se arma a mano iterando req.parts().
  app.post('/matches/:id/voice-notes', { preHandler: app.authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };
    await assertOwnsMatch(id, sub);

    let fileBuffer: Buffer | null = null;
    let mimetype = '';
    const rawFields: Record<string, string> = {};

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer();
        mimetype = part.mimetype;
      } else {
        rawFields[part.fieldname] = String(part.value);
      }
    }
    if (!fileBuffer) throw new ValidationError('Falta el archivo de audio');

    const parsed = voiceNoteFieldsSchema.safeParse(rawFields);
    if (!parsed.success) throw new ValidationError(parsed.error.message);

    const voiceNote = await matchService.addVoiceNote(id, fileBuffer, mimetype, parsed.data);
    reply.code(201).send(voiceNote);
  });

  // LiveCaptureView: borrar una nota de voz (cualquier posición, no solo la última).
  app.delete('/matches/:id/voice-notes/:sequenceNumber', { preHandler: app.authenticate }, async (req, reply) => {
    const { id, sequenceNumber } = req.params as { id: string; sequenceNumber: string };
    const { sub } = req.user as { sub: string };
    await assertOwnsMatch(id, sub);
    await matchService.removeVoiceNote(id, Number(sequenceNumber));
    reply.code(204).send();
  });
}
