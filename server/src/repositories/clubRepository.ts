import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { NotFoundError } from '../lib/errors.js';
import type { Club, CountryCode } from '../types.js';

type Queryable = Pool | PoolClient;

/** Comisión por defecto para clubes creados vía onboarding — mismo valor que usan todos los
 * clubes de server/test/seed.ts; el club puede pedir que se ajuste manualmente más adelante,
 * no hay pantalla para editarla todavía. */
const DEFAULT_COMMISSION_RATE = 0.1;

function mapRow(row: any): Club {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    city: row.city,
    country: row.country,
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

/** ClubRegistrationScreen: crea el club nuevo. Vincular al admin (club_admins) es
 * responsabilidad del caller — clubService.registerClub llama a esto y a addAdmin dentro
 * de una misma transacción (withTransaction). */
export async function create(
  input: {
    name: string;
    type: 'club' | 'federation';
    city: string;
    country: CountryCode;
    contactEmail: string | null;
    contactPhone: string | null;
  },
  db: Queryable = pool,
): Promise<Club> {
  const { rows } = await db.query(
    `INSERT INTO clubs (name, type, city, country, contact_email, contact_phone, default_commission_rate)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [input.name, input.type, input.city, input.country, input.contactEmail, input.contactPhone, DEFAULT_COMMISSION_RATE],
  );
  return mapRow(rows[0]);
}

export async function addAdmin(clubId: string, userId: string, db: Queryable = pool): Promise<void> {
  await db.query(`INSERT INTO club_admins (club_id, user_id) VALUES ($1, $2)`, [clubId, userId]);
}
