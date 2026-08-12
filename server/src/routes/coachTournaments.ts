import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as coachTournamentService from '../services/coachTournamentService.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';

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

function assertOwnsCoachId(coachId: string, sub: string): void {
  if (sub !== coachId) throw new ForbiddenError('No podés modificar la disponibilidad de otro entrenador');
}

/** Disponibilidad y tarifa que el entrenador fija por torneo (CoachAvailabilityScreen). */
export async function coachTournamentRoutes(app: FastifyInstance): Promise<void> {
  // Lectura pública: TrainerProfileScreen la usa para mostrarle a un padre la disponibilidad real del coach.
  app.get('/coaches/:coachId/tournaments/:tournamentId/availability', async (req) => {
    const { coachId, tournamentId } = req.params as { coachId: string; tournamentId: string };
    return coachTournamentService.getAvailabilityAndRate(coachId, tournamentId);
  });

  // Lectura pública: TrainerProfileScreen la usa para mostrarle a un padre cuántos jugadores ya reservaron.
  app.get('/coaches/:coachId/tournaments/:tournamentId/booking-count', async (req) => {
    const { coachId, tournamentId } = req.params as { coachId: string; tournamentId: string };
    const bookedPlayers = await coachTournamentService.getBookedPlayersCount(coachId, tournamentId);
    return { bookedPlayers };
  });

  app.put(
    '/coaches/:coachId/tournaments/:tournamentId/availability',
    { preHandler: app.authenticate },
    async (req) => {
      const { coachId, tournamentId } = req.params as { coachId: string; tournamentId: string };
      const { sub } = req.user as { sub: string };
      assertOwnsCoachId(coachId, sub);
      const parsed = setAvailabilitySchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      return coachTournamentService.setAvailability(coachId, tournamentId, parsed.data.days);
    },
  );

  app.put('/coaches/:coachId/tournaments/:tournamentId/rate', { preHandler: app.authenticate }, async (req) => {
    const { coachId, tournamentId } = req.params as { coachId: string; tournamentId: string };
    const { sub } = req.user as { sub: string };
    assertOwnsCoachId(coachId, sub);
    const parsed = setRateSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    return coachTournamentService.setRate(coachId, tournamentId, parsed.data);
  });
}
