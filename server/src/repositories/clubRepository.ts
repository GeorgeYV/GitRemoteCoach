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

/** El sentido inverso de club_admins (club_id, user_id): qué club administra este usuario.
 * Un usuario podría administrar más de un club (sin UNIQUE sobre user_id solo), pero la app
 * hoy solo muestra uno — igual que ya simplifica mock/clubFlow.ts. */
export async function getClubIdForAdminUser(userId: string, db: Queryable = pool): Promise<string> {
  const { rows } = await db.query(`SELECT club_id FROM club_admins WHERE user_id = $1 LIMIT 1`, [userId]);
  if (rows.length === 0) throw new NotFoundError('ClubAdmin', userId);
  return rows[0].club_id;
}
