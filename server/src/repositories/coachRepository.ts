import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import type { AgeCategory, CoachProfile, CoachSearchResult, PlayingLevel } from '../types.js';

type Queryable = Pool | PoolClient;

const UNIQUE_VIOLATION = '23505';

function mapSearchRow(row: any): CoachSearchResult {
  return {
    id: row.user_id,
    name: row.name,
    city: row.city,
    ratingAvg: row.rating_avg,
    yearsExperience: row.years_experience,
    specialty: row.specialty,
  };
}

/**
 * ClubInviteCoachScreen: entrenadores aprobados que coinciden con el texto de búsqueda
 * (nombre o ciudad), excluyendo a quienes ya son oficiales o ya tienen invitación
 * pendiente en el torneo indicado. Ambos filtros de exclusión reutilizan el mismo
 * placeholder — es el mismo tournamentId en las dos mitades del UNION.
 */
export async function search(
  params: { query?: string; excludeTournamentId?: string },
  db: Queryable = pool,
): Promise<CoachSearchResult[]> {
  const conditions: string[] = [`cp.verification_status = 'approved'`];
  const values: unknown[] = [];

  if (params.query) {
    values.push(`%${params.query}%`);
    conditions.push(`(u.full_name ILIKE $${values.length} OR cp.city ILIKE $${values.length})`);
  }

  if (params.excludeTournamentId) {
    values.push(params.excludeTournamentId);
    conditions.push(
      `cp.user_id NOT IN (
         SELECT coach_id FROM tournament_coach_tags WHERE tournament_id = $${values.length}
         UNION
         SELECT coach_id FROM club_coach_invitations WHERE tournament_id = $${values.length} AND status = 'pending'
       )`,
    );
  }

  const { rows } = await db.query(
    `SELECT cp.user_id, u.full_name AS name, cp.city, cp.rating_avg, cp.years_experience, cp.specialty
     FROM coach_profiles cp
     JOIN users u ON u.id = cp.user_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY u.full_name
     LIMIT 25`,
    values,
  );
  return rows.map(mapSearchRow);
}

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

function mapCoachProfileRow(row: any): CoachProfile {
  return {
    userId: row.user_id,
    fullName: row.full_name,
    city: row.city,
    region: row.region,
    photoUrl: row.photo_url,
    yearsExperience: row.years_experience,
    specialty: row.specialty,
    hourlyRate: row.hourly_rate,
    verificationStatus: row.verification_status,
    ratingAvg: row.rating_avg,
    ratingCount: row.rating_count,
    bio: row.bio,
    stripeConnectedAccountId: row.stripe_connected_account_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** CoachRegistrationScreen: crea la fila coach_profiles del usuario recién registrado. */
export async function create(
  userId: string,
  params: { city: string; region: string | null; yearsExperience: number; specialty: string | null; hourlyRate: number },
  db: Queryable = pool,
): Promise<CoachProfile> {
  try {
    await db.query(
      `INSERT INTO coach_profiles (user_id, city, region, years_experience, specialty, hourly_rate)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, params.city, params.region, params.yearsExperience, params.specialty, params.hourlyRate],
    );
  } catch (err: any) {
    // user_id es la PK de coach_profiles — un segundo POST /coaches para el mismo usuario cae acá.
    if (err.code === UNIQUE_VIOLATION) {
      throw new ConflictError('Ya existe un perfil de entrenador para este usuario', 'coach_profile_exists');
    }
    throw err;
  }
  // Reutiliza el JOIN con users de getCoachProfile en vez de duplicar el mapeo de columnas.
  return getCoachProfile(userId, db);
}

export async function getCoachProfile(coachId: string, db: Queryable = pool): Promise<CoachProfile> {
  const { rows } = await db.query(
    `SELECT cp.*, u.full_name
     FROM coach_profiles cp
     JOIN users u ON u.id = cp.user_id
     WHERE cp.user_id = $1`,
    [coachId],
  );
  if (rows.length === 0) throw new NotFoundError('CoachProfile', coachId);
  return mapCoachProfileRow(rows[0]);
}

/**
 * Recalcula coach_profiles.rating_avg/rating_count desde la tabla reviews.
 * Espeja recalculate_coach_rating() en db/schema.sql — se llama explícitamente
 * desde reviewService en vez de depender solo del trigger, porque el pool de
 * pruebas (pg-mem) no ejecuta funciones PL/pgSQL (ver server/test/setupDb.ts).
 */
export async function recalculateRating(coachId: string, db: Queryable = pool): Promise<void> {
  // Sin ROUND(): rating_avg es NUMERIC(3,2), la columna ya redondea a 2
  // decimales al asignar. ROUND(numeric, integer) no es una función que
  // pg-mem implemente (ver server/test/setupDb.ts), así que evitarlo aquí
  // mantiene el smoke test funcionando sin cambiar el resultado en Postgres real.
  await db.query(
    `UPDATE coach_profiles
     SET rating_avg = COALESCE((SELECT AVG(rating)::numeric FROM reviews WHERE coach_id = $1), 0),
         rating_count = (SELECT COUNT(*) FROM reviews WHERE coach_id = $1),
         updated_at = now()
     WHERE user_id = $1`,
    [coachId],
  );
}

/** Reemplaza por completo las categorías de edad del entrenador (selección múltiple en CoachRegistrationScreen). */
export async function setCoachAgeCategories(
  coachId: string,
  ageCategories: AgeCategory[],
  db: Queryable = pool,
): Promise<void> {
  await db.query(`DELETE FROM coach_age_categories WHERE coach_id = $1`, [coachId]);
  if (ageCategories.length === 0) return;
  const values = ageCategories.map((_, i) => `($1, $${i + 2})`).join(', ');
  await db.query(`INSERT INTO coach_age_categories (coach_id, age_category) VALUES ${values}`, [
    coachId,
    ...ageCategories,
  ]);
}

export async function getCoachAgeCategories(coachId: string, db: Queryable = pool): Promise<AgeCategory[]> {
  const { rows } = await db.query(`SELECT age_category FROM coach_age_categories WHERE coach_id = $1`, [coachId]);
  return rows.map((r: any) => r.age_category);
}

/** Reemplaza por completo los niveles de juego del entrenador (misma pantalla que las categorías de edad). */
export async function setCoachLevels(coachId: string, levels: PlayingLevel[], db: Queryable = pool): Promise<void> {
  await db.query(`DELETE FROM coach_levels WHERE coach_id = $1`, [coachId]);
  if (levels.length === 0) return;
  const values = levels.map((_, i) => `($1, $${i + 2})`).join(', ');
  await db.query(`INSERT INTO coach_levels (coach_id, level) VALUES ${values}`, [coachId, ...levels]);
}

export async function getCoachLevels(coachId: string, db: Queryable = pool): Promise<PlayingLevel[]> {
  const { rows } = await db.query(`SELECT level FROM coach_levels WHERE coach_id = $1`, [coachId]);
  return rows.map((r: any) => r.level);
}
