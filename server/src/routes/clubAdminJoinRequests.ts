import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as clubAdminJoinRequestRepository from '../repositories/clubAdminJoinRequestRepository.js';
import * as clubRepository from '../repositories/clubRepository.js';
import * as clubAdminJoinRequestService from '../services/clubAdminJoinRequestService.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';

const respondSchema = z.object({
  decision: z.enum(['accepted', 'declined']),
});

/** Administrador de respaldo, dirección "alguien ya registrado pide unirse" (ver decisión #42 en
 * db/schema.sql) — reverso de clubAdminInvitations.ts. */
export async function clubAdminJoinRequestRoutes(app: FastifyInstance): Promise<void> {
  // ClubJoinScreen "Buscar mi club" -> "Solicitar acceso". Sin chequeo de rol acá, mismo criterio
  // que POST /clubs (registerClub): cualquier usuario autenticado puede pedir, la restricción
  // real ("un club por admin") se aplica recién al aprobar.
  app.post('/clubs/:id/admin-join-requests', { preHandler: app.authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };
    const request = await clubAdminJoinRequestService.requestToJoin({ clubId: id, userId: sub });
    reply.code(201).send(request);
  });

  // ClubJoinScreen: si el usuario ya tiene una solicitud pendiente en curso.
  app.get('/club-admin-join-requests/mine', { preHandler: app.authenticate }, async (req) => {
    const { sub } = req.user as { sub: string };
    return clubAdminJoinRequestService.listPendingRequestsForUser(sub);
  });

  // ClubHomeScreen "Solicitudes de acceso": pendientes para este club.
  app.get('/clubs/:id/admin-join-requests', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };

    let adminClubId: string;
    try {
      adminClubId = await clubRepository.getClubIdForAdminUser(sub);
    } catch {
      throw new ForbiddenError('Solo un administrador del club puede ver sus solicitudes de acceso');
    }
    if (adminClubId !== id) {
      throw new ForbiddenError('Solo un administrador del club puede ver sus solicitudes de acceso');
    }

    return clubAdminJoinRequestService.listPendingRequestsForClub(id);
  });

  app.put('/club-admin-join-requests/:id/respond', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const parsed = respondSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const { sub } = req.user as { sub: string };

    const request = await clubAdminJoinRequestRepository.getRequestById(id);
    let adminClubId: string;
    try {
      adminClubId = await clubRepository.getClubIdForAdminUser(sub);
    } catch {
      throw new ForbiddenError('Solo un administrador del club puede responder esta solicitud');
    }
    if (adminClubId !== request.clubId) {
      throw new ForbiddenError('Solo un administrador del club puede responder esta solicitud');
    }

    return clubAdminJoinRequestService.respondToRequest(id, parsed.data.decision);
  });
}
