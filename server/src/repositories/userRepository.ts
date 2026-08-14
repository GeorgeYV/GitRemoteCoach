import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { NotFoundError } from '../lib/errors.js';
import type { PublicUser, UserRole } from '../types.js';

type Queryable = Pool | PoolClient;

export interface UserRecord extends PublicUser {
  /** NULL en cuentas creadas solo por Google (ver decisión #32 en db/schema.sql). */
  passwordHash: string | null;
}

function mapRow(row: any): UserRecord {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    primaryRole: row.primary_role,
    passwordHash: row.password_hash,
  };
}

export async function findByEmail(email: string, db: Queryable = pool): Promise<UserRecord | null> {
  const { rows } = await db.query(`SELECT * FROM users WHERE email = $1`, [email]);
  return rows.length > 0 ? mapRow(rows[0]) : null;
}

export async function findById(id: string, db: Queryable = pool): Promise<UserRecord> {
  const { rows } = await db.query(`SELECT * FROM users WHERE id = $1`, [id]);
  if (rows.length === 0) throw new NotFoundError('User', id);
  return mapRow(rows[0]);
}

export async function create(
  params: { email: string; passwordHash: string | null; fullName: string; primaryRole: UserRole },
  db: Queryable = pool,
): Promise<UserRecord> {
  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, full_name, primary_role)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [params.email, params.passwordHash, params.fullName, params.primaryRole],
  );
  return mapRow(rows[0]);
}

export async function updatePasswordHash(userId: string, passwordHash: string, db: Queryable = pool): Promise<void> {
  await db.query(`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, [userId, passwordHash]);
}
