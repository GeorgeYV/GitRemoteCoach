import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { NotFoundError } from '../lib/errors.js';
import type { CoachVerificationDocument, CoachVerificationDocumentWithCoachName, VerificationDocType } from '../types.js';

type Queryable = Pool | PoolClient;

const REQUIRED_DOC_TYPES: VerificationDocType[] = ['identity', 'background_check'];

function mapRow(row: any): CoachVerificationDocument {
  return {
    id: row.id,
    coachId: row.coach_id,
    docType: row.doc_type,
    fileUrl: row.file_url,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    uploadedAt: row.uploaded_at,
  };
}

function mapRowWithCoachName(row: any): CoachVerificationDocumentWithCoachName {
  return { ...mapRow(row), coachName: row.coach_name };
}

/** CoachRegistrationScreen "Enviar para verificación": una fila 'pending' por documento marcado
 * como subido — file_url es un placeholder hasta que exista almacenamiento real de archivos. */
export async function create(
  params: { coachId: string; docType: VerificationDocType; fileUrl: string },
  db: Queryable = pool,
): Promise<CoachVerificationDocument> {
  const { rows } = await db.query(
    `INSERT INTO coach_verification_documents (coach_id, doc_type, file_url)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [params.coachId, params.docType, params.fileUrl],
  );
  return mapRow(rows[0]);
}

/** CoachVerificationPendingScreen: checklist real del propio entrenador. */
export async function listForCoach(coachId: string, db: Queryable = pool): Promise<CoachVerificationDocument[]> {
  const { rows } = await db.query(
    `SELECT * FROM coach_verification_documents WHERE coach_id = $1 ORDER BY uploaded_at DESC`,
    [coachId],
  );
  return rows.map(mapRow);
}

/** PlatformAdminReviewScreen: cola de documentos pendientes de todos los coaches. */
export async function listPending(db: Queryable = pool): Promise<CoachVerificationDocumentWithCoachName[]> {
  const { rows } = await db.query(
    `SELECT cvd.*, u.full_name AS coach_name
     FROM coach_verification_documents cvd
     JOIN users u ON u.id = cvd.coach_id
     WHERE cvd.status = 'pending'
     ORDER BY cvd.uploaded_at ASC`,
  );
  return rows.map(mapRowWithCoachName);
}

export async function getById(id: string, db: Queryable = pool): Promise<CoachVerificationDocument> {
  const { rows } = await db.query(`SELECT * FROM coach_verification_documents WHERE id = $1`, [id]);
  if (rows.length === 0) throw new NotFoundError('CoachVerificationDocument', id);
  return mapRow(rows[0]);
}

/**
 * Cola de revisión del admin de plataforma. Espeja fn_coach_verification_documents_set_reviewed_at:
 * reviewed_at se setea explícitamente acá (no solo vía trigger) porque el pool de pruebas (pg-mem)
 * no ejecuta triggers ni funciones PL/pgSQL — mismo motivo que coachRepository.recalculateRating.
 */
export async function review(
  id: string,
  params: { status: 'approved' | 'rejected'; reviewedBy: string },
  db: Queryable = pool,
): Promise<CoachVerificationDocument> {
  const { rows } = await db.query(
    `UPDATE coach_verification_documents
     SET status = $2, reviewed_by = $3, reviewed_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, params.status, params.reviewedBy],
  );
  if (rows.length === 0) throw new NotFoundError('CoachVerificationDocument', id);
  return mapRow(rows[0]);
}

/**
 * Espeja recalculate_coach_verification_status() en db/schema.sql: se llama explícitamente desde
 * el servicio en vez de depender solo del trigger, mismo motivo que recalculateRating (pg-mem no
 * ejecuta PL/pgSQL). Mira, por cada doc_type obligatorio, la versión más reciente subida (por si
 * hubo un rechazo y luego un reenvío).
 */
export async function recalculateVerificationStatus(coachId: string, db: Queryable = pool): Promise<void> {
  const statuses = await Promise.all(
    REQUIRED_DOC_TYPES.map(async (docType) => {
      const { rows } = await db.query(
        `SELECT status FROM coach_verification_documents
         WHERE coach_id = $1 AND doc_type = $2
         ORDER BY uploaded_at DESC, id DESC
         LIMIT 1`,
        [coachId, docType],
      );
      return rows[0]?.status as string | undefined;
    }),
  );

  const newStatus = statuses.some((s) => s === 'rejected')
    ? 'rejected'
    : statuses.every((s) => s === 'approved')
      ? 'approved'
      : 'pending';

  await db.query(
    `UPDATE coach_profiles SET verification_status = $2, updated_at = now() WHERE user_id = $1`,
    [coachId, newStatus],
  );
}
