import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import type { ClubCoachInvitation, ClubCoachInvitationWithNames, ClubInvitationStatus } from '../types.js';

type Queryable = Pool | PoolClient;

const UNIQUE_VIOLATION = '23505';

function mapRow(row: any): ClubCoachInvitation {
  return {
    id: row.id,
    clubId: row.club_id,
    tournamentId: row.tournament_id,
    coachId: row.coach_id,
    invitedBy: row.invited_by,
    message: row.message,
    status: row.status,
    invitedAt: row.invited_at,
    respondedAt: row.responded_at,
  };
}

function mapRowWithNames(row: any): ClubCoachInvitationWithNames {
  return { ...mapRow(row), clubName: row.club_name, tournamentName: row.tournament_name };
}

export async function createInvitation(
  params: { clubId: string; tournamentId: string; coachId: string; invitedBy: string; message?: string },
  db: Queryable = pool,
): Promise<ClubCoachInvitation> {
  try {
    const { rows } = await db.query(
      `INSERT INTO club_coach_invitations (club_id, tournament_id, coach_id, invited_by, message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [params.clubId, params.tournamentId, params.coachId, params.invitedBy, params.message ?? null],
    );
    return mapRow(rows[0]);
  } catch (err: any) {
    // Única violación de unicidad posible en este INSERT:
    // idx_club_coach_invitations_no_duplicate_pending.
    if (err.code === UNIQUE_VIOLATION) {
      throw new ConflictError(
        'Ya existe una invitación pendiente para este entrenador en ese torneo',
        'duplicate_invitation',
      );
    }
    throw err;
  }
}

export async function getInvitationById(id: string, db: Queryable = pool): Promise<ClubCoachInvitation> {
  const { rows } = await db.query(`SELECT * FROM club_coach_invitations WHERE id = $1`, [id]);
  if (rows.length === 0) throw new NotFoundError('ClubCoachInvitation', id);
  return mapRow(rows[0]);
}

/** CoachClubInvitationScreen: nombre de club y torneo vienen de JOINs, para no mostrar solo UUIDs. */
export async function listPendingInvitationsForCoach(
  coachId: string,
  db: Queryable = pool,
): Promise<ClubCoachInvitationWithNames[]> {
  const { rows } = await db.query(
    `SELECT i.*, c.name AS club_name, t.name AS tournament_name
     FROM club_coach_invitations i
     JOIN clubs c ON c.id = i.club_id
     JOIN tournaments t ON t.id = i.tournament_id
     WHERE i.coach_id = $1 AND i.status = 'pending'
     ORDER BY i.invited_at DESC`,
    [coachId],
  );
  return rows.map(mapRowWithNames);
}

/** Transición atómica 'pending' -> 'accepted'/'declined' (CoachClubInvitationScreen). Null si ya fue respondida. */
export async function respondToInvitation(
  id: string,
  status: Extract<ClubInvitationStatus, 'accepted' | 'declined'>,
  db: Queryable = pool,
): Promise<ClubCoachInvitation | null> {
  const { rows } = await db.query(
    `UPDATE club_coach_invitations
     SET status = $2, responded_at = now()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [id, status],
  );
  return rows.length > 0 ? mapRow(rows[0]) : null;
}
