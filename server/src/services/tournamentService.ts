import * as clubInvitationRepository from '../repositories/clubInvitationRepository.js';
import * as clubRepository from '../repositories/clubRepository.js';
import * as tournamentCoachTagRepository from '../repositories/tournamentCoachTagRepository.js';
import * as tournamentRepository from '../repositories/tournamentRepository.js';
import { ConflictError } from '../lib/errors.js';
import type {
  AgeCategory,
  ClubCoachInvitationWithCoachName,
  CoachClubTag,
  CountryCode,
  TournamentCoachTagWithProfile,
  TournamentSearchResult,
  UnclaimedTournament,
} from '../types.js';

export interface TournamentRoster {
  officialCoaches: TournamentCoachTagWithProfile[];
  pendingInvitations: ClubCoachInvitationWithCoachName[];
  pendingCommissionAmount: string;
}

/** ClubTournamentDetailScreen: entrenadores ya oficiales, invitaciones que el club todavía espera
 * respuesta, y la comisión generada sin liquidar para este torneo. */
export async function getTournamentRoster(tournamentId: string): Promise<TournamentRoster> {
  const [officialCoaches, pendingInvitations, pendingCommissionAmount] = await Promise.all([
    tournamentCoachTagRepository.listTagsWithProfilesForTournament(tournamentId),
    clubInvitationRepository.listPendingInvitationsForTournament(tournamentId),
    tournamentRepository.getPendingCommissionAmount(tournamentId),
  ]);
  return { officialCoaches, pendingInvitations, pendingCommissionAmount };
}

/** TrainerListScreen (padre): solo los ids, para marcar "Oficial" y ordenarlos primero — a
 * diferencia de getTournamentRoster (club_admin), no expone pendingCommissionAmount ni
 * pendingInvitations, dato financiero/interno del club que un padre no debería ver. */
export async function listOfficialCoachIds(tournamentId: string): Promise<string[]> {
  const tags = await tournamentCoachTagRepository.listTagsWithProfilesForTournament(tournamentId);
  return tags.map((t) => t.coachId);
}

/** CoachTournamentSearchScreen/ParentHomeScreen: torneos activos, opcionalmente filtrados por
 * texto, país del club organizador, y/o categoría de edad (ver decisión #45). */
export async function searchTournaments(
  query?: string,
  country?: CountryCode,
  ageCategory?: AgeCategory,
): Promise<TournamentSearchResult[]> {
  return tournamentRepository.search({ query, country, ageCategory });
}

/** CoachAvailabilityScreen, CoachTournamentSearchScreen, CoachReputationScreen: insignias de
 * "entrenador oficial" del propio entrenador, en todos los torneos donde un club lo etiquetó. */
export async function listClubTagsForCoach(coachId: string): Promise<CoachClubTag[]> {
  return tournamentCoachTagRepository.listTagsForCoach(coachId);
}

/** PlatformAdminTournamentScreen: platform_admin siembra un torneo con demanda conocida antes de
 * que algún club lo cree — ver decisión #36 en db/schema.sql. */
export async function createUnclaimedTournament(params: {
  name: string;
  venue: string;
  city: string;
  country: CountryCode;
  startDate: string;
  endDate: string;
}): Promise<UnclaimedTournament> {
  return tournamentRepository.createUnclaimed(params);
}

/** ClubTournamentListScreen, sección "Torneos disponibles para reclamar" — mismo país que el
 * club que consulta. */
export async function listUnclaimedTournamentsForClub(clubId: string): Promise<UnclaimedTournament[]> {
  const club = await clubRepository.getById(clubId);
  if (!club.country) return [];
  return tournamentRepository.listUnclaimed(club.country);
}

/** Reclamar un torneo sin club — 404 si no existe, 409 si otro club ya lo reclamó primero
 * (condición de carrera resuelta por el WHERE club_id IS NULL de tournamentRepository.claim). */
export async function claimTournamentForClub(tournamentId: string, clubId: string): Promise<void> {
  const claimed = await tournamentRepository.claim(tournamentId, clubId);
  if (claimed) return;

  // El UPDATE no afectó filas: o el torneo no existe (404, la llamada de abajo lo confirma
  // lanzando NotFoundError) o existe pero ya tiene club_id (409, alguien más lo reclamó primero).
  await tournamentRepository.getTournamentCommissionInfo(tournamentId);
  throw new ConflictError('Este torneo ya fue reclamado por otro club/federación', 'already_claimed');
}
