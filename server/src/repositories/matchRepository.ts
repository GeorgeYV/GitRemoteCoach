import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { NotFoundError } from '../lib/errors.js';
import type { MatchFormatId } from '../lib/matchFormats.js';
import type { CaptureMode, Match, MatchPlayerSlot, MatchStatus } from '../types.js';

type Queryable = Pool | PoolClient;

function mapRow(row: any): Match {
  return {
    id: row.id,
    bookingId: row.booking_id,
    player1Id: row.player1_id,
    player2Label: row.player2_label,
    format: row.format,
    noAd: row.no_ad,
    initialServer: row.initial_server,
    captureMode: row.capture_mode,
    status: row.status,
    coachObservations: row.coach_observations,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    pausedAt: row.paused_at,
    totalPausedSeconds: row.total_paused_seconds,
    retiredBy: row.retired_by,
  };
}

/**
 * LiveCaptureView: idempotente por diseño — booking_id es UNIQUE, así que un
 * reintento de "Comenzar captura en vivo" (o CoachMatchSetupScreen reenviado)
 * nunca crea una segunda fila, devuelve la existente sin tocar su configuración.
 * Mismo patrón que tournamentCoachTagRepository.addCoachTag.
 */
export async function getOrCreate(
  params: {
    bookingId: string;
    player1Id: string;
    player2Label: string;
    format: MatchFormatId;
    noAd: boolean;
    initialServer: MatchPlayerSlot;
    captureMode: CaptureMode;
  },
  db: Queryable = pool,
): Promise<Match> {
  const { rows } = await db.query(
    `INSERT INTO matches (booking_id, player1_id, player2_label, format, no_ad, initial_server, capture_mode)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (booking_id) DO NOTHING
     RETURNING *`,
    [
      params.bookingId,
      params.player1Id,
      params.player2Label,
      params.format,
      params.noAd,
      params.initialServer,
      params.captureMode,
    ],
  );
  if (rows.length > 0) return mapRow(rows[0]);
  const { rows: existing } = await db.query(`SELECT * FROM matches WHERE booking_id = $1`, [params.bookingId]);
  return mapRow(existing[0]);
}

export async function getById(id: string, db: Queryable = pool): Promise<Match> {
  const { rows } = await db.query(`SELECT * FROM matches WHERE id = $1`, [id]);
  if (rows.length === 0) throw new NotFoundError('Match', id);
  return mapRow(rows[0]);
}

/** ParentReportsScreen: a diferencia de getOrCreate, no crea nada — la mayoría de las reservas
 * nunca tuvieron una captura en vivo, así que "sin partido todavía" es un resultado válido, no un error. */
export async function findByBookingId(bookingId: string, db: Queryable = pool): Promise<Match | null> {
  const { rows } = await db.query(`SELECT * FROM matches WHERE booking_id = $1`, [bookingId]);
  return rows.length > 0 ? mapRow(rows[0]) : null;
}

/** TrainerProfileScreen ("Estadísticas de partidos"): todos los partidos completados de un coach,
 * a través de sus reservas — usado para agregar stats reales sin exponer el detalle de un partido
 * individual (que pertenece a un padre/hijo específico) a un visitante público. */
export async function listCompletedByCoach(coachId: string, db: Queryable = pool): Promise<Match[]> {
  const { rows } = await db.query(
    `SELECT m.* FROM matches m
     JOIN bookings b ON b.id = m.booking_id
     WHERE b.coach_id = $1 AND m.status = 'completed'`,
    [coachId],
  );
  return rows.map(mapRow);
}

export interface SuspendedMatchSummary {
  matchId: string;
  bookingId: string;
  playerName: string;
}

/** CoachHomeScreen: banner prioritario "Partido suspendido" — a lo sumo uno por coach en la
 * práctica (retomar antes de suspender otro), por eso LIMIT 1 sin ordenar por nada especial. */
export async function findSuspendedByCoach(coachId: string, db: Queryable = pool): Promise<SuspendedMatchSummary | null> {
  const { rows } = await db.query(
    `SELECT m.id AS match_id, m.booking_id, p.full_name AS player_name
       FROM matches m
       JOIN bookings b ON b.id = m.booking_id
       JOIN players p ON p.id = m.player1_id
      WHERE b.coach_id = $1 AND m.status = 'suspended'
      LIMIT 1`,
    [coachId],
  );
  if (rows.length === 0) return null;
  return { matchId: rows[0].match_id, bookingId: rows[0].booking_id, playerName: rows[0].player_name };
}

/** CoachSessionHistoryScreen: insignia roja "Partido Finalizado por Retiro" en la lista — un
 * solo SELECT para toda la lista en vez de una llamada por reserva. */
export async function listRetiredBookingIdsByCoach(coachId: string, db: Queryable = pool): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT m.booking_id
       FROM matches m
       JOIN bookings b ON b.id = m.booking_id
      WHERE b.coach_id = $1 AND m.retired_by IS NOT NULL`,
    [coachId],
  );
  return rows.map((row) => row.booking_id);
}

/** Fija completed_at explícitamente (no depende del trigger, que pg-mem no ejecuta) —
 * mismo patrón que paymentService.completeBooking con bookings.completed_at. */
export async function updateStatus(id: string, status: MatchStatus, db: Queryable = pool): Promise<Match> {
  const completedAt = status === 'completed' ? new Date() : null;
  const { rows } = await db.query(
    `UPDATE matches SET status = $2, completed_at = $3 WHERE id = $1 RETURNING *`,
    [id, status, completedAt],
  );
  if (rows.length === 0) throw new NotFoundError('Match', id);
  return mapRow(rows[0]);
}

/** "Nuevo partido" (matchService.restartMatch): a diferencia de updateStatus, también limpia
 * paused_at/total_paused_seconds/retired_by — de lo contrario un retiro o una pausa viejos
 * seguirían apareciendo en lo que el entrenador ve como un partido nuevo. */
export async function resetForRestart(id: string, db: Queryable = pool): Promise<Match> {
  const { rows } = await db.query(
    `UPDATE matches
       SET status = 'in_progress', completed_at = NULL,
           paused_at = NULL, total_paused_seconds = 0, retired_by = NULL
     WHERE id = $1
     RETURNING *`,
    [id],
  );
  if (rows.length === 0) throw new NotFoundError('Match', id);
  return mapRow(rows[0]);
}

export async function updateObservations(id: string, coachObservations: string, db: Queryable = pool): Promise<Match> {
  const { rows } = await db.query(
    `UPDATE matches SET coach_observations = $2 WHERE id = $1 RETURNING *`,
    [id, coachObservations],
  );
  if (rows.length === 0) throw new NotFoundError('Match', id);
  return mapRow(rows[0]);
}

/** Contingencia "Pausa temporal / tiempo médico" — no-op si ya estaba pausado (WHERE paused_at
 * IS NULL), así que reintentar la llamada de red no pisa un paused_at más viejo. */
export async function pause(id: string, db: Queryable = pool): Promise<Match> {
  const { rows } = await db.query(
    `UPDATE matches SET paused_at = now() WHERE id = $1 AND paused_at IS NULL RETURNING *`,
    [id],
  );
  if (rows.length > 0) return mapRow(rows[0]);
  return getById(id, db);
}

/** Suma la duración de la pausa en curso a total_paused_seconds y limpia paused_at — todo en la
 * misma expresión SQL para que sea atómico. No-op si no estaba pausado. */
export async function resume(id: string, db: Queryable = pool): Promise<Match> {
  const { rows } = await db.query(
    `UPDATE matches
       SET total_paused_seconds = total_paused_seconds + GREATEST(0, EXTRACT(EPOCH FROM (now() - paused_at))::int),
           paused_at = NULL
     WHERE id = $1 AND paused_at IS NOT NULL
     RETURNING *`,
    [id],
  );
  if (rows.length > 0) return mapRow(rows[0]);
  return getById(id, db);
}

/** Contingencia "Suspender partido" — también pausa el cronómetro si no lo estaba ya (suspender
 * implica que el partido dejó de correr). */
export async function suspend(id: string, db: Queryable = pool): Promise<Match> {
  const { rows } = await db.query(
    `UPDATE matches
       SET status = 'suspended', completed_at = NULL, paused_at = COALESCE(paused_at, now())
     WHERE id = $1
     RETURNING *`,
    [id],
  );
  if (rows.length === 0) throw new NotFoundError('Match', id);
  return mapRow(rows[0]);
}

/** Reabrir desde 'suspended' — vuelve a 'in_progress' y reanuda el cronómetro (misma cuenta que
 * `resume`), ya que suspender lo había pausado. */
export async function resumeFromSuspension(id: string, db: Queryable = pool): Promise<Match> {
  const { rows } = await db.query(
    `UPDATE matches
       SET status = 'in_progress',
           total_paused_seconds = total_paused_seconds + GREATEST(0, EXTRACT(EPOCH FROM (now() - paused_at))::int),
           paused_at = NULL
     WHERE id = $1
     RETURNING *`,
    [id],
  );
  if (rows.length === 0) throw new NotFoundError('Match', id);
  return mapRow(rows[0]);
}

/** Contingencia "Terminar por retiro" — el partido queda 'completed' igual (con sus métricas
 * hasta ese punto), retired_by solo marca el motivo para la insignia del dashboard. */
export async function retire(id: string, retiredBy: MatchPlayerSlot, db: Queryable = pool): Promise<Match> {
  const { rows } = await db.query(
    `UPDATE matches SET status = 'completed', completed_at = now(), retired_by = $2 WHERE id = $1 RETURNING *`,
    [id, retiredBy],
  );
  if (rows.length === 0) throw new NotFoundError('Match', id);
  return mapRow(rows[0]);
}
