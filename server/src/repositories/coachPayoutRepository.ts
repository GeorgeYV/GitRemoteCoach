import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import type { CoachPayout, CoachPayoutWithNames } from '../types.js';

type Queryable = Pool | PoolClient;

function mapRow(row: any): CoachPayout {
  return {
    id: row.id,
    coachId: row.coach_id,
    tournamentId: row.tournament_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    totalNetAmount: row.total_net_amount,
    status: row.status,
    createdAt: row.created_at,
    paidAt: row.paid_at,
  };
}

function mapRowWithNames(row: any): CoachPayoutWithNames {
  return { ...mapRow(row), coachName: row.coach_name, tournamentName: row.tournament_name };
}

/** PlatformAdminPayoutsScreen: todos los entrenadores (a diferencia de settlementRepository.listByClub,
 * que ya está scoped a un club) — nombre de entrenador y de torneo vienen de JOINs. */
export async function listAll(db: Queryable = pool): Promise<CoachPayoutWithNames[]> {
  const { rows } = await db.query(
    `SELECT p.*, u.full_name AS coach_name, t.name AS tournament_name
     FROM coach_payouts p
     JOIN users u ON u.id = p.coach_id
     JOIN tournaments t ON t.id = p.tournament_id
     ORDER BY p.created_at DESC`,
  );
  return rows.map(mapRowWithNames);
}

export async function createCoachPayout(
  params: {
    coachId: string;
    tournamentId: string;
    periodStart: string;
    periodEnd: string;
    totalNetAmount: number;
  },
  client: PoolClient,
): Promise<CoachPayout> {
  const { rows } = await client.query(
    `INSERT INTO coach_payouts (coach_id, tournament_id, period_start, period_end, total_net_amount, status, paid_at)
     VALUES ($1, $2, $3, $4, $5, 'paid', now())
     RETURNING *`,
    [params.coachId, params.tournamentId, params.periodStart, params.periodEnd, params.totalNetAmount],
  );
  return mapRow(rows[0]);
}
