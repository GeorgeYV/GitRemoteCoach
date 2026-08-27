import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as tournamentService from '../services/tournamentService.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';
import type { AgeCategory, CountryCode } from '../types.js';

const COUNTRY_CODES = ['EC', 'PE', 'CO', 'CL', 'BO', 'AR', 'VE', 'BR', 'PY', 'UY'] as const;

const createUnclaimedTournamentSchema = z
  .object({
    name: z.string().min(1),
    venue: z.string().min(1),
    city: z.string().min(1),
    country: z.enum(COUNTRY_CODES),
    startDate: z.string().date(),
    endDate: z.string().date(),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: 'endDate debe ser igual o posterior a startDate',
    path: ['endDate'],
  });

export async function tournamentRoutes(app: FastifyInstance): Promise<void> {
  // CoachTournamentSearchScreen/ParentHomeScreen: descubrimiento público, igual que GET /coaches.
  // country/ageCategory sin validar contra su lista de valores — uno inválido simplemente no
  // matchea ninguna fila (comparación de texto plano, el DOMAIN/ENUM solo valida en INSERT/UPDATE).
  app.get('/tournaments', async (req) => {
    const { search, country, ageCategory } = req.query as {
      search?: string;
      country?: CountryCode;
      ageCategory?: AgeCategory;
    };
    return tournamentService.searchTournaments(search, country, ageCategory);
  });

  // ClubTournamentDetailScreen
  app.get('/tournaments/:id/coaches', async (req) => {
    const { id } = req.params as { id: string };
    return tournamentService.getTournamentRoster(id);
  });

  // PlatformAdminTournamentScreen: siembra un torneo sin club (ver decisión #36 en db/schema.sql)
  // para que cualquier club de ese país lo pueda reclamar después.
  app.post('/tournaments', { preHandler: app.authenticate }, async (req, reply) => {
    const { role } = req.user as { role: string };
    if (role !== 'platform_admin') {
      throw new ForbiddenError('Solo un administrador de la plataforma puede crear torneos sin club');
    }
    const parsed = createUnclaimedTournamentSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const tournament = await tournamentService.createUnclaimedTournament(parsed.data);
    reply.code(201);
    return tournament;
  });
}
