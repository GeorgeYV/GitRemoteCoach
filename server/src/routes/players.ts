import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as playerRepository from '../repositories/playerRepository.js';
import * as playerService from '../services/playerService.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';

const AGE_CATEGORIES = ['U10', 'U12', 'U14', 'U16', 'U18'] as const;
const COUNTRY_CODES = ['EC', 'PE', 'CO', 'CL', 'BO', 'AR', 'VE', 'BR', 'PY', 'UY'] as const;

const registerPlayerSchema = z.object({
  fullName: z.string().min(1),
  birthDate: z.string().date(),
  ageCategory: z.enum(AGE_CATEGORIES),
  country: z.enum(COUNTRY_CODES),
});

export async function playerRoutes(app: FastifyInstance): Promise<void> {
  // BookingConfirmScreen: hijos/as ya registrados por el padre logueado — el guardián sale de
  // la sesión, no de query params, para que nadie pueda leer los hijos de otro usuario.
  app.get('/players', { preHandler: app.authenticate }, async (req) => {
    const { sub } = req.user as { sub: string };
    return playerService.listPlayersForGuardian(sub);
  });

  // PlayerRegistrationScreen: crea al hijo/a del padre logueado — mismo razonamiento que POST /coaches.
  app.post('/players', { preHandler: app.authenticate }, async (req, reply) => {
    const parsed = registerPlayerSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);

    const { sub } = req.user as { sub: string };
    const player = await playerService.registerPlayer(sub, parsed.data);
    reply.code(201);
    return player;
  });

  // ParentProfileScreen "Editar jugador" — mismo chequeo de pertenencia que POST /bookings
  // (getById + comparar guardianUserId), reusando el mismo shape que el registro inicial.
  app.put('/players/:id', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };
    const player = await playerRepository.getById(id);
    if (player.guardianUserId !== sub) {
      throw new ForbiddenError('El jugador indicado no pertenece a tu cuenta');
    }
    const parsed = registerPlayerSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    return playerService.updatePlayer(id, parsed.data);
  });
}
