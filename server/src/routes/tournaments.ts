import type { FastifyInstance } from 'fastify';
import * as tournamentService from '../services/tournamentService.js';

export async function tournamentRoutes(app: FastifyInstance): Promise<void> {
  // ClubTournamentDetailScreen
  app.get('/tournaments/:id/coaches', async (req) => {
    const { id } = req.params as { id: string };
    return tournamentService.getTournamentRoster(id);
  });
}
