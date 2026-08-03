import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import type { CoachTournamentAvailability, CoachTournamentRate, RateMode } from '../types.js';

type Queryable = Pool | PoolClient;

function mapAvailabilityRow(row: any): CoachTournamentAvailability {
  return {
    id: row.id,
    coachId: row.coach_id,
    tournamentId: row.tournament_id,
    slotDate: row.slot_date,
    morning: row.morning,
    afternoon: row.afternoon,
    updatedAt: row.updated_at,
  };
}

/** Alta o actualización de la disponibilidad de un día puntual (CoachAvailabilityScreen). */
export async function upsertAvailabilityDay(
  params: { coachId: string; tournamentId: string; slotDate: string; morning: boolean; afternoon: boolean },
  db: Queryable = pool,
): Promise<CoachTournamentAvailability> {
  const { rows } = await db.query(
    `INSERT INTO coach_tournament_availability (coach_id, tournament_id, slot_date, morning, afternoon)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (coach_id, tournament_id, slot_date)
     DO UPDATE SET morning = $4, afternoon = $5, updated_at = now()
     RETURNING *`,
    [params.coachId, params.tournamentId, params.slotDate, params.morning, params.afternoon],
  );
  return mapAvailabilityRow(rows[0]);
}

export async function listAvailabilityForCoachTournament(
  coachId: string,
  tournamentId: string,
  db: Queryable = pool,
): Promise<CoachTournamentAvailability[]> {
  const { rows } = await db.query(
    `SELECT * FROM coach_tournament_availability
     WHERE coach_id = $1 AND tournament_id = $2
     ORDER BY slot_date ASC`,
    [coachId, tournamentId],
  );
  return rows.map(mapAvailabilityRow);
}

function mapRateRow(row: any): CoachTournamentRate {
  return {
    coachId: row.coach_id,
    tournamentId: row.tournament_id,
    rateMode: row.rate_mode,
    amount: row.amount,
    updatedAt: row.updated_at,
  };
}

/** Alta o actualización de la tarifa de catálogo del entrenador para un torneo (misma pantalla que la disponibilidad). */
export async function upsertRate(
  params: { coachId: string; tournamentId: string; rateMode: RateMode; amount: number },
  db: Queryable = pool,
): Promise<CoachTournamentRate> {
  const { rows } = await db.query(
    `INSERT INTO coach_tournament_rates (coach_id, tournament_id, rate_mode, amount)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (coach_id, tournament_id)
     DO UPDATE SET rate_mode = $3, amount = $4, updated_at = now()
     RETURNING *`,
    [params.coachId, params.tournamentId, params.rateMode, params.amount],
  );
  return mapRateRow(rows[0]);
}

export async function getRateForCoachTournament(
  coachId: string,
  tournamentId: string,
  db: Queryable = pool,
): Promise<CoachTournamentRate | null> {
  const { rows } = await db.query(
    `SELECT * FROM coach_tournament_rates WHERE coach_id = $1 AND tournament_id = $2`,
    [coachId, tournamentId],
  );
  return rows.length > 0 ? mapRateRow(rows[0]) : null;
}
