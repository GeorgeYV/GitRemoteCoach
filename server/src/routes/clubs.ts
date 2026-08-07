import type { FastifyInstance } from 'fastify';
import * as clubService from '../services/clubService.js';

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

  // ClubFlow: resuelve qué club administra el club_admin logueado.
  app.get('/club-admins/:userId/club', async (req) => {
    const { userId } = req.params as { userId: string };
    return clubService.getClubForAdmin(userId);
  });
}
