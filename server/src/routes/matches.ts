import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as matchService from '../services/matchService.js';
import { ValidationError } from '../lib/errors.js';

const BEST_OF = ['1', '3'] as const;
const PLAYER_SLOT = ['player1', 'player2'] as const;
const CAPTURE_MODE = ['rapida', 'detallada'] as const;
const MATCH_STATUS = ['in_progress', 'completed'] as const;
const POINT_DETAIL = [
  'winner_derecha',
  'winner_reves',
  'winner_volea',
  'ace',
  'doble_falta',
  'error_no_forzado',
  'error_forzado',
] as const;

const getOrCreateMatchSchema = z.object({
  bookingId: z.string().uuid(),
  player2Label: z.string().min(1).max(200),
  bestOf: z.enum(BEST_OF),
  noAd: z.boolean(),
  initialServer: z.enum(PLAYER_SLOT),
  captureMode: z.enum(CAPTURE_MODE),
});

const pointSchema = z.object({
  sequenceNumber: z.number().int().positive(),
  wonBy: z.enum(PLAYER_SLOT),
  detail: z.enum(POINT_DETAIL).nullable(),
  firstServeIn: z.boolean(),
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

const captureModeSchema = z.object({
  captureMode: z.enum(CAPTURE_MODE),
});

export async function matchRoutes(app: FastifyInstance): Promise<void> {
  // LiveCaptureView: "Comenzar captura en vivo" (CoachMatchSetupScreen). Idempotente por booking_id.
  app.post('/matches', async (req, reply) => {
    const parsed = getOrCreateMatchSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const match = await matchService.getOrCreateMatch(parsed.data);
    reply.code(201).send(match);
  });

  // LiveCaptureView: cada punto anotado en vivo.
  app.post('/matches/:id/points', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = pointSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const point = await matchService.addPoint(id, parsed.data);
    reply.code(201).send(point);
  });

  // LiveCaptureView: catálogo de recuperación tras hidratar AsyncStorage o botón "Reintentar sincronización".
  app.post('/matches/:id/points/bulk', async (req) => {
    const { id } = req.params as { id: string };
    const parsed = pointsBulkSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    return matchService.addPointsBulk(id, parsed.data.points);
  });

  // LiveCaptureView: deshacer último punto.
  app.delete('/matches/:id/points/:sequenceNumber', async (req, reply) => {
    const { id, sequenceNumber } = req.params as { id: string; sequenceNumber: string };
    await matchService.removePoint(id, Number(sequenceNumber));
    reply.code(204).send();
  });

  // MatchSummaryView: "Nuevo partido" — reinicia el mismo partido (booking_id es UNIQUE, no crea uno nuevo).
  app.post('/matches/:id/restart', async (req) => {
    const { id } = req.params as { id: string };
    return matchService.restartMatch(id);
  });

  // LiveCaptureView/MatchSummaryView: finalizar ("Finalizar partido") / reabrir ("Deshacer último punto y volver").
  app.patch('/matches/:id/status', async (req) => {
    const { id } = req.params as { id: string };
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    return matchService.setStatus(id, parsed.data.status);
  });

  // MatchSummaryView: observaciones del entrenador (debounced en el cliente).
  app.patch('/matches/:id/observations', async (req) => {
    const { id } = req.params as { id: string };
    const parsed = observationsSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    return matchService.setObservations(id, parsed.data.coachObservations);
  });

  // LiveCaptureView: ModeSwitch (rápida/detallada).
  app.patch('/matches/:id/capture-mode', async (req) => {
    const { id } = req.params as { id: string };
    const parsed = captureModeSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    return matchService.setCaptureMode(id, parsed.data.captureMode);
  });
}
