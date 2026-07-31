import type { FastifyInstance } from 'fastify';
import * as settlementService from '../services/settlementService.js';

/**
 * Disparo manual del batch de liquidación (además del job programado en
 * jobs/settleClubsRunner.ts) — útil para operación/soporte y pruebas.
 */
export async function settlementRoutes(app: FastifyInstance): Promise<void> {
  app.post('/tournaments/:id/settle', async (req, reply) => {
    const { id } = req.params as { id: string };
    const settlement = await settlementService.settleTournamentCommissions(id);
    if (!settlement) {
      reply.code(200).send({ message: 'No había comisiones pendientes de liquidar para este torneo', settlement: null });
      return;
    }
    reply.code(201).send(settlement);
  });
}
