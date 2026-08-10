import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import type { CoachClubTag, TournamentCoachTag, TournamentCoachTagWithProfile } from '../types.js';

type Queryable = Pool | PoolClient;

function mapRowWithProfile(row: any): TournamentCoachTagWithProfile {
  return {
    coachId: row.coach_id,
    name: row.name,
    city: row.city,
    ratingAvg: row.rating_avg,
    taggedAt: row.tagged_at,
  };
}

function mapRowForCoach(row: any): CoachClubTag {
  return {
    tournamentId: row.tournament_id,
    tournamentName: row.tournament_name,
    clubName: row.club_name,
    taggedAt: row.tagged_at,
  };
}

function mapRow(row: any): TournamentCoachTag {
  return {
    tournamentId: row.tournament_id,
    coachId: row.coach_id,
    taggedBy: row.tagged_by,
    taggedAt: row.tagged_at,
  };
}

/**
 * Marca a un entrenador como "oficial" del club en un torneo. Idempotente:
 * si ya estaba etiquetado, devuelve la fila existente en vez de fallar
 * (típicamente se llama justo después de aceptar una club_coach_invitations).
 */
export async function addCoachTag(
  params: { tournamentId: string; coachId: string; taggedBy: string },
  db: Queryable = pool,
): Promise<TournamentCoachTag> {
  const { rows } = await db.query(
    `INSERT INTO tournament_coach_tags (tournament_id, coach_id, tagged_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (tournament_id, coach_id) DO NOTHING
     RETURNING *`,
    [params.tournamentId, params.coachId, params.taggedBy],
  );
  if (rows.length > 0) return mapRow(rows[0]);
  const existing = await getTagForCoachTournament(params.tournamentId, params.coachId, db);
  return existing as TournamentCoachTag;
}

export async function listTagsForTournament(tournamentId: string, db: Queryable = pool): Promise<TournamentCoachTag[]> {
  const { rows } = await db.query(`SELECT * FROM tournament_coach_tags WHERE tournament_id = $1`, [tournamentId]);
  return rows.map(mapRow);
}

/** ClubTournamentDetailScreen: entrenadores oficiales del torneo, con nombre/ciudad/rating vía JOIN. */
export async function listTagsWithProfilesForTournament(
  tournamentId: string,
  db: Queryable = pool,
): Promise<TournamentCoachTagWithProfile[]> {
  const { rows } = await db.query(
    `SELECT tct.coach_id, u.full_name AS name, cp.city, cp.rating_avg, tct.tagged_at
     FROM tournament_coach_tags tct
     JOIN coach_profiles cp ON cp.user_id = tct.coach_id
     JOIN users u ON u.id = tct.coach_id
     WHERE tct.tournament_id = $1
     ORDER BY tct.tagged_at DESC`,
    [tournamentId],
  );
  return rows.map(mapRowWithProfile);
}

/** CoachAvailabilityScreen, CoachTournamentSearchScreen, CoachReputationScreen: insignias de
 * "oficial" que un entrenador ve en su propio perfil — inverso de listTagsWithProfilesForTournament,
 * usa idx_tournament_coach_tags_coach_id. */
export async function listTagsForCoach(coachId: string, db: Queryable = pool): Promise<CoachClubTag[]> {
  const { rows } = await db.query(
    `SELECT tct.tournament_id, t.name AS tournament_name, c.name AS club_name, tct.tagged_at
     FROM tournament_coach_tags tct
     JOIN tournaments t ON t.id = tct.tournament_id
     JOIN clubs c ON c.id = t.club_id
     WHERE tct.coach_id = $1
     ORDER BY tct.tagged_at DESC`,
    [coachId],
  );
  return rows.map(mapRowForCoach);
}

export async function getTagForCoachTournament(
  tournamentId: string,
  coachId: string,
  db: Queryable = pool,
): Promise<TournamentCoachTag | null> {
  const { rows } = await db.query(
    `SELECT * FROM tournament_coach_tags WHERE tournament_id = $1 AND coach_id = $2`,
    [tournamentId, coachId],
  );
  return rows.length > 0 ? mapRow(rows[0]) : null;
}
