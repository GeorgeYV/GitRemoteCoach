import { withTransaction } from '../lib/db.js';
import { ConflictError } from '../lib/errors.js';
import * as clubAdminJoinRequestRepository from '../repositories/clubAdminJoinRequestRepository.js';
import * as clubRepository from '../repositories/clubRepository.js';
import * as userRepository from '../repositories/userRepository.js';
import * as notificationService from './notificationService.js';
import * as clubService from './clubService.js';
import type {
  ClubAdminJoinRequest,
  ClubAdminJoinRequestWithClubName,
  ClubAdminJoinRequestWithUserName,
  ClubInvitationStatus,
} from '../types.js';

/** ClubJoinScreen "Buscar mi club" -> "Solicitar acceso" — quien pide ya se validó en la ruta
 * como club_admin sin club propio todavía (mismo espíritu que registerClub). Avisa por correo a
 * todos los admins actuales del club (puede haber más de uno, ver decisión #42) — hoy esto no
 * mandaba ningún aviso, el club solo se enteraba si entraba a mirar "Solicitudes de acceso". */
export async function requestToJoin(params: { clubId: string; userId: string }): Promise<ClubAdminJoinRequest> {
  const request = await clubAdminJoinRequestRepository.createRequest(params);

  const [club, requester, adminUserIds] = await Promise.all([
    clubRepository.getById(params.clubId),
    userRepository.findById(params.userId),
    clubRepository.listAdminUserIds(params.clubId),
  ]);
  await Promise.all(
    adminUserIds.map((adminUserId) =>
      notificationService.notifyUserByEmail(adminUserId, {
        subject: 'Solicitud de administrador de respaldo — Remote Coach',
        html: `<p><strong>${requester.fullName}</strong> pidió unirse como administrador de respaldo de <strong>${club.name}</strong>.</p>`,
      }),
    ),
  );

  return request;
}

/** ClubJoinScreen: si el usuario ya tiene una solicitud pendiente, mostrar ese estado en vez de
 * dejarlo pedir de nuevo. */
export async function listPendingRequestsForUser(userId: string): Promise<ClubAdminJoinRequestWithClubName[]> {
  return clubAdminJoinRequestRepository.listPendingRequestsForUser(userId);
}

/** ClubHomeScreen "Solicitudes de acceso": pendientes para el club del admin logueado. */
export async function listPendingRequestsForClub(clubId: string): Promise<ClubAdminJoinRequestWithUserName[]> {
  return clubAdminJoinRequestRepository.listPendingRequestsForClub(clubId);
}

/** ClubHomeScreen "Solicitudes de acceso" — el chequeo de que quien responde es club_admin del
 * club de la solicitud vive en la ruta. Aprobar y vincular a club_admins son atómicos, mismo
 * criterio que clubAdminInvitationService.respondToInvitation. */
export async function respondToRequest(
  requestId: string,
  decision: Extract<ClubInvitationStatus, 'accepted' | 'declined'>,
): Promise<ClubAdminJoinRequest> {
  return withTransaction(async (client) => {
    const updated = await clubAdminJoinRequestRepository.respondToRequest(requestId, decision, client);
    if (!updated) {
      throw new ConflictError('La solicitud ya fue respondida', 'invalid_transition');
    }
    if (decision === 'accepted') {
      await clubService.linkAdminToClub(updated.userId, updated.clubId, client);
    }
    return updated;
  });
}
