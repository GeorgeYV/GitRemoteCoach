import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as clubRepository from '../repositories/clubRepository.js';
import * as tournamentReportService from '../services/tournamentReportService.js';
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

const reportTournamentSchema = z.object({ message: z.string().min(1).max(1000) });

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

  // ParentHomeScreen/CoachTournamentSearchScreen: "Reportar un posible error" — no modifica el
  // torneo, solo avisa al club que lo creó (o queda de respaldo en la cola de platform_admin si
  // no tiene club, ver decisión #46).
  app.post('/tournaments/:id/reports', { preHandler: app.authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { sub, role } = req.user as { sub: string; role: string };
    if (role !== 'parent' && role !== 'coach') {
      throw new ForbiddenError('Solo un padre o un entrenador puede reportar un torneo');
    }
    const parsed = reportTournamentSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const report = await tournamentReportService.reportTournament(id, sub, parsed.data.message);
    reply.code(201);
    return report;
  });

  // PlatformAdminTournamentScreen: cola de reportes abiertos de TODOS los clubes — respaldo si
  // el club dueño del torneo no reacciona (ver GET /clubs/:id/tournament-reports para su propia
  // cola en routes/clubs.ts).
  app.get('/tournament-reports/pending', { preHandler: app.authenticate }, async (req) => {
    const { role } = req.user as { role: string };
    if (role !== 'platform_admin') {
      throw new ForbiddenError('Solo un administrador de la plataforma puede ver esta cola');
    }
    return tournamentReportService.listOpenReportsForAdmin();
  });

  // ClubTournamentListScreen/PlatformAdminTournamentScreen: marcar un reporte como resuelto — un
  // club_admin solo puede resolver reportes de su propio club (clubId restringe el UPDATE en el
  // repositorio), platform_admin puede resolver cualquiera.
  app.put('/tournament-reports/:id/resolve', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub, role } = req.user as { sub: string; role: string };
    if (role === 'platform_admin') {
      return tournamentReportService.resolveReport(id, sub);
    }
    if (role === 'club_admin') {
      let clubId: string;
      try {
        clubId = await clubRepository.getClubIdForAdminUser(sub);
      } catch {
        throw new ForbiddenError('Solo un administrador de club o de la plataforma puede resolver reportes');
      }
      return tournamentReportService.resolveReport(id, sub, clubId);
    }
    throw new ForbiddenError('Solo un administrador de club o de la plataforma puede resolver reportes');
  });
}
