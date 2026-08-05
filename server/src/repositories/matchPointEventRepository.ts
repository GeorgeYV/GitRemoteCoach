import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import type { MatchPlayerSlot, MatchPointEvent, PointDetail } from '../types.js';

type Queryable = Pool | PoolClient;

function mapRow(row: any): MatchPointEvent {
  return {
    id: row.id,
    matchId: row.match_id,
    sequenceNumber: row.sequence_number,
    occurredAt: row.occurred_at,
    wonBy: row.won_by,
    detail: row.detail,
    firstServeIn: row.first_serve_in,
  };
}

export interface PointInput {
  sequenceNumber: number;
  wonBy: MatchPlayerSlot;
  detail: PointDetail | null;
  firstServeIn: boolean;
}

/**
 * Idempotente por (match_id, sequence_number) UNIQUE — LiveCaptureView reintenta
 * la sincronización de un punto ya recibido (ej. tras un timeout de red) sin que
 * eso duplique el evento. Mismo patrón que matchRepository.getOrCreate.
 */
export async function create(matchId: string, point: PointInput, db: Queryable = pool): Promise<MatchPointEvent> {
  const { rows } = await db.query(
    `INSERT INTO match_point_events (match_id, sequence_number, won_by, detail, first_serve_in)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (match_id, sequence_number) DO NOTHING
     RETURNING *`,
    [matchId, point.sequenceNumber, point.wonBy, point.detail, point.firstServeIn],
  );
  if (rows.length > 0) return mapRow(rows[0]);
  const { rows: existing } = await db.query(
    `SELECT * FROM match_point_events WHERE match_id = $1 AND sequence_number = $2`,
    [matchId, point.sequenceNumber],
  );
  return mapRow(existing[0]);
}

/** LiveCaptureView: catálogo de recuperación tras hidratar AsyncStorage (o botón "Reintentar
 * sincronización") — reenvía todos los puntos locales de una vez; cada uno es idempotente por su cuenta. */
export async function createBulk(matchId: string, points: PointInput[], db: Queryable = pool): Promise<MatchPointEvent[]> {
  const results: MatchPointEvent[] = [];
  for (const point of points) {
    results.push(await create(matchId, point, db));
  }
  return results;
}

/** Undo de un punto (LiveCaptureView). No es un error si ese punto nunca llegó a sincronizarse. */
export async function deleteBySequence(matchId: string, sequenceNumber: number, db: Queryable = pool): Promise<void> {
  await db.query(`DELETE FROM match_point_events WHERE match_id = $1 AND sequence_number = $2`, [
    matchId,
    sequenceNumber,
  ]);
}

/** "Nuevo partido": reinicia el mismo partido en vez de crear uno nuevo (matches.booking_id es UNIQUE). */
export async function deleteAllForMatch(matchId: string, db: Queryable = pool): Promise<void> {
  await db.query(`DELETE FROM match_point_events WHERE match_id = $1`, [matchId]);
}
