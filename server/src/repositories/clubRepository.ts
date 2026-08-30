import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { NotFoundError } from '../lib/errors.js';
import type { AdminAccountSummary, Club, ClubSearchResult, CountryCode } from '../types.js';

type Queryable = Pool | PoolClient;

function mapSearchRow(row: any): ClubSearchResult {
  return { id: row.id, name: row.name, type: row.type, city: row.city, country: row.country };
}

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
    verificationStatus: row.verification_status,
    verificationReviewedBy: row.verification_reviewed_by,
    verificationReviewedAt: row.verification_reviewed_at,
    identityDocumentUrl: row.identity_document_url,
    createdAt: row.created_at,
  };
}

/** ClubHomeScreen: perfil del club. */
export async function getById(clubId: string, db: Queryable = pool): Promise<Club> {
  const { rows } = await db.query(`SELECT * FROM clubs WHERE id = $1`, [clubId]);
  if (rows.length === 0) throw new NotFoundError('Club', clubId);
  return mapRow(rows[0]);
}

/** ClubJoinScreen: "buscar mi club" para pedir ser administrador de respaldo (ver decisión #42) —
 * sin filtrar por verification_status, a diferencia de tournamentRepository.search: un club
 * legítimo puede seguir 'pending' de revisión y su admin oficial igual necesita poder sumar un
 * respaldo mientras tanto. Mismo patrón ILIKE que coachRepository.search. */
export async function search(query: string, db: Queryable = pool): Promise<ClubSearchResult[]> {
  const { rows } = await db.query(
    `SELECT id, name, type, city, country FROM clubs
     WHERE name ILIKE $1 OR city ILIKE $1
     ORDER BY name
     LIMIT 25`,
    [`%${query}%`],
  );
  return rows.map(mapSearchRow);
}

/** El sentido inverso de club_admins (club_id, user_id): qué club administra este usuario.
 * Un usuario podría administrar más de un club (sin UNIQUE sobre user_id solo), pero la app
 * hoy solo muestra uno — igual que ya simplifica mock/clubFlow.ts. */
export async function getClubIdForAdminUser(userId: string, db: Queryable = pool): Promise<string> {
  const { rows } = await db.query(`SELECT club_id FROM club_admins WHERE user_id = $1 LIMIT 1`, [userId]);
  if (rows.length === 0) throw new NotFoundError('ClubAdmin', userId);
  return rows[0].club_id;
}

/** tournamentReportService: a quién avisarle (push) cuando alguien reporta un posible error en
 * un torneo de este club — puede haber más de un admin desde el administrador de respaldo
 * (decisión #42), así que se notifica a todos, no solo al primero. */
export async function listAdminUserIds(clubId: string, db: Queryable = pool): Promise<string[]> {
  const { rows } = await db.query(`SELECT user_id FROM club_admins WHERE club_id = $1`, [clubId]);
  return rows.map((r) => r.user_id);
}

/** PlatformAdminAccountsScreen, pestaña "Administradores de club" (decisión #52) — igual que
 * coachRepository.listAllForAdmin, NO filtra por verification_status del club ni excluye a los
 * ya deshabilitados. Segunda consulta + merge en memoria para clubNames (no un array_agg
 * correlacionado en el SELECT principal): mismo motivo que
 * tournamentRepository.fetchAgeCategoriesByTournament — pg-mem (smoke tests) no resuelve una
 * referencia a la tabla externa dentro de una subconsulta. */
export async function listClubAdminsForAdmin(search: string | undefined, db: Queryable = pool): Promise<AdminAccountSummary[]> {
  const conditions: string[] = [`primary_role = 'club_admin'`];
  const values: unknown[] = [];
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
  if (rows.length === 0) return [];

  const userIds: string[] = rows.map((r) => r.id);
  const placeholders = userIds.map((_, i) => `$${i + 1}`).join(', ');
  const { rows: clubRows } = await db.query(
    `SELECT ca.user_id, c.name FROM club_admins ca JOIN clubs c ON c.id = ca.club_id WHERE ca.user_id IN (${placeholders})`,
    userIds,
  );
  const clubNamesByUser = new Map<string, string[]>();
  for (const row of clubRows) {
    const existing = clubNamesByUser.get(row.user_id) ?? [];
    existing.push(row.name);
    clubNamesByUser.set(row.user_id, existing);
  }

  return rows.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    email: r.email,
    createdAt: r.created_at,
    disabledAt: r.disabled_at,
    disabledReason: r.disabled_reason,
    clubNames: clubNamesByUser.get(r.id) ?? [],
  }));
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
    identityDocumentUrl: string;
  },
  db: Queryable = pool,
): Promise<Club> {
  const { rows } = await db.query(
    `INSERT INTO clubs (name, type, city, country, contact_email, contact_phone, default_commission_rate, identity_document_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      input.name,
      input.type,
      input.city,
      input.country,
      input.contactEmail,
      input.contactPhone,
      DEFAULT_COMMISSION_RATE,
      input.identityDocumentUrl,
    ],
  );
  return mapRow(rows[0]);
}

export async function addAdmin(clubId: string, userId: string, db: Queryable = pool): Promise<void> {
  await db.query(`INSERT INTO club_admins (club_id, user_id) VALUES ($1, $2)`, [clubId, userId]);
}

/** PlatformAdminClubVerificationScreen: cola de clubes recién autoregistrados, sin revisar
 * todavía — mientras estén 'pending', tournamentRepository.search no muestra sus torneos. */
export async function listPendingVerification(db: Queryable = pool): Promise<Club[]> {
  const { rows } = await db.query(`SELECT * FROM clubs WHERE verification_status = 'pending' ORDER BY created_at`);
  return rows.map(mapRow);
}

/** PlatformAdminClubVerificationScreen: aprobar o rechazar un club — a diferencia de
 * coach_verification_documents, acá no hay documentos individuales, es una sola decisión sobre
 * el club entero (ver decisión #41 en db/schema.sql). */
export async function reviewVerification(
  clubId: string,
  input: { status: 'approved' | 'rejected'; reviewedBy: string },
  db: Queryable = pool,
): Promise<Club> {
  const { rows } = await db.query(
    `UPDATE clubs
     SET verification_status = $2, verification_reviewed_by = $3, verification_reviewed_at = now()
     WHERE id = $1 RETURNING *`,
    [clubId, input.status, input.reviewedBy],
  );
  if (rows.length === 0) throw new NotFoundError('Club', clubId);
  return mapRow(rows[0]);
}

/** ClubRegistrationScreen "Editar perfil" — mismos campos que create, sin tocar
 * default_commission_rate (todavía no hay pantalla para eso, ver comentario arriba). */
export async function update(
  clubId: string,
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
    `UPDATE clubs SET name = $2, type = $3, city = $4, country = $5, contact_email = $6, contact_phone = $7
     WHERE id = $1 RETURNING *`,
    [clubId, input.name, input.type, input.city, input.country, input.contactEmail, input.contactPhone],
  );
  if (rows.length === 0) throw new NotFoundError('Club', clubId);
  return mapRow(rows[0]);
}
