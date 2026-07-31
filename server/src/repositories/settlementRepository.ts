import type { PoolClient } from 'pg';
import type { ClubSettlement } from '../types.js';

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
