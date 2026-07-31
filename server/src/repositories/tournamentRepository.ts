import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { NotFoundError } from '../lib/errors.js';

type Queryable = Pool | PoolClient;

export interface TournamentCommissionInfo {
  tournamentId: string;
  clubId: string;
  startDate: string;
  endDate: string;
  /** commission_rate_override si existe, si no default_commission_rate del club. */
  clubCommissionRate: number;
}

export async function getTournamentCommissionInfo(
  tournamentId: string,
  db: Queryable = pool,
): Promise<TournamentCommissionInfo> {
  const { rows } = await db.query(
    `SELECT t.id AS tournament_id, t.club_id, t.start_date, t.end_date,
            COALESCE(t.commission_rate_override, c.default_commission_rate) AS club_commission_rate
     FROM tournaments t
     JOIN clubs c ON c.id = t.club_id
     WHERE t.id = $1`,
    [tournamentId],
  );
  if (rows.length === 0) throw new NotFoundError('Tournament', tournamentId);
  return {
    tournamentId: rows[0].tournament_id,
    clubId: rows[0].club_id,
    startDate: rows[0].start_date,
    endDate: rows[0].end_date,
    clubCommissionRate: Number(rows[0].club_commission_rate),
  };
}

export async function findTournamentsEndedWithoutFullSettlement(db: Queryable = pool): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT DISTINCT t.id
     FROM tournaments t
     JOIN bookings b ON b.tournament_id = t.id
     WHERE t.end_date < CURRENT_DATE
       AND b.status = 'completed'
       AND b.club_commission_status = 'generated'`,
  );
  return rows.map((r: any) => r.id);
}
