import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { NotFoundError } from '../lib/errors.js';
import type { AdminAccountSummary, PublicUser, UserRole } from '../types.js';

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
    phone: row.phone,
    primaryRole: row.primary_role,
    passwordHash: row.password_hash,
    emailVerifiedAt: row.email_verified_at,
    disabledAt: row.disabled_at,
    disabledReason: row.disabled_reason,
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

/** notificationService.notifyRoleByEmail — platform_admin no es 1:1 (se puede promover a más de
 * una cuenta, ver scripts/set-platform-admin.ts), así que "avisarle al admin" en la práctica es
 * avisarle a todos los que tengan ese rol. */
export async function listEmailsByRole(role: UserRole, db: Queryable = pool): Promise<string[]> {
  const { rows } = await db.query(`SELECT email FROM users WHERE primary_role = $1`, [role]);
  return rows.map((r) => r.email);
}

export async function create(
  params: {
    email: string;
    passwordHash: string | null;
    fullName: string;
    primaryRole: UserRole;
    /** true en el alta por Google (el correo ya viene confirmado por Google, ver
     * googleAuthService) — de resto queda sin verificar hasta canjear el código. */
    emailVerified?: boolean;
  },
  db: Queryable = pool,
): Promise<UserRecord> {
  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, full_name, primary_role, email_verified_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [params.email, params.passwordHash, params.fullName, params.primaryRole, params.emailVerified ? new Date() : null],
  );
  return mapRow(rows[0]);
}

/** authService.register llama a esto justo tras crear la cuenta con contraseña — separado de
 * create() para no acoplar emailVerificationService (que manda el correo) con el INSERT. */
export async function markEmailVerified(userId: string, db: Queryable = pool): Promise<void> {
  await db.query(`UPDATE users SET email_verified_at = now(), updated_at = now() WHERE id = $1`, [userId]);
}

/** PUT /auth/me/email — corregir un correo mal escrito (ver decisión #48) o cambiarlo por otro
 * motivo. Vuelve a poner email_verified_at en NULL: cambiar el correo invalida la verificación
 * anterior, el nuevo correo no está confirmado todavía. */
export async function updateEmail(userId: string, email: string, db: Queryable = pool): Promise<UserRecord> {
  const { rows } = await db.query(
    `UPDATE users SET email = $2, email_verified_at = NULL, updated_at = now() WHERE id = $1 RETURNING *`,
    [userId, email],
  );
  if (rows.length === 0) throw new NotFoundError('User', userId);
  return mapRow(rows[0]);
}

export async function updatePasswordHash(userId: string, passwordHash: string, db: Queryable = pool): Promise<void> {
  await db.query(`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, [userId, passwordHash]);
}

/** ParentProfileScreen "Editar perfil" — nombre y teléfono son los únicos campos de perfil
 * editables por el propio usuario; email/contraseña quedan fuera (van por flujos aparte:
 * cambiar el correo necesitaría reverificación, y la contraseña ya tiene su propio flujo vía
 * password_reset_tokens). phone ya existía en la tabla pero nunca se exponía al cliente. */
export async function update(
  userId: string,
  params: { fullName: string; phone: string | null },
  db: Queryable = pool,
): Promise<UserRecord> {
  const { rows } = await db.query(
    `UPDATE users SET full_name = $2, phone = $3, updated_at = now() WHERE id = $1 RETURNING *`,
    [userId, params.fullName, params.phone],
  );
  if (rows.length === 0) throw new NotFoundError('User', userId);
  return mapRow(rows[0]);
}

/** PlatformAdminAccountsScreen (decisión #51): deshabilita la cuenta de un coach o padre/madre —
 * reversible (ver enable), no un borrado. Motivo obligatorio (lo valida la capa de arriba, acá
 * solo se persiste) para que quede un rastro de por qué se actuó. */
export async function disable(
  userId: string,
  params: { disabledBy: string; reason: string },
  db: Queryable = pool,
): Promise<UserRecord> {
  const { rows } = await db.query(
    `UPDATE users SET disabled_at = now(), disabled_by = $2, disabled_reason = $3, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [userId, params.disabledBy, params.reason],
  );
  if (rows.length === 0) throw new NotFoundError('User', userId);
  return mapRow(rows[0]);
}

export async function enable(userId: string, db: Queryable = pool): Promise<UserRecord> {
  const { rows } = await db.query(
    `UPDATE users SET disabled_at = NULL, disabled_by = NULL, disabled_reason = NULL, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [userId],
  );
  if (rows.length === 0) throw new NotFoundError('User', userId);
  return mapRow(rows[0]);
}

/** PlatformAdminAccountsScreen, pestaña "Padres" — a diferencia de listCoachesForAdmin
 * (adminAccountService), acá no hace falta ningún JOIN: un padre no tiene perfil aparte. */
export async function listByRole(
  role: UserRole,
  search: string | undefined,
  db: Queryable = pool,
): Promise<AdminAccountSummary[]> {
  const conditions = [`primary_role = $1`];
  const values: unknown[] = [role];
  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(full_name ILIKE $${values.length} OR email ILIKE $${values.length})`);
  }
  const { rows } = await db.query(
    `SELECT id, full_name, email, created_at, disabled_at, disabled_reason FROM users
     WHERE ${conditions.join(' AND ')}
     ORDER BY full_name
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
  }));
}
