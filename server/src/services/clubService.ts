import { withTransaction } from '../lib/db.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import * as clubRepository from '../repositories/clubRepository.js';
import * as settlementRepository from '../repositories/settlementRepository.js';
import * as tournamentRepository from '../repositories/tournamentRepository.js';
import type { Club, ClubSettlementWithTournamentName, TournamentSummary } from '../types.js';

export async function getClub(clubId: string): Promise<Club> {
  return clubRepository.getById(clubId);
}

/** ClubFlow: resuelve el club del club_admin logueado antes de montar sus pantallas. */
export async function getClubForAdmin(userId: string): Promise<Club> {
  const clubId = await clubRepository.getClubIdForAdminUser(userId);
  return clubRepository.getById(clubId);
}

/** ClubRegistrationScreen: onboarding de un usuario club_admin recién registrado — antes de
 * esto, club_admins no tenía ninguna fila para él y ClubFlow se quedaba atascado para siempre
 * en "No se pudo cargar tu club". Crea el club y lo vincula al usuario en una transacción. */
export async function registerClub(
  adminUserId: string,
  input: { name: string; type: 'club' | 'federation'; city: string; contactEmail?: string; contactPhone?: string },
): Promise<Club> {
  try {
    await clubRepository.getClubIdForAdminUser(adminUserId);
    throw new ConflictError('Ya administras un club', 'already_club_admin');
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
  }
  return withTransaction(async (client) => {
    const club = await clubRepository.create(
      {
        name: input.name,
        type: input.type,
        city: input.city,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
      },
      client,
    );
    await clubRepository.addAdmin(club.id, adminUserId, client);
    return club;
  });
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
