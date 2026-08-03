import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as clubInvitationService from '../services/clubInvitationService.js';
import { ValidationError } from '../lib/errors.js';

const inviteCoachSchema = z.object({
  clubId: z.string().uuid(),
  tournamentId: z.string().uuid(),
  coachId: z.string().uuid(),
  invitedBy: z.string().uuid(),
  message: z.string().max(500).optional(),
});

const respondSchema = z.object({
  decision: z.enum(['accepted', 'declined']),
});

export async function clubInvitationRoutes(app: FastifyInstance): Promise<void> {
  // Club/federación invita a un entrenador a ser "oficial" en un torneo (CoachClubInvitationScreen).
  app.post('/club-invitations', async (req, reply) => {
    const parsed = inviteCoachSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const invitation = await clubInvitationService.inviteCoach(parsed.data);
    reply.code(201).send(invitation);
  });

  app.get('/coaches/:id/club-invitations', async (req) => {
    const { id } = req.params as { id: string };
    return clubInvitationService.listPendingInvitationsForCoach(id);
  });

  app.post('/club-invitations/:id/respond', async (req) => {
    const { id } = req.params as { id: string };
    const parsed = respondSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    return clubInvitationService.respondToInvitation(id, parsed.data.decision);
  });
}
