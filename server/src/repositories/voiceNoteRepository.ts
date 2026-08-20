import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import type { VoiceNote } from '../types.js';

type Queryable = Pool | PoolClient;

function mapRow(row: any): VoiceNote {
  return {
    id: row.id,
    matchId: row.match_id,
    sequenceNumber: row.sequence_number,
    occurredAt: row.occurred_at,
    audioUrl: row.audio_url,
    durationMs: row.duration_ms,
    scoreLabel: row.score_label,
    setIndex: row.set_index,
    gameIndex: row.game_index,
    isTiebreak: row.is_tiebreak,
    transcript: row.transcript,
    transcriptStatus: row.transcript_status,
    transcriptionAttempts: row.transcription_attempts,
    transcribedAt: row.transcribed_at,
  };
}

export interface VoiceNoteInput {
  sequenceNumber: number;
  audioUrl: string;
  durationMs: number;
  scoreLabel: string;
  setIndex: number;
  gameIndex: number;
  isTiebreak: boolean;
}

/** Idempotente por (match_id, sequence_number) UNIQUE, mismo patrón que
 * matchPointEventRepository.create — un reintento de subida (ej. tras un timeout de red) no
 * duplica la nota ni vuelve a pisar su audio_url. */
export async function create(matchId: string, input: VoiceNoteInput, db: Queryable = pool): Promise<VoiceNote> {
  const { rows } = await db.query(
    `INSERT INTO voice_notes
       (match_id, sequence_number, audio_url, duration_ms, score_label, set_index, game_index, is_tiebreak)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (match_id, sequence_number) DO NOTHING
     RETURNING *`,
    [
      matchId,
      input.sequenceNumber,
      input.audioUrl,
      input.durationMs,
      input.scoreLabel,
      input.setIndex,
      input.gameIndex,
      input.isTiebreak,
    ],
  );
  if (rows.length > 0) return mapRow(rows[0]);
  const { rows: existing } = await db.query(
    `SELECT * FROM voice_notes WHERE match_id = $1 AND sequence_number = $2`,
    [matchId, input.sequenceNumber],
  );
  return mapRow(existing[0]);
}

/** ParentReportsScreen: todas las notas de un partido, en orden de grabación. */
export async function listByMatch(matchId: string, db: Queryable = pool): Promise<VoiceNote[]> {
  const { rows } = await db.query(`SELECT * FROM voice_notes WHERE match_id = $1 ORDER BY sequence_number ASC`, [
    matchId,
  ]);
  return rows.map(mapRow);
}

/** Borrar una nota (LiveCaptureView). Devuelve la fila borrada (o null si nunca llegó a
 * sincronizarse) para que el caller pueda limpiar su audio en R2 sin una consulta aparte. */
export async function deleteBySequence(
  matchId: string,
  sequenceNumber: number,
  db: Queryable = pool,
): Promise<VoiceNote | null> {
  const { rows } = await db.query(
    `DELETE FROM voice_notes WHERE match_id = $1 AND sequence_number = $2 RETURNING *`,
    [matchId, sequenceNumber],
  );
  return rows.length > 0 ? mapRow(rows[0]) : null;
}

/** "Nuevo partido": devuelve los audio_url borrados (sin los NULL) para que el caller limpie R2
 * fuera de la transacción — un side effect externo no debe vivir dentro de un BEGIN/COMMIT. */
export async function deleteAllForMatch(matchId: string, db: Queryable = pool): Promise<string[]> {
  const { rows } = await db.query(`DELETE FROM voice_notes WHERE match_id = $1 RETURNING audio_url`, [matchId]);
  return rows.map((row) => row.audio_url).filter((url): url is string => url !== null);
}
