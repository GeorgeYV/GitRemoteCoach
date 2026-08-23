import type { PoolClient } from 'pg';
import { withTransaction } from '../lib/db.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import * as clubRepository from '../repositories/clubRepository.js';
import * as settlementRepository from '../repositories/settlementRepository.js';
import * as tournamentRepository from '../repositories/tournamentRepository.js';
import type { Club, ClubSearchResult, ClubSettlementWithTournamentName, CountryCode, TournamentSummary } from '../types.js';

export async function getClub(clubId: string): Promise<Club> {
  return clubRepository.getById(clubId);
}

/** ClubFlow: resuelve el club del club_admin logueado antes de montar sus pantallas. */
export async function getClubForAdmin(userId: string): Promise<Club> {
  const clubId = await clubRepository.getClubIdForAdminUser(userId);
  return clubRepository.getById(clubId);
}

/** Un usuario solo puede administrar un club a la vez (ver decisión #42) — reusado por
 * registerClub, y por aceptar una invitación o aprobar una solicitud de acceso (Etapa
 * club_admin_invitations/club_admin_join_requests). `client` opcional para correr dentro de la
 * misma transacción que marca la invitación/solicitud respondida. */
async function assertUserHasNoClub(userId: string, client?: PoolClient): Promise<void> {
  try {
    await clubRepository.getClubIdForAdminUser(userId, client);
    throw new ConflictError('Ya administras un club', 'already_club_admin');
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
  }
}

/** ClubRegistrationScreen: onboarding de un usuario club_admin recién registrado — antes de
 * esto, club_admins no tenía ninguna fila para él y ClubFlow se quedaba atascado para siempre
 * en "No se pudo cargar tu club". Crea el club y lo vincula al usuario en una transacción. */
export async function registerClub(
  adminUserId: string,
  input: {
    name: string;
    type: 'club' | 'federation';
    city: string;
    country: CountryCode;
    contactEmail?: string;
    contactPhone?: string;
  },
): Promise<Club> {
  await assertUserHasNoClub(adminUserId);
  return withTransaction(async (client) => {
    const club = await clubRepository.create(
      {
        name: input.name,
        type: input.type,
        city: input.city,
        country: input.country,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
      },
      client,
    );
    await clubRepository.addAdmin(club.id, adminUserId, client);
    return club;
  });
}

/** ClubJoinScreen "Buscar mi club" — para pedir acceso a uno ya existente en vez de crear uno
 * nuevo (ver decisión #42). Sin filtrar por verificación, ver clubRepository.search. */
export async function searchClubs(query: string): Promise<ClubSearchResult[]> {
  return clubRepository.search(query);
}

/** Aplicado tanto al aceptar una invitación (club_admin_invitations) como al aprobar una
 * solicitud de acceso (club_admin_join_requests) — mismo chequeo de "un club por admin" que
 * registerClub. `client` debe ser el mismo de la transacción que marca la fila respondida, para
 * que el chequeo y el insert sean atómicos con esa transición de status. */
export async function linkAdminToClub(userId: string, clubId: string, client: PoolClient): Promise<void> {
  await assertUserHasNoClub(userId, client);
  await clubRepository.addAdmin(clubId, userId, client);
}

/** ClubHomeScreen "Editar perfil" — el chequeo de que quien llama de verdad administra este
 * club vive en la ruta (mismo patrón que POST /clubs/:id/tournaments). */
export async function updateClub(
  clubId: string,
  input: {
    name: string;
    type: 'club' | 'federation';
    city: string;
    country: CountryCode;
    contactEmail?: string;
    contactPhone?: string;
  },
): Promise<Club> {
  return clubRepository.update(clubId, {
    name: input.name,
    type: input.type,
    city: input.city,
    country: input.country,
    contactEmail: input.contactEmail ?? null,
    contactPhone: input.contactPhone ?? null,
  });
}

/** PlatformAdminClubVerificationScreen: cola de clubes pendientes de revisión. */
export async function listPendingClubVerifications(): Promise<Club[]> {
  return clubRepository.listPendingVerification();
}

/** PlatformAdminClubVerificationScreen: aprobar o rechazar un club — el chequeo de rol
 * (platform_admin) vive en la ruta, mismo patrón que el resto de las colas de revisión. */
export async function reviewClubVerification(
  clubId: string,
  input: { status: 'approved' | 'rejected'; reviewedBy: string },
): Promise<Club> {
  return clubRepository.reviewVerification(clubId, input);
}

export async function listSettlementsForClub(clubId: string): Promise<ClubSettlementWithTournamentName[]> {
  return settlementRepository.listByClub(clubId);
}

export async function listTournamentsForClub(clubId: string): Promise<TournamentSummary[]> {
  return tournamentRepository.listByClub(clubId);
}

/** ClubCreateTournamentScreen: el club registra un torneo nuevo — a partir de acá ya puede
 * invitar coaches y (una vez 'scheduled') aparece en el descubrimiento público (GET /tournaments). */
export async function createTournamentForClub(
  clubId: string,
  input: { name: string; venue: string; startDate: string; endDate: string },
): Promise<TournamentSummary> {
  return tournamentRepository.create({ clubId, ...input });
}
