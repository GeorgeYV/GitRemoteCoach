import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import type {
  ClubAdminJoinRequest,
  ClubAdminJoinRequestWithClubName,
  ClubAdminJoinRequestWithUserName,
  ClubInvitationStatus,
} from '../types.js';

type Queryable = Pool | PoolClient;

const UNIQUE_VIOLATION = '23505';

function mapRow(row: any): ClubAdminJoinRequest {
  return {
    id: row.id,
    clubId: row.club_id,
    userId: row.user_id,
    status: row.status,
    requestedAt: row.requested_at,
    respondedAt: row.responded_at,
  };
}

function mapRowWithUserName(row: any): ClubAdminJoinRequestWithUserName {
  return { ...mapRow(row), userName: row.user_name, userEmail: row.user_email };
}

function mapRowWithClubName(row: any): ClubAdminJoinRequestWithClubName {
  return { ...mapRow(row), clubName: row.club_name };
}

export async function createRequest(
  params: { clubId: string; userId: string },
  db: Queryable = pool,
): Promise<ClubAdminJoinRequest> {
  try {
    const { rows } = await db.query(
      `INSERT INTO club_admin_join_requests (club_id, user_id) VALUES ($1, $2) RETURNING *`,
      [params.clubId, params.userId],
    );
    return mapRow(rows[0]);
  } catch (err: any) {
    // Única violación de unicidad posible: idx_club_admin_join_requests_no_duplicate_pending.
    if (err.code === UNIQUE_VIOLATION) {
      throw new ConflictError('Ya tienes una solicitud pendiente para este club', 'duplicate_request');
    }
    throw err;
  }
}

export async function getRequestById(id: string, db: Queryable = pool): Promise<ClubAdminJoinRequest> {
  const { rows } = await db.query(`SELECT * FROM club_admin_join_requests WHERE id = $1`, [id]);
  if (rows.length === 0) throw new NotFoundError('ClubAdminJoinRequest', id);
  return mapRow(rows[0]);
}

/** ClubJoinScreen: si el usuario ya tiene una solicitud pendiente, mostrar ese estado en vez de
 * dejarlo pedir de nuevo (la unique parcial ya lo impide, esto es solo para la UI). Nombre del
 * club vía JOIN, para "tu solicitud a ___ está pendiente" en vez de un UUID. */
export async function listPendingRequestsForUser(
  userId: string,
  db: Queryable = pool,
): Promise<ClubAdminJoinRequestWithClubName[]> {
  const { rows } = await db.query(
    `SELECT r.*, c.name AS club_name
     FROM club_admin_join_requests r
     JOIN clubs c ON c.id = r.club_id
     WHERE r.user_id = $1 AND r.status = 'pending'
     ORDER BY r.requested_at DESC`,
    [userId],
  );
  return rows.map(mapRowWithClubName);
}

/** ClubHomeScreen "Solicitudes de acceso": nombre/email de quien pide vienen de un JOIN. */
export async function listPendingRequestsForClub(
  clubId: string,
  db: Queryable = pool,
): Promise<ClubAdminJoinRequestWithUserName[]> {
  const { rows } = await db.query(
    `SELECT r.*, u.full_name AS user_name, u.email AS user_email
     FROM club_admin_join_requests r
     JOIN users u ON u.id = r.user_id
     WHERE r.club_id = $1 AND r.status = 'pending'
     ORDER BY r.requested_at DESC`,
    [clubId],
  );
  return rows.map(mapRowWithUserName);
}

/** Transición atómica 'pending' -> 'accepted'/'declined'. Null si ya fue respondida. */
export async function respondToRequest(
  id: string,
  status: Extract<ClubInvitationStatus, 'accepted' | 'declined'>,
  db: Queryable = pool,
): Promise<ClubAdminJoinRequest | null> {
  const { rows } = await db.query(
    `UPDATE club_admin_join_requests SET status = $2, responded_at = now() WHERE id = $1 AND status = 'pending' RETURNING *`,
    [id, status],
  );
  return rows.length > 0 ? mapRow(rows[0]) : null;
}
