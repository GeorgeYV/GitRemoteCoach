import type { FastifyInstance } from 'fastify';
import * as tournamentService from '../services/tournamentService.js';

export async function tournamentRoutes(app: FastifyInstance): Promise<void> {
  // CoachTournamentSearchScreen: descubrimiento público, igual que GET /coaches.
  app.get('/tournaments', async (req) => {
    const { search } = req.query as { search?: string };
    return tournamentService.searchTournaments(search);
  });

  // ClubTournamentDetailScreen
  app.get('/tournaments/:id/coaches', async (req) => {
    const { id } = req.params as { id: string };
    return tournamentService.getTournamentRoster(id);
  });
}
