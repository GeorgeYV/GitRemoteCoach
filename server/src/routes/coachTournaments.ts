import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as coachTournamentService from '../services/coachTournamentService.js';
import { ValidationError } from '../lib/errors.js';

const RATE_MODES = ['per_match', 'per_day', 'per_tournament'] as const;

const setAvailabilitySchema = z.object({
  days: z.array(
    z.object({
      slotDate: z.string().date(),
      morning: z.boolean(),
      afternoon: z.boolean(),
    }),
  ),
});

const setRateSchema = z.object({
  rateMode: z.enum(RATE_MODES),
  amount: z.number().positive(),
});

/** Disponibilidad y tarifa que el entrenador fija por torneo (CoachAvailabilityScreen). */
export async function coachTournamentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/coaches/:coachId/tournaments/:tournamentId/availability', async (req) => {
    const { coachId, tournamentId } = req.params as { coachId: string; tournamentId: string };
    return coachTournamentService.getAvailabilityAndRate(coachId, tournamentId);
  });

  app.put('/coaches/:coachId/tournaments/:tournamentId/availability', async (req) => {
    const { coachId, tournamentId } = req.params as { coachId: string; tournamentId: string };
    const parsed = setAvailabilitySchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    return coachTournamentService.setAvailability(coachId, tournamentId, parsed.data.days);
  });

  app.put('/coaches/:coachId/tournaments/:tournamentId/rate', async (req) => {
    const { coachId, tournamentId } = req.params as { coachId: string; tournamentId: string };
    const parsed = setRateSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    return coachTournamentService.setRate(coachId, tournamentId, parsed.data);
  });
}
