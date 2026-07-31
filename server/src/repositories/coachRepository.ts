import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { ValidationError } from '../lib/errors.js';

type Queryable = Pool | PoolClient;

export interface CoachPayoutInfo {
  userId: string;
  stripeConnectedAccountId: string | null;
}

export async function getCoachPayoutInfo(coachId: string, db: Queryable = pool): Promise<CoachPayoutInfo> {
  const { rows } = await db.query(
    `SELECT user_id, stripe_connected_account_id FROM coach_profiles WHERE user_id = $1`,
    [coachId],
  );
  if (rows.length === 0) throw new ValidationError(`Entrenador ${coachId} no encontrado`);
  return { userId: rows[0].user_id, stripeConnectedAccountId: rows[0].stripe_connected_account_id };
}
