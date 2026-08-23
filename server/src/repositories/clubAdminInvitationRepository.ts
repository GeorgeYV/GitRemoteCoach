import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import type { ClubAdminInvitation, ClubAdminInvitationWithClubName, ClubInvitationStatus } from '../types.js';

type Queryable = Pool | PoolClient;

const UNIQUE_VIOLATION = '23505';

function mapRow(row: any): ClubAdminInvitation {
  return {
    id: row.id,
    clubId: row.club_id,
    email: row.email,
    invitedBy: row.invited_by,
    status: row.status,
    invitedAt: row.invited_at,
    respondedAt: row.responded_at,
  };
}

function mapRowWithClubName(row: any): ClubAdminInvitationWithClubName {
  return { ...mapRow(row), clubName: row.club_name };
}

export async function createInvitation(
  params: { clubId: string; email: string; invitedBy: string },
  db: Queryable = pool,
): Promise<ClubAdminInvitation> {
  try {
    const { rows } = await db.query(
      `INSERT INTO club_admin_invitations (club_id, email, invited_by) VALUES ($1, $2, $3) RETURNING *`,
      [params.clubId, params.email, params.invitedBy],
    );
    return mapRow(rows[0]);
  } catch (err: any) {
    // Única violación de unicidad posible: idx_club_admin_invitations_no_duplicate_pending.
    if (err.code === UNIQUE_VIOLATION) {
      throw new ConflictError('Ya existe una invitación pendiente para ese email en este club', 'duplicate_invitation');
    }
    throw err;
  }
}

export async function getInvitationById(id: string, db: Queryable = pool): Promise<ClubAdminInvitation> {
  const { rows } = await db.query(`SELECT * FROM club_admin_invitations WHERE id = $1`, [id]);
  if (rows.length === 0) throw new NotFoundError('ClubAdminInvitation', id);
  return mapRow(rows[0]);
}

/** ClubJoinScreen: al entrar, resolver si el email de la sesión tiene una invitación pendiente
 * de algún club — antes de ofrecerle crear uno nuevo. Nombre del club vía JOIN, para no mostrar
 * un UUID pelado en "fuiste invitado a administrar ___". */
export async function listPendingInvitationsForEmail(
  email: string,
  db: Queryable = pool,
): Promise<ClubAdminInvitationWithClubName[]> {
  const { rows } = await db.query(
    `SELECT i.*, c.name AS club_name
     FROM club_admin_invitations i
     JOIN clubs c ON c.id = i.club_id
     WHERE i.email = $1 AND i.status = 'pending'
     ORDER BY i.invited_at DESC`,
    [email],
  );
  return rows.map(mapRowWithClubName);
}

/** ClubHomeScreen: invitaciones que este club ya mandó (cualquier estado, para mostrar
 * "pendiente"/"aceptada"/"rechazada"), no solo las pendientes. */
export async function listInvitationsForClub(clubId: string, db: Queryable = pool): Promise<ClubAdminInvitation[]> {
  const { rows } = await db.query(
    `SELECT * FROM club_admin_invitations WHERE club_id = $1 ORDER BY invited_at DESC`,
    [clubId],
  );
  return rows.map(mapRow);
}

/** Transición atómica 'pending' -> 'accepted'/'declined'. Null si ya fue respondida. */
export async function respondToInvitation(
  id: string,
  status: Extract<ClubInvitationStatus, 'accepted' | 'declined'>,
  db: Queryable = pool,
): Promise<ClubAdminInvitation | null> {
  const { rows } = await db.query(
    `UPDATE club_admin_invitations SET status = $2, responded_at = now() WHERE id = $1 AND status = 'pending' RETURNING *`,
    [id, status],
  );
  return rows.length > 0 ? mapRow(rows[0]) : null;
}
