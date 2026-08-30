import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import type { AdminAccountSummary, AgeCategory, CoachProfile, CoachSearchResult, CountryCode, PlayingLevel } from '../types.js';

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
    photoUrl: row.photo_url,
    ...(row.rate_amount != null ? { rateAmount: row.rate_amount, rateMode: row.rate_mode } : {}),
  };
}

/** jobs/recruitCoachesForUncoveredTournaments (decisión #50): todos los aprobados del país del
 * torneo — no solo los ya etiquetados oficiales de un club, porque un coach puede configurar
 * disponibilidad/tarifa de cualquier torneo por su cuenta, sin invitación (ver
 * coach_tournament_rates/availability, que solo validan assertOwnsCoachId). */
export async function listApprovedEmailsByCountry(country: CountryCode, db: Queryable = pool): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT u.email FROM coach_profiles cp JOIN users u ON u.id = cp.user_id
     WHERE cp.verification_status = 'approved' AND cp.country = $1`,
    [country],
  );
  return rows.map((r) => r.email);
}

/** PlatformAdminAccountsScreen, pestaña "Entrenadores" (decisión #51) — a diferencia de search(),
 * NO filtra por verification_status ni excluye a los ya deshabilitados: el admin necesita ver a
 * todos para poder deshabilitar/habilitar a cualquiera, sin importar su estado. Parte de users (no
 * de coach_profiles) con LEFT JOIN — un coach que se registró pero todavía no completó su perfil
 * (sin fila en coach_profiles todavía) también tiene que poder verse y deshabilitarse. */
export async function listAllForAdmin(search: string | undefined, db: Queryable = pool): Promise<AdminAccountSummary[]> {
  const conditions: string[] = [`u.primary_role = 'coach'`];
  const values: unknown[] = [];
  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(u.full_name ILIKE $${values.length} OR u.email ILIKE $${values.length})`);
  }
  const { rows } = await db.query(
    `SELECT u.id, u.full_name, u.email, u.created_at, u.disabled_at, u.disabled_reason, cp.verification_status
     FROM users u
     LEFT JOIN coach_profiles cp ON cp.user_id = u.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY u.full_name
     LIMIT 100`,
    values,
  );
  return rows.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    email: r.email,
    createdAt: r.created_at,
    disabledAt: r.disabled_at,
    disabledReason: r.disabled_reason,
    coachVerificationStatus: r.verification_status,
  }));
}

/**
 * ClubInviteCoachScreen: entrenadores aprobados que coinciden con el texto de búsqueda
 * (nombre o ciudad), excluyendo a quienes ya son oficiales o ya tienen invitación
 * pendiente en el torneo indicado. Ambos filtros de exclusión reutilizan el mismo
 * placeholder — es el mismo tournamentId en las dos mitades del UNION.
 *
 * TrainerListScreen (padre): usa configuredForTournamentId en vez de excludeTournamentId — un
 * INNER JOIN contra coach_tournament_rates que además filtra la lista a solo quienes ya
 * configuraron ESE torneo (antes traía los ~25 aprobados de toda la plataforma sin relación con
 * el torneo elegido) y de paso trae la tarifa ya cargada, evitando N llamadas extra por coach.
 */
export async function search(
  params: { query?: string; excludeTournamentId?: string; configuredForTournamentId?: string },
  db: Queryable = pool,
): Promise<CoachSearchResult[]> {
  // u.disabled_at IS NULL (decisión #51): un coach deshabilitado sale de toda búsqueda nueva, con
  // el mismo criterio que uno todavía no aprobado — no rompe reservas/torneos ya en curso, que no
  // pasan por acá.
  const conditions: string[] = [`cp.verification_status = 'approved'`, `u.disabled_at IS NULL`];
  const values: unknown[] = [];
  let rateJoin = '';

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

  if (params.configuredForTournamentId) {
    values.push(params.configuredForTournamentId);
    rateJoin = `JOIN coach_tournament_rates ctr ON ctr.coach_id = cp.user_id AND ctr.tournament_id = $${values.length}`;
  }

  const { rows } = await db.query(
    `SELECT cp.user_id, u.full_name AS name, cp.city, cp.rating_avg, cp.years_experience, cp.specialty, cp.photo_url
            ${rateJoin ? ', ctr.amount AS rate_amount, ctr.rate_mode' : ''}
     FROM coach_profiles cp
     JOIN users u ON u.id = cp.user_id
     ${rateJoin}
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
    country: row.country,
    photoUrl: row.photo_url,
    yearsExperience: row.years_experience,
    specialty: row.specialty,
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
  params: {
    city: string;
    region: string | null;
    country: CountryCode;
    yearsExperience: number;
    specialty: string | null;
  },
  db: Queryable = pool,
): Promise<CoachProfile> {
  try {
    await db.query(
      `INSERT INTO coach_profiles (user_id, city, region, country, years_experience, specialty)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, params.city, params.region, params.country, params.yearsExperience, params.specialty],
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

/** CoachRegistrationScreen "Editar perfil" — mismos campos que create, sin tocar
 * verification_status/documentos: esos van por el flujo de verificación aparte. */
export async function update(
  userId: string,
  params: {
    city: string;
    region: string | null;
    country: CountryCode;
    yearsExperience: number;
    specialty: string | null;
  },
  db: Queryable = pool,
): Promise<CoachProfile> {
  await db.query(
    `UPDATE coach_profiles
     SET city = $2, region = $3, country = $4, years_experience = $5, specialty = $6, updated_at = now()
     WHERE user_id = $1`,
    [userId, params.city, params.region, params.country, params.yearsExperience, params.specialty],
  );
  return getCoachProfile(userId, db);
}

/** CoachRegistrationScreen "Agregar foto de perfil" — sube a R2 (ver lib/r2.ts) primero, esto
 * solo guarda la URL resultante. */
export async function updatePhotoUrl(coachId: string, photoUrl: string, db: Queryable = pool): Promise<CoachProfile> {
  await db.query(`UPDATE coach_profiles SET photo_url = $2, updated_at = now() WHERE user_id = $1`, [
    coachId,
    photoUrl,
  ]);
  return getCoachProfile(coachId, db);
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
