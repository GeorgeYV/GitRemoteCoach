import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as coachProfileService from '../services/coachProfileService.js';
import * as bookingService from '../services/bookingService.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';

const AGE_CATEGORIES = ['U10', 'U12', 'U14', 'U16', 'U18'] as const;
const PLAYING_LEVELS = ['recreativo', 'competitivo', 'alto_rendimiento'] as const;

const updateTrainingSchema = z.object({
  ageCategories: z.array(z.enum(AGE_CATEGORIES)),
  levels: z.array(z.enum(PLAYING_LEVELS)),
});

const registerCoachSchema = z.object({
  city: z.string().min(1),
  region: z.string().min(1).optional(),
  yearsExperience: z.number().int().min(0),
  specialty: z.string().min(1).optional(),
  hourlyRate: z.number().min(0),
  ageCategories: z.array(z.enum(AGE_CATEGORIES)),
  levels: z.array(z.enum(PLAYING_LEVELS)),
});

export async function coachRoutes(app: FastifyInstance): Promise<void> {
  // ClubInviteCoachScreen: búsqueda por nombre/ciudad, excluyendo coaches ya oficiales o ya invitados.
  app.get('/coaches', async (req) => {
    const { search, excludeTournamentId } = req.query as { search?: string; excludeTournamentId?: string };
    return coachProfileService.searchCoaches({ query: search, excludeTournamentId });
  });

  // CoachRegistrationScreen "Enviar para verificación": crea el perfil del coach logueado — el
  // user_id sale de la sesión, no del body, para que nadie pueda crear/pisar el perfil de otro.
  app.post('/coaches', { preHandler: app.authenticate }, async (req, reply) => {
    const parsed = registerCoachSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);

    const { sub } = req.user as { sub: string };
    const profile = await coachProfileService.registerCoachProfile(sub, {
      city: parsed.data.city,
      region: parsed.data.region ?? null,
      yearsExperience: parsed.data.yearsExperience,
      specialty: parsed.data.specialty ?? null,
      hourlyRate: parsed.data.hourlyRate,
      ageCategories: parsed.data.ageCategories,
      levels: parsed.data.levels,
    });
    reply.code(201);
    return profile;
  });

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
  app.get('/coaches/:id/bookings', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };
    if (sub !== id) throw new ForbiddenError('No puedes ver las reservas de otro entrenador');
    return bookingService.listBookingsForCoach(id);
  });
}
