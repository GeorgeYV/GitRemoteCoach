import { withTransaction } from '../lib/db.js';
import { ConflictError, ForbiddenError } from '../lib/errors.js';
import * as clubAdminInvitationRepository from '../repositories/clubAdminInvitationRepository.js';
import * as userRepository from '../repositories/userRepository.js';
import * as clubService from './clubService.js';
import type { ClubAdminInvitation, ClubAdminInvitationWithClubName, ClubInvitationStatus } from '../types.js';

/** ClubHomeScreen "Invitar administrador de respaldo" — invitedBy ya se validó como club_admin
 * de clubId en la ruta (mismo patrón que POST /clubs/:id/tournaments). El trigger
 * fn_club_admin_invitations_validate_inviter lo vuelve a chequear a nivel de base, por si
 * alguna vez se inserta esta fila por otro camino. */
export async function inviteAdmin(params: { clubId: string; email: string; invitedBy: string }): Promise<ClubAdminInvitation> {
  return clubAdminInvitationRepository.createInvitation(params);
}

/** ClubHomeScreen: invitaciones ya enviadas por este club, para mostrar su estado. */
export async function listInvitationsForClub(clubId: string): Promise<ClubAdminInvitation[]> {
  return clubAdminInvitationRepository.listInvitationsForClub(clubId);
}

/** ClubJoinScreen: invitaciones pendientes para el email del usuario logueado. */
export async function listPendingInvitationsForEmail(email: string): Promise<ClubAdminInvitationWithClubName[]> {
  return clubAdminInvitationRepository.listPendingInvitationsForEmail(email);
}

/** ClubJoinScreen "Aceptar invitación" — a diferencia de club_coach_invitations (coachId ya
 * conocido de antemano), acá hay que confirmar que quien responde es realmente el dueño del
 * email invitado (la invitación no sabe su userId hasta este momento). Aceptar y vincular a
 * club_admins son atómicos: si el usuario ya administra otro club, toda la transacción se
 * revierte y la invitación queda 'pending' para reintentar (ej. desde otra cuenta). */
export async function respondToInvitation(
  invitationId: string,
  respondingUserId: string,
  decision: Extract<ClubInvitationStatus, 'accepted' | 'declined'>,
): Promise<ClubAdminInvitation> {
  const invitation = await clubAdminInvitationRepository.getInvitationById(invitationId);
  const user = await userRepository.findById(respondingUserId);
  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new ForbiddenError('Esta invitación no fue enviada a tu email');
  }

  return withTransaction(async (client) => {
    const updated = await clubAdminInvitationRepository.respondToInvitation(invitationId, decision, client);
    if (!updated) {
      throw new ConflictError('La invitación ya fue respondida', 'invalid_transition');
    }
    if (decision === 'accepted') {
      await clubService.linkAdminToClub(respondingUserId, updated.clubId, client);
    }
    return updated;
  });
}
