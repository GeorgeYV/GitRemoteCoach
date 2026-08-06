import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';

type Queryable = Pool | PoolClient;

export async function upsert(userId: string, expoPushToken: string, db: Queryable = pool): Promise<void> {
  await db.query(
    `INSERT INTO push_tokens (user_id, expo_push_token)
     VALUES ($1, $2)
     ON CONFLICT (expo_push_token) DO UPDATE SET user_id = $1, updated_at = now()`,
    [userId, expoPushToken],
  );
}

export async function listTokensForUser(userId: string, db: Queryable = pool): Promise<string[]> {
  const { rows } = await db.query(`SELECT expo_push_token FROM push_tokens WHERE user_id = $1`, [userId]);
  return rows.map((r: any) => r.expo_push_token);
}

export async function deleteToken(expoPushToken: string, db: Queryable = pool): Promise<void> {
  await db.query(`DELETE FROM push_tokens WHERE expo_push_token = $1`, [expoPushToken]);
}
