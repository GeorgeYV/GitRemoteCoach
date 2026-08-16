import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import type { MatchPlayerSlot, MatchScoreAdjustment } from '../types.js';

type Queryable = Pool | PoolClient;

function mapRow(row: any): MatchScoreAdjustment {
  return {
    id: row.id,
    matchId: row.match_id,
    sequenceNumber: row.sequence_number,
    occurredAt: row.occurred_at,
    gamesPlayer1: row.games_player1,
    gamesPlayer2: row.games_player2,
    pointsPlayer1: row.points_player1,
    pointsPlayer2: row.points_player2,
    server: row.server,
  };
}

export interface AdjustmentInput {
  sequenceNumber: number;
  gamesPlayer1: number;
  gamesPlayer2: number;
  pointsPlayer1: number;
  pointsPlayer2: number;
  server: MatchPlayerSlot;
}

/** Idempotente por (match_id, sequence_number) UNIQUE — mismo patrón que
 * matchPointEventRepository.create, para que reintentar un ajuste que ya llegó (timeout de red)
 * no lo duplique. */
export async function create(
  matchId: string,
  adjustment: AdjustmentInput,
  db: Queryable = pool,
): Promise<MatchScoreAdjustment> {
  const { rows } = await db.query(
    `INSERT INTO match_score_adjustments
       (match_id, sequence_number, games_player1, games_player2, points_player1, points_player2, server)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (match_id, sequence_number) DO NOTHING
     RETURNING *`,
    [
      matchId,
      adjustment.sequenceNumber,
      adjustment.gamesPlayer1,
      adjustment.gamesPlayer2,
      adjustment.pointsPlayer1,
      adjustment.pointsPlayer2,
      adjustment.server,
    ],
  );
  if (rows.length > 0) return mapRow(rows[0]);
  const { rows: existing } = await db.query(
    `SELECT * FROM match_score_adjustments WHERE match_id = $1 AND sequence_number = $2`,
    [matchId, adjustment.sequenceNumber],
  );
  return mapRow(existing[0]);
}

/** ParentReportsScreen: todos los ajustes de un partido, en orden — lib/scoringEngine.ts los
 * intercala con match_point_events por occurred_at para reconstruir el estado. */
export async function listByMatch(matchId: string, db: Queryable = pool): Promise<MatchScoreAdjustment[]> {
  const { rows } = await db.query(
    `SELECT * FROM match_score_adjustments WHERE match_id = $1 ORDER BY sequence_number ASC`,
    [matchId],
  );
  return rows.map(mapRow);
}

/** "Nuevo partido": reinicia el mismo partido en vez de crear uno nuevo. */
export async function deleteAllForMatch(matchId: string, db: Queryable = pool): Promise<void> {
  await db.query(`DELETE FROM match_score_adjustments WHERE match_id = $1`, [matchId]);
}
