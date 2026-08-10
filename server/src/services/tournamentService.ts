import * as clubInvitationRepository from '../repositories/clubInvitationRepository.js';
import * as tournamentCoachTagRepository from '../repositories/tournamentCoachTagRepository.js';
import * as tournamentRepository from '../repositories/tournamentRepository.js';
import type {
  ClubCoachInvitationWithCoachName,
  CoachClubTag,
  TournamentCoachTagWithProfile,
  TournamentSearchResult,
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

/** CoachTournamentSearchScreen: torneos activos en los que un entrenador podría ofrecerse. */
export async function searchTournaments(query?: string): Promise<TournamentSearchResult[]> {
  return tournamentRepository.search({ query });
}

/** CoachAvailabilityScreen, CoachTournamentSearchScreen, CoachReputationScreen: insignias de
 * "entrenador oficial" del propio entrenador, en todos los torneos donde un club lo etiquetó. */
export async function listClubTagsForCoach(coachId: string): Promise<CoachClubTag[]> {
  return tournamentCoachTagRepository.listTagsForCoach(coachId);
}
