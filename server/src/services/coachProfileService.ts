import { withTransaction } from '../lib/db.js';
import * as coachRepository from '../repositories/coachRepository.js';
import type { AgeCategory, CoachProfile, CoachSearchResult, PlayingLevel } from '../types.js';

export interface CoachProfileWithTraining {
  profile: CoachProfile;
  ageCategories: AgeCategory[];
  levels: PlayingLevel[];
}

export async function searchCoaches(params: {
  query?: string;
  excludeTournamentId?: string;
}): Promise<CoachSearchResult[]> {
  return coachRepository.search(params);
}

export async function getCoachProfile(coachId: string): Promise<CoachProfileWithTraining> {
  const [profile, ageCategories, levels] = await Promise.all([
    coachRepository.getCoachProfile(coachId),
    coachRepository.getCoachAgeCategories(coachId),
    coachRepository.getCoachLevels(coachId),
  ]);
  return { profile, ageCategories, levels };
}

/**
 * CoachRegistrationScreen guarda categorías de edad y niveles de juego
 * juntos (un solo botón "Enviar para verificación"); se hacen atómicos para
 * no dejar uno sin el otro si algo falla a la mitad.
 */
export async function updateCoachTraining(
  coachId: string,
  params: { ageCategories: AgeCategory[]; levels: PlayingLevel[] },
): Promise<CoachProfileWithTraining> {
  return withTransaction(async (client) => {
    await coachRepository.setCoachAgeCategories(coachId, params.ageCategories, client);
    await coachRepository.setCoachLevels(coachId, params.levels, client);
    const profile = await coachRepository.getCoachProfile(coachId, client);
    return { profile, ageCategories: params.ageCategories, levels: params.levels };
  });
}
