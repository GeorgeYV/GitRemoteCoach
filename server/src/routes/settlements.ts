import type { FastifyInstance } from 'fastify';
import * as clubRepository from '../repositories/clubRepository.js';
import * as tournamentRepository from '../repositories/tournamentRepository.js';
import * as settlementService from '../services/settlementService.js';
import { ForbiddenError } from '../lib/errors.js';

function requirePlatformAdmin(role: string): void {
  if (role !== 'platform_admin') {
    throw new ForbiddenError('Solo un administrador de la plataforma puede liquidar pagos a entrenadores');
  }
}

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

  // PlatformAdminPayoutsScreen: torneos ya finalizados con pagos a entrenadores sin liquidar
  // (mismo cálculo que jobs/settleCoachPayoutsRunner.ts, sin programar todavía, ver decisión de
  // fase 1) — le da al admin una forma de dispararlo desde la app mientras tanto.
  app.get('/tournaments/ready-for-coach-payout', { preHandler: app.authenticate }, async (req) => {
    const { role } = req.user as { role: string };
    requirePlatformAdmin(role);
    return tournamentRepository.findTournamentsEndedWithoutCoachPayoutWithNames();
  });

  // PlatformAdminPayoutsScreen "Liquidar" — mismo disparo manual que /tournaments/:id/settle,
  // pero para pagos a entrenadores (settlementService.settleTournamentCoachPayouts) en vez de
  // comisión de club, así que el guard es platform_admin y no dueño del club.
  app.post('/tournaments/:id/settle-coach-payouts', { preHandler: app.authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { role } = req.user as { role: string };
    requirePlatformAdmin(role);

    const payouts = await settlementService.settleTournamentCoachPayouts(id);
    if (payouts.length === 0) {
      reply.code(200).send({ message: 'No había pagos pendientes de liquidar para este torneo', payouts: [] });
      return;
    }
    reply.code(201).send({ payouts });
  });
}
