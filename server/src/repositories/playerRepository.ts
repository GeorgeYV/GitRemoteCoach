import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import type { AgeCategory, Player } from '../types.js';

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

/** PlayerRegistrationScreen: crea al hijo/a del padre logueado. */
export async function create(
  guardianUserId: string,
  params: { fullName: string; birthDate: string; ageCategory: AgeCategory },
  db: Queryable = pool,
): Promise<Player> {
  const { rows } = await db.query(
    `INSERT INTO players (guardian_user_id, full_name, birth_date, age_category)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [guardianUserId, params.fullName, params.birthDate, params.ageCategory],
  );
  return mapPlayerRow(rows[0]);
}
