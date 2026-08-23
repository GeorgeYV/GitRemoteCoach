import * as playerRepository from '../repositories/playerRepository.js';
import type { AgeCategory, CountryCode, Player } from '../types.js';

export async function listPlayersForGuardian(
  guardianUserId: string,
  options: { activeOnly?: boolean } = {},
): Promise<Player[]> {
  return playerRepository.listForGuardian(guardianUserId, options);
}

export async function setPlayerActive(playerId: string, active: boolean): Promise<Player> {
  return playerRepository.setActive(playerId, active);
}

export async function registerPlayer(
  guardianUserId: string,
  params: { fullName: string; birthDate: string; ageCategory: AgeCategory; country: CountryCode },
): Promise<Player> {
  return playerRepository.create(guardianUserId, params);
}

export async function updatePlayer(
  playerId: string,
  params: { fullName: string; birthDate: string; ageCategory: AgeCategory; country: CountryCode },
): Promise<Player> {
  return playerRepository.update(playerId, params);
}
