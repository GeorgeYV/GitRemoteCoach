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
