import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { ConflictError } from '../lib/errors.js';

type Queryable = Pool | PoolClient;

const UNIQUE_VIOLATION = '23505';

export type OAuthProvider = 'google';

export interface OAuthIdentityRecord {
  id: string;
  userId: string;
  provider: OAuthProvider;
  providerUserId: string;
}

function mapRow(row: any): OAuthIdentityRecord {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    providerUserId: row.provider_user_id,
  };
}

export async function findByProviderAndProviderUserId(
  provider: OAuthProvider,
  providerUserId: string,
  db: Queryable = pool,
): Promise<OAuthIdentityRecord | null> {
  const { rows } = await db.query(
    `SELECT * FROM oauth_identities WHERE provider = $1 AND provider_user_id = $2`,
    [provider, providerUserId],
  );
  return rows.length > 0 ? mapRow(rows[0]) : null;
}

export async function create(
  params: { userId: string; provider: OAuthProvider; providerUserId: string },
  db: Queryable = pool,
): Promise<OAuthIdentityRecord> {
  try {
    const { rows } = await db.query(
      `INSERT INTO oauth_identities (user_id, provider, provider_user_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [params.userId, params.provider, params.providerUserId],
    );
    return mapRow(rows[0]);
  } catch (err: any) {
    if (err.code === UNIQUE_VIOLATION) {
      throw new ConflictError('Esta cuenta de Google ya está vinculada a un usuario', 'oauth_identity_exists');
    }
    throw err;
  }
}
