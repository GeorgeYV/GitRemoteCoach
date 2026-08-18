import type { FastifyInstance } from 'fastify';
import * as tournamentService from '../services/tournamentService.js';
import type { CountryCode } from '../types.js';

export async function tournamentRoutes(app: FastifyInstance): Promise<void> {
  // CoachTournamentSearchScreen/ParentHomeScreen: descubrimiento público, igual que GET /coaches.
  // country sin validar contra la lista — un valor inválido simplemente no matchea ninguna fila
  // (comparación de texto plano contra la columna, el DOMAIN solo valida en INSERT/UPDATE).
  app.get('/tournaments', async (req) => {
    const { search, country } = req.query as { search?: string; country?: CountryCode };
    return tournamentService.searchTournaments(search, country);
  });

  // ClubTournamentDetailScreen
  app.get('/tournaments/:id/coaches', async (req) => {
    const { id } = req.params as { id: string };
    return tournamentService.getTournamentRoster(id);
  });
}
