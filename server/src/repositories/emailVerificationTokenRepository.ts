import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';

type Queryable = Pool | PoolClient;

/** Espejo de passwordResetTokenRepository.ts — ver decisión #48 en db/schema.sql. */
export interface EmailVerificationTokenRecord {
  id: string;
  userId: string;
  codeHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  attempts: number;
}

function mapRow(row: any): EmailVerificationTokenRecord {
  return {
    id: row.id,
    userId: row.user_id,
    codeHash: row.code_hash,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    attempts: row.attempts,
  };
}

export async function create(
  params: { userId: string; codeHash: string; expiresAt: Date },
  db: Queryable = pool,
): Promise<EmailVerificationTokenRecord> {
  const { rows } = await db.query(
    `INSERT INTO email_verification_tokens (user_id, code_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [params.userId, params.codeHash, params.expiresAt],
  );
  return mapRow(rows[0]);
}

export async function findLatestActiveByUserId(
  userId: string,
  db: Queryable = pool,
): Promise<EmailVerificationTokenRecord | null> {
  const { rows } = await db.query(
    `SELECT * FROM email_verification_tokens
     WHERE user_id = $1 AND used_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId],
  );
  return rows.length > 0 ? mapRow(rows[0]) : null;
}

export async function incrementAttempts(id: string, db: Queryable = pool): Promise<number> {
  const { rows } = await db.query(
    `UPDATE email_verification_tokens SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts`,
    [id],
  );
  return rows[0].attempts;
}

export async function markUsed(id: string, db: Queryable = pool): Promise<void> {
  await db.query(`UPDATE email_verification_tokens SET used_at = now() WHERE id = $1`, [id]);
}
