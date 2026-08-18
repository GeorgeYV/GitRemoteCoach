import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import type { CoachTournamentAvailability, CoachTournamentRate, RateMode } from '../types.js';

type Queryable = Pool | PoolClient;

// pg devuelve TIME como 'HH:MM:SS' (sin timezone) — recortarlo a 'HH:MM' para que coincida con
// el formato que espera el cliente (y el que se envía al guardar).
function toHHMM(value: string | null): string | null {
  return value ? value.slice(0, 5) : null;
}

function mapAvailabilityRow(row: any): CoachTournamentAvailability {
  return {
    id: row.id,
    coachId: row.coach_id,
    tournamentId: row.tournament_id,
    slotDate: row.slot_date,
    available: row.available,
    unavailableFrom: toHHMM(row.unavailable_from),
    unavailableTo: toHHMM(row.unavailable_to),
    updatedAt: row.updated_at,
  };
}

/** Alta o actualización de la disponibilidad de un día puntual (CoachAvailabilityScreen). */
export async function upsertAvailabilityDay(
  params: {
    coachId: string;
    tournamentId: string;
    slotDate: string;
    available: boolean;
    unavailableFrom: string | null;
    unavailableTo: string | null;
  },
  db: Queryable = pool,
): Promise<CoachTournamentAvailability> {
  const { rows } = await db.query(
    `INSERT INTO coach_tournament_availability
       (coach_id, tournament_id, slot_date, available, unavailable_from, unavailable_to)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (coach_id, tournament_id, slot_date)
     DO UPDATE SET available = $4, unavailable_from = $5, unavailable_to = $6, updated_at = now()
     RETURNING *`,
    [params.coachId, params.tournamentId, params.slotDate, params.available, params.unavailableFrom, params.unavailableTo],
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
    approachDescription: row.approach_description,
    updatedAt: row.updated_at,
  };
}

/** Alta o actualización de la tarifa de catálogo del entrenador para un torneo (misma pantalla que la disponibilidad). */
export async function upsertRate(
  params: {
    coachId: string;
    tournamentId: string;
    rateMode: RateMode;
    amount: number;
    approachDescription: string | null;
  },
  db: Queryable = pool,
): Promise<CoachTournamentRate> {
  const { rows } = await db.query(
    `INSERT INTO coach_tournament_rates (coach_id, tournament_id, rate_mode, amount, approach_description)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (coach_id, tournament_id)
     DO UPDATE SET rate_mode = $3, amount = $4, approach_description = $5, updated_at = now()
     RETURNING *`,
    [params.coachId, params.tournamentId, params.rateMode, params.amount, params.approachDescription],
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
