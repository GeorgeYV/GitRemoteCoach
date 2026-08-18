import * as playerRepository from '../repositories/playerRepository.js';
import type { AgeCategory, CountryCode, Player } from '../types.js';

export async function listPlayersForGuardian(guardianUserId: string): Promise<Player[]> {
  return playerRepository.listForGuardian(guardianUserId);
}

export async function registerPlayer(
  guardianUserId: string,
  params: { fullName: string; birthDate: string; ageCategory: AgeCategory; country: CountryCode },
): Promise<Player> {
  return playerRepository.create(guardianUserId, params);
}
