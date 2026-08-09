import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as clubService from '../services/clubService.js';
import * as clubRepository from '../repositories/clubRepository.js';
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

export async function clubRoutes(app: FastifyInstance): Promise<void> {
  // ClubHomeScreen
  app.get('/clubs/:id', async (req) => {
    const { id } = req.params as { id: string };
    return clubService.getClub(id);
  });

  // ClubSettlementsScreen
  app.get('/clubs/:id/settlements', async (req) => {
    const { id } = req.params as { id: string };
    return clubService.listSettlementsForClub(id);
  });

  // ClubTournamentListScreen
  app.get('/clubs/:id/tournaments', async (req) => {
    const { id } = req.params as { id: string };
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

  // ClubFlow: resuelve qué club administra el club_admin logueado.
  app.get('/club-admins/:userId/club', async (req) => {
    const { userId } = req.params as { userId: string };
    return clubService.getClubForAdmin(userId);
  });
}
