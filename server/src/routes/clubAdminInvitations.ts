import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as clubRepository from '../repositories/clubRepository.js';
import * as userRepository from '../repositories/userRepository.js';
import * as clubAdminInvitationService from '../services/clubAdminInvitationService.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';

const inviteAdminSchema = z.object({
  email: z.string().email(),
});

const respondSchema = z.object({
  decision: z.enum(['accepted', 'declined']),
});

/** Administrador de respaldo, dirección "el club invita" (ver decisión #42 en db/schema.sql) —
 * mismo guard idiom que clubInvitations.ts (invitación a entrenador). */
export async function clubAdminInvitationRoutes(app: FastifyInstance): Promise<void> {
  app.post('/clubs/:id/admin-invitations', { preHandler: app.authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = inviteAdminSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const { sub } = req.user as { sub: string };

    let adminClubId: string;
    try {
      adminClubId = await clubRepository.getClubIdForAdminUser(sub);
    } catch {
      throw new ForbiddenError('Solo un administrador del club/federación puede invitar administradores de respaldo');
    }
    if (adminClubId !== id) {
      throw new ForbiddenError('Solo un administrador del club/federación puede invitar administradores de respaldo');
    }

    const invitation = await clubAdminInvitationService.inviteAdmin({ clubId: id, email: parsed.data.email, invitedBy: sub });
    reply.code(201).send(invitation);
  });

  // ClubHomeScreen: invitaciones que este club ya mandó, con su estado.
  app.get('/clubs/:id/admin-invitations', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };

    let adminClubId: string;
    try {
      adminClubId = await clubRepository.getClubIdForAdminUser(sub);
    } catch {
      throw new ForbiddenError('Solo un administrador del club/federación puede ver sus invitaciones enviadas');
    }
    if (adminClubId !== id) {
      throw new ForbiddenError('Solo un administrador del club/federación puede ver sus invitaciones enviadas');
    }

    return clubAdminInvitationService.listInvitationsForClub(id);
  });

  // ClubJoinScreen: invitaciones pendientes para el email del usuario logueado.
  app.get('/club-admin-invitations/mine', { preHandler: app.authenticate }, async (req) => {
    const { sub } = req.user as { sub: string };
    const user = await userRepository.findById(sub);
    return clubAdminInvitationService.listPendingInvitationsForEmail(user.email);
  });

  app.put('/club-admin-invitations/:id/respond', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const parsed = respondSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const { sub } = req.user as { sub: string };

    // El chequeo de "es realmente el email invitado" vive en el service — necesita el email
    // actual del usuario, no solo su id.
    return clubAdminInvitationService.respondToInvitation(id, sub, parsed.data.decision);
  });
}
