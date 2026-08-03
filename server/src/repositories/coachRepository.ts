import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import type { AgeCategory, CoachProfile, PlayingLevel } from '../types.js';

type Queryable = Pool | PoolClient;

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

export async function getCoachProfile(coachId: string, db: Queryable = pool): Promise<CoachProfile> {
  const { rows } = await db.query(`SELECT * FROM coach_profiles WHERE user_id = $1`, [coachId]);
  if (rows.length === 0) throw new NotFoundError('CoachProfile', coachId);
  return mapCoachProfileRow(rows[0]);
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
