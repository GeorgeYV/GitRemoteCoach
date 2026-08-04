import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as coachProfileService from '../services/coachProfileService.js';
import * as bookingService from '../services/bookingService.js';
import { ValidationError } from '../lib/errors.js';

const AGE_CATEGORIES = ['U10', 'U12', 'U14', 'U16', 'U18'] as const;
const PLAYING_LEVELS = ['recreativo', 'competitivo', 'alto_rendimiento'] as const;

const updateTrainingSchema = z.object({
  ageCategories: z.array(z.enum(AGE_CATEGORIES)),
  levels: z.array(z.enum(PLAYING_LEVELS)),
});

export async function coachRoutes(app: FastifyInstance): Promise<void> {
  app.get('/coaches/:id', async (req) => {
    const { id } = req.params as { id: string };
    return coachProfileService.getCoachProfile(id);
  });

  // CoachRegistrationScreen: guarda categorías de edad + niveles de juego seleccionados.
  app.put('/coaches/:id/training', async (req) => {
    const { id } = req.params as { id: string };
    const parsed = updateTrainingSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    return coachProfileService.updateCoachTraining(id, parsed.data);
  });

  // CoachHomeScreen, CoachRequestInboxScreen, CoachSessionHistoryScreen, CoachEarningsScreen.
  app.get('/coaches/:id/bookings', async (req) => {
    const { id } = req.params as { id: string };
    return bookingService.listBookingsForCoach(id);
  });
}
