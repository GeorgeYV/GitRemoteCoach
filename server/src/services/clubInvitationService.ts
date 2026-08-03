import { withTransaction } from '../lib/db.js';
import { ConflictError } from '../lib/errors.js';
import * as clubInvitationRepository from '../repositories/clubInvitationRepository.js';
import * as tournamentCoachTagRepository from '../repositories/tournamentCoachTagRepository.js';
import type { ClubCoachInvitation, ClubInvitationStatus } from '../types.js';

export interface InviteCoachParams {
  clubId: string;
  tournamentId: string;
  coachId: string;
  invitedBy: string;
  message?: string;
}

export async function inviteCoach(params: InviteCoachParams): Promise<ClubCoachInvitation> {
  return clubInvitationRepository.createInvitation(params);
}

export async function listPendingInvitationsForCoach(coachId: string): Promise<ClubCoachInvitation[]> {
  return clubInvitationRepository.listPendingInvitationsForCoach(coachId);
}

/**
 * CoachClubInvitationScreen: al aceptar, además de marcar la invitación
 * también se etiqueta al entrenador como oficial del club en el torneo
 * (tournament_coach_tags) — ambas cosas atómicas para no dejar una
 * invitación "accepted" sin su tag correspondiente.
 */
export async function respondToInvitation(
  invitationId: string,
  decision: Extract<ClubInvitationStatus, 'accepted' | 'declined'>,
): Promise<ClubCoachInvitation> {
  return withTransaction(async (client) => {
    const updated = await clubInvitationRepository.respondToInvitation(invitationId, decision, client);
    if (!updated) {
      throw new ConflictError('La invitación ya fue respondida', 'invalid_transition');
    }
    if (decision === 'accepted') {
      await tournamentCoachTagRepository.addCoachTag(
        { tournamentId: updated.tournamentId, coachId: updated.coachId, taggedBy: updated.invitedBy },
        client,
      );
    }
    return updated;
  });
}
