import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { NotFoundError } from '../lib/errors.js';
import type { CaptureMode, Match, MatchBestOf, MatchPlayerSlot, MatchStatus } from '../types.js';

type Queryable = Pool | PoolClient;

function mapRow(row: any): Match {
  return {
    id: row.id,
    bookingId: row.booking_id,
    player1Id: row.player1_id,
    player2Label: row.player2_label,
    bestOf: row.best_of,
    noAd: row.no_ad,
    initialServer: row.initial_server,
    captureMode: row.capture_mode,
    status: row.status,
    coachObservations: row.coach_observations,
    startedAt: row.started_at,
    completedAt: row.completed_at,
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
    bestOf: MatchBestOf;
    noAd: boolean;
    initialServer: MatchPlayerSlot;
    captureMode: CaptureMode;
  },
  db: Queryable = pool,
): Promise<Match> {
  const { rows } = await db.query(
    `INSERT INTO matches (booking_id, player1_id, player2_label, best_of, no_ad, initial_server, capture_mode)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (booking_id) DO NOTHING
     RETURNING *`,
    [
      params.bookingId,
      params.player1Id,
      params.player2Label,
      params.bestOf,
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

export async function updateObservations(id: string, coachObservations: string, db: Queryable = pool): Promise<Match> {
  const { rows } = await db.query(
    `UPDATE matches SET coach_observations = $2 WHERE id = $1 RETURNING *`,
    [id, coachObservations],
  );
  if (rows.length === 0) throw new NotFoundError('Match', id);
  return mapRow(rows[0]);
}

export async function updateCaptureMode(id: string, captureMode: CaptureMode, db: Queryable = pool): Promise<Match> {
  const { rows } = await db.query(
    `UPDATE matches SET capture_mode = $2 WHERE id = $1 RETURNING *`,
    [id, captureMode],
  );
  if (rows.length === 0) throw new NotFoundError('Match', id);
  return mapRow(rows[0]);
}
