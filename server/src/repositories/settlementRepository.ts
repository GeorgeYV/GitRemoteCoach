import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import type { ClubSettlement, ClubSettlementWithTournamentName } from '../types.js';

type Queryable = Pool | PoolClient;

function mapRow(row: any): ClubSettlement {
  return {
    id: row.id,
    clubId: row.club_id,
    tournamentId: row.tournament_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    totalCommissionAmount: row.total_commission_amount,
    status: row.status,
    paymentReference: row.payment_reference,
    createdAt: row.created_at,
    paidAt: row.paid_at,
  };
}

function mapRowWithTournamentName(row: any): ClubSettlementWithTournamentName {
  return { ...mapRow(row), tournamentName: row.tournament_name };
}

/** ClubSettlementsScreen: nombre de torneo viene de un JOIN, para no mostrar solo UUIDs. */
export async function listByClub(clubId: string, db: Queryable = pool): Promise<ClubSettlementWithTournamentName[]> {
  const { rows } = await db.query(
    `SELECT s.*, t.name AS tournament_name
     FROM club_settlements s
     JOIN tournaments t ON t.id = s.tournament_id
     WHERE s.club_id = $1
     ORDER BY s.created_at DESC`,
    [clubId],
  );
  return rows.map(mapRowWithTournamentName);
}

export async function createSettlement(
  params: {
    clubId: string;
    tournamentId: string;
    periodStart: string;
    periodEnd: string;
    totalCommissionAmount: number;
  },
  client: PoolClient,
): Promise<ClubSettlement> {
  const { rows } = await client.query(
    `INSERT INTO club_settlements (club_id, tournament_id, period_start, period_end, total_commission_amount, status, paid_at)
     VALUES ($1, $2, $3, $4, $5, 'paid', now())
     RETURNING *`,
    [params.clubId, params.tournamentId, params.periodStart, params.periodEnd, params.totalCommissionAmount],
  );
  return mapRow(rows[0]);
}
