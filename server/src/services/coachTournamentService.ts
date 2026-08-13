import { withTransaction } from '../lib/db.js';
import * as bookingRepository from '../repositories/bookingRepository.js';
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
  days: Array<{ slotDate: string; available: boolean }>,
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

/** TrainerProfileScreen: reemplaza el detalle de "estadísticas de partidos" por algo con más
 * valor para un padre decidiendo con quién reservar — cuántos jugadores ya lo reservaron para
 * este torneo en concreto. */
export async function getBookedPlayersCount(coachId: string, tournamentId: string): Promise<number> {
  return bookingRepository.countActivePlayersForCoachTournament(coachId, tournamentId);
}

/** TrainerListScreen: ahora que un coach puede aceptar varios alumnos el mismo torneo/día, el
 * padre necesita ver quiénes ya reservaron con cada entrenador antes de elegir uno — no solo el
 * conteo agregado que ya usa TrainerProfileScreen. */
export async function getBookedPlayers(coachId: string, tournamentId: string) {
  return bookingRepository.listActivePlayersForCoachTournament(coachId, tournamentId);
}
