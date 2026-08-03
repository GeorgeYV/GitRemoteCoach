import { withTransaction } from '../lib/db.js';
import * as coachTournamentRepository from '../repositories/coachTournamentRepository.js';
import type { CoachTournamentAvailability, CoachTournamentRate, RateMode } from '../types.js';

export interface AvailabilityAndRate {
  availability: CoachTournamentAvailability[];
  rate: CoachTournamentRate | null;
}

/** Hidrata CoachAvailabilityScreen al reabrirla: días marcados + tarifa ya guardada, si existen. */
export async function getAvailabilityAndRate(coachId: string, tournamentId: string): Promise<AvailabilityAndRate> {
  const [availability, rate] = await Promise.all([
    coachTournamentRepository.listAvailabilityForCoachTournament(coachId, tournamentId),
    coachTournamentRepository.getRateForCoachTournament(coachId, tournamentId),
  ]);
  return { availability, rate };
}

/** CoachAvailabilityScreen guarda todos los días de una vez con un solo botón "Guardar disponibilidad". */
export async function setAvailability(
  coachId: string,
  tournamentId: string,
  days: Array<{ slotDate: string; morning: boolean; afternoon: boolean }>,
): Promise<CoachTournamentAvailability[]> {
  return withTransaction(async (client) => {
    const saved: CoachTournamentAvailability[] = [];
    for (const day of days) {
      saved.push(await coachTournamentRepository.upsertAvailabilityDay({ coachId, tournamentId, ...day }, client));
    }
    return saved;
  });
}

export async function setRate(
  coachId: string,
  tournamentId: string,
  params: { rateMode: RateMode; amount: number },
): Promise<CoachTournamentRate> {
  return coachTournamentRepository.upsertRate({ coachId, tournamentId, ...params });
}
