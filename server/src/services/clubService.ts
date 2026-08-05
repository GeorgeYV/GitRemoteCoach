import * as clubRepository from '../repositories/clubRepository.js';
import * as settlementRepository from '../repositories/settlementRepository.js';
import * as tournamentRepository from '../repositories/tournamentRepository.js';
import type { Club, ClubSettlementWithTournamentName, TournamentSummary } from '../types.js';

export async function getClub(clubId: string): Promise<Club> {
  return clubRepository.getById(clubId);
}

export async function listSettlementsForClub(clubId: string): Promise<ClubSettlementWithTournamentName[]> {
  return settlementRepository.listByClub(clubId);
}

export async function listTournamentsForClub(clubId: string): Promise<TournamentSummary[]> {
  return tournamentRepository.listByClub(clubId);
}
