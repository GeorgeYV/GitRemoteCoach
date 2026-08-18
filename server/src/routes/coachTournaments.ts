import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as coachTournamentService from '../services/coachTournamentService.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';

const RATE_MODES = ['per_day', 'per_tournament'] as const;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const dayAvailabilitySchema = z
  .object({
    slotDate: z.string().date(),
    available: z.boolean(),
    // Bloque horario de excepción dentro del día (ej. "15:00"/"17:00") — ambos presentes o
    // ambos ausentes; ver chk_coach_tournament_availability_exception_range en el schema.
    unavailableFrom: z.string().regex(HHMM).nullish(),
    unavailableTo: z.string().regex(HHMM).nullish(),
  })
  .refine((day) => (day.unavailableFrom == null) === (day.unavailableTo == null), {
    message: 'unavailableFrom y unavailableTo deben venir juntos o ninguno de los dos',
  })
  .refine((day) => day.unavailableFrom == null || day.unavailableTo! > day.unavailableFrom, {
    message: 'unavailableTo debe ser posterior a unavailableFrom',
  });

const setAvailabilitySchema = z.object({
  days: z.array(dayAvailabilitySchema),
});

const setRateSchema = z.object({
  rateMode: z.enum(RATE_MODES),
  amount: z.number().positive(),
  approachDescription: z.string().max(1000).optional(),
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

  // Lectura pública: TrainerListScreen la usa para mostrarle a un padre quiénes (no solo cuántos) ya reservaron.
  app.get('/coaches/:coachId/tournaments/:tournamentId/booked-players', async (req) => {
    const { coachId, tournamentId } = req.params as { coachId: string; tournamentId: string };
    const players = await coachTournamentService.getBookedPlayers(coachId, tournamentId);
    return { players };
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
