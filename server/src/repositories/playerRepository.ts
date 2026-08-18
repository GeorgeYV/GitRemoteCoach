import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { NotFoundError } from '../lib/errors.js';
import type { AgeCategory, CountryCode, Player } from '../types.js';

type Queryable = Pool | PoolClient;

/**
 * pg devuelve un objeto Date para columnas DATE (no hay setTypeParser registrado en
 * lib/db.ts) — normalizar acá a 'YYYY-MM-DD' evita repetir el bug ya encontrado con
 * coach_tournament_availability.slot_date (serializado como datetime ISO completo).
 */
function mapPlayerRow(row: any): Player {
  return {
    id: row.id,
    guardianUserId: row.guardian_user_id,
    fullName: row.full_name,
    birthDate: row.birth_date.toISOString().slice(0, 10),
    ageCategory: row.age_category,
    country: row.country,
    createdAt: row.created_at,
  };
}

/** BookingConfirmScreen: hijos/as ya registrados por el padre logueado. */
export async function listForGuardian(guardianUserId: string, db: Queryable = pool): Promise<Player[]> {
  const { rows } = await db.query(
    `SELECT * FROM players WHERE guardian_user_id = $1 ORDER BY created_at`,
    [guardianUserId],
  );
  return rows.map(mapPlayerRow);
}

/** POST /bookings y PUT /players/:id: verifica que el playerId pertenezca al padre de la sesión. */
export async function getById(playerId: string, db: Queryable = pool): Promise<Player> {
  const { rows } = await db.query(`SELECT * FROM players WHERE id = $1`, [playerId]);
  if (rows.length === 0) throw new NotFoundError('Player', playerId);
  return mapPlayerRow(rows[0]);
}

/** PlayerRegistrationScreen: crea al hijo/a del padre logueado. */
export async function create(
  guardianUserId: string,
  params: { fullName: string; birthDate: string; ageCategory: AgeCategory; country: CountryCode },
  db: Queryable = pool,
): Promise<Player> {
  const { rows } = await db.query(
    `INSERT INTO players (guardian_user_id, full_name, birth_date, age_category, country)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [guardianUserId, params.fullName, params.birthDate, params.ageCategory, params.country],
  );
  return mapPlayerRow(rows[0]);
}

/** ParentProfileScreen "Editar jugador" — la pertenencia ya se verificó en la ruta (getById +
 * comparar guardianUserId) antes de llegar acá. */
export async function update(
  playerId: string,
  params: { fullName: string; birthDate: string; ageCategory: AgeCategory; country: CountryCode },
  db: Queryable = pool,
): Promise<Player> {
  const { rows } = await db.query(
    `UPDATE players SET full_name = $2, birth_date = $3, age_category = $4, country = $5
     WHERE id = $1
     RETURNING *`,
    [playerId, params.fullName, params.birthDate, params.ageCategory, params.country],
  );
  if (rows.length === 0) throw new NotFoundError('Player', playerId);
  return mapPlayerRow(rows[0]);
}
