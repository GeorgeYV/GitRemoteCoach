import type { FastifyInstance } from 'fastify';
import * as clubRepository from '../repositories/clubRepository.js';
import * as tournamentRepository from '../repositories/tournamentRepository.js';
import * as settlementService from '../services/settlementService.js';
import { ForbiddenError } from '../lib/errors.js';

/**
 * Disparo manual del batch de liquidación (además del job programado en
 * jobs/settleClubsRunner.ts) — útil para operación/soporte y pruebas.
 */
export async function settlementRoutes(app: FastifyInstance): Promise<void> {
  // ClubTournamentDetailScreen "Liquidar" — solo un admin del club dueño del torneo puede liquidarlo.
  app.post('/tournaments/:id/settle', { preHandler: app.authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };

    const tournament = await tournamentRepository.getTournamentCommissionInfo(id);
    let adminClubId: string;
    try {
      adminClubId = await clubRepository.getClubIdForAdminUser(sub);
    } catch {
      throw new ForbiddenError('Solo un administrador del club puede liquidar este torneo');
    }
    if (adminClubId !== tournament.clubId) {
      throw new ForbiddenError('Solo un administrador del club puede liquidar este torneo');
    }

    const settlement = await settlementService.settleTournamentCommissions(id);
    if (!settlement) {
      reply.code(200).send({ message: 'No había comisiones pendientes de liquidar para este torneo', settlement: null });
      return;
    }
    reply.code(201).send(settlement);
  });
}
