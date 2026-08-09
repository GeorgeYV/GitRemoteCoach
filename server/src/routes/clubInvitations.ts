import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as clubInvitationService from '../services/clubInvitationService.js';
import * as clubInvitationRepository from '../repositories/clubInvitationRepository.js';
import * as clubRepository from '../repositories/clubRepository.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';

const inviteCoachSchema = z.object({
  clubId: z.string().uuid(),
  tournamentId: z.string().uuid(),
  coachId: z.string().uuid(),
  message: z.string().max(500).optional(),
});

const respondSchema = z.object({
  decision: z.enum(['accepted', 'declined']),
});

export async function clubInvitationRoutes(app: FastifyInstance): Promise<void> {
  // Club/federación invita a un entrenador a ser "oficial" en un torneo (CoachClubInvitationScreen).
  app.post('/club-invitations', { preHandler: app.authenticate }, async (req, reply) => {
    const parsed = inviteCoachSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const { sub } = req.user as { sub: string };

    let adminClubId: string;
    try {
      adminClubId = await clubRepository.getClubIdForAdminUser(sub);
    } catch {
      throw new ForbiddenError('Solo un administrador del club puede invitar entrenadores');
    }
    if (adminClubId !== parsed.data.clubId) {
      throw new ForbiddenError('Solo un administrador del club puede invitar entrenadores');
    }

    const invitation = await clubInvitationService.inviteCoach({ ...parsed.data, invitedBy: sub });
    reply.code(201).send(invitation);
  });

  app.get('/coaches/:id/club-invitations', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };
    if (sub !== id) throw new ForbiddenError('No podés ver las invitaciones de otro entrenador');
    return clubInvitationService.listPendingInvitationsForCoach(id);
  });

  app.post('/club-invitations/:id/respond', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const parsed = respondSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const { sub } = req.user as { sub: string };

    const invitation = await clubInvitationRepository.getInvitationById(id);
    if (invitation.coachId !== sub) throw new ForbiddenError('No podés responder la invitación de otro entrenador');

    return clubInvitationService.respondToInvitation(id, parsed.data.decision);
  });
}
