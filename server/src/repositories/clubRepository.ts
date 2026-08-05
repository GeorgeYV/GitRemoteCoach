import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { NotFoundError } from '../lib/errors.js';
import type { Club } from '../types.js';

type Queryable = Pool | PoolClient;

function mapRow(row: any): Club {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    city: row.city,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    defaultCommissionRate: row.default_commission_rate,
    createdAt: row.created_at,
  };
}

/** ClubHomeScreen: perfil del club. */
export async function getById(clubId: string, db: Queryable = pool): Promise<Club> {
  const { rows } = await db.query(`SELECT * FROM clubs WHERE id = $1`, [clubId]);
  if (rows.length === 0) throw new NotFoundError('Club', clubId);
  return mapRow(rows[0]);
}
