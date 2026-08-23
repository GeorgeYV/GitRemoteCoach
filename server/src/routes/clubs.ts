import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as clubService from '../services/clubService.js';
import * as clubRepository from '../repositories/clubRepository.js';
import * as tournamentService from '../services/tournamentService.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';

const createTournamentSchema = z
  .object({
    name: z.string().min(1),
    venue: z.string().min(1),
    startDate: z.string().date(),
    endDate: z.string().date(),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: 'endDate debe ser igual o posterior a startDate',
    path: ['endDate'],
  });

const COUNTRY_CODES = ['EC', 'PE', 'CO', 'CL', 'BO', 'AR', 'VE', 'BR', 'PY', 'UY'] as const;

const reviewClubSchema = z.object({
  status: z.enum(['approved', 'rejected']),
});

// Compartido entre POST /clubs y PUT /clubs/:id — identityDocumentUrl queda afuera de este base:
// obligatorio para crear (createClubSchema abajo), pero editar un club existente no debe volver
// a pedirlo (ver decisión #43 en db/schema.sql, mismo criterio que ClubRegistrationScreen "Editar
// perfil" no toca documentos de coach tampoco).
const updateClubSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['club', 'federation']),
  city: z.string().min(1),
  country: z.enum(COUNTRY_CODES),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().min(1).optional(),
});

const createClubSchema = updateClubSchema.extend({
  identityDocumentUrl: z.string().min(1),
});

export async function clubRoutes(app: FastifyInstance): Promise<void> {
  // ClubRegistrationScreen: onboarding del club_admin logueado — crea el club y lo vincula a él.
  app.post('/clubs', { preHandler: app.authenticate }, async (req, reply) => {
    const parsed = createClubSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const { sub } = req.user as { sub: string };
    const club = await clubService.registerClub(sub, parsed.data);
    reply.code(201);
    return club;
  });

  // ClubJoinScreen "Buscar mi club" — para pedir administrar un club ya existente en vez de
  // crear uno nuevo (ver decisión #42 en db/schema.sql). Ruta fija ANTES de /clubs/:id para que
  // Fastify no confunda "search" con un :id.
  app.get('/clubs/search', { preHandler: app.authenticate }, async (req) => {
    const { q } = req.query as { q?: string };
    if (!q || q.trim().length === 0) return [];
    return clubService.searchClubs(q.trim());
  });

  // ClubHomeScreen
  app.get('/clubs/:id', async (req) => {
    const { id } = req.params as { id: string };
    return clubService.getClub(id);
  });

  // ClubRegistrationScreen "Editar perfil" — mismo chequeo de pertenencia que
  // POST /clubs/:id/tournaments: solo un admin de este club puede editarlo.
  app.put('/clubs/:id', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };

    let adminClubId: string;
    try {
      adminClubId = await clubRepository.getClubIdForAdminUser(sub);
    } catch {
      throw new ForbiddenError('Solo un administrador del club puede editarlo');
    }
    if (adminClubId !== id) {
      throw new ForbiddenError('Solo un administrador del club puede editarlo');
    }

    const parsed = updateClubSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    return clubService.updateClub(id, parsed.data);
  });

  // ClubSettlementsScreen — datos financieros del club (comisiones, referencias de pago), solo
  // para su propio administrador.
  app.get('/clubs/:id/settlements', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };

    let adminClubId: string;
    try {
      adminClubId = await clubRepository.getClubIdForAdminUser(sub);
    } catch {
      throw new ForbiddenError('Solo un administrador del club puede ver sus liquidaciones');
    }
    if (adminClubId !== id) {
      throw new ForbiddenError('Solo un administrador del club puede ver sus liquidaciones');
    }

    return clubService.listSettlementsForClub(id);
  });

  // ClubTournamentListScreen — incluye pendingCommissionAmount (dato financiero del club), solo
  // para su propio administrador.
  app.get('/clubs/:id/tournaments', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };

    let adminClubId: string;
    try {
      adminClubId = await clubRepository.getClubIdForAdminUser(sub);
    } catch {
      throw new ForbiddenError('Solo un administrador del club puede ver sus torneos');
    }
    if (adminClubId !== id) {
      throw new ForbiddenError('Solo un administrador del club puede ver sus torneos');
    }

    return clubService.listTournamentsForClub(id);
  });

  // ClubCreateTournamentScreen: solo un admin del club puede registrar torneos para ese club.
  app.post('/clubs/:id/tournaments', { preHandler: app.authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = createTournamentSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const { sub } = req.user as { sub: string };

    let adminClubId: string;
    try {
      adminClubId = await clubRepository.getClubIdForAdminUser(sub);
    } catch {
      throw new ForbiddenError('Solo un administrador del club puede crear torneos');
    }
    if (adminClubId !== id) {
      throw new ForbiddenError('Solo un administrador del club puede crear torneos');
    }

    const tournament = await clubService.createTournamentForClub(id, parsed.data);
    reply.code(201);
    return tournament;
  });

  // ClubTournamentListScreen, sección "Torneos disponibles para reclamar" — torneos sin club
  // en el mismo país que este club (ver decisión #36 en db/schema.sql).
  app.get('/clubs/:id/unclaimed-tournaments', async (req) => {
    const { id } = req.params as { id: string };
    return tournamentService.listUnclaimedTournamentsForClub(id);
  });

  // Reclamar un torneo sin club — mismo chequeo de pertenencia que crear/editar torneos.
  app.post('/clubs/:id/tournaments/:tournamentId/claim', { preHandler: app.authenticate }, async (req) => {
    const { id, tournamentId } = req.params as { id: string; tournamentId: string };
    const { sub } = req.user as { sub: string };

    let adminClubId: string;
    try {
      adminClubId = await clubRepository.getClubIdForAdminUser(sub);
    } catch {
      throw new ForbiddenError('Solo un administrador del club puede reclamar torneos');
    }
    if (adminClubId !== id) {
      throw new ForbiddenError('Solo un administrador del club puede reclamar torneos');
    }

    await tournamentService.claimTournamentForClub(tournamentId, id);
    return { claimed: true };
  });

  // ClubFlow: resuelve qué club administra el club_admin logueado.
  app.get('/club-admins/:userId/club', async (req) => {
    const { userId } = req.params as { userId: string };
    return clubService.getClubForAdmin(userId);
  });

  // PlatformAdminClubVerificationScreen: cola de clubes autoregistrados sin revisar (ver
  // decisión #41 en db/schema.sql) — mismo guard idiom que coachVerificationDocuments.ts.
  app.get('/clubs/pending-verification', { preHandler: app.authenticate }, async (req) => {
    const { role } = req.user as { role: string };
    if (role !== 'platform_admin') {
      throw new ForbiddenError('Solo un administrador de la plataforma puede ver la cola de verificación');
    }
    return clubService.listPendingClubVerifications();
  });

  app.put('/clubs/:id/review', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub, role } = req.user as { sub: string; role: string };
    if (role !== 'platform_admin') {
      throw new ForbiddenError('Solo un administrador de la plataforma puede revisar clubes');
    }
    const parsed = reviewClubSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    return clubService.reviewClubVerification(id, { status: parsed.data.status, reviewedBy: sub });
  });
}
