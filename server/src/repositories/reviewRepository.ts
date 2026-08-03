import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { ConflictError } from '../lib/errors.js';
import type { Review, ReviewWithParent } from '../types.js';

type Queryable = Pool | PoolClient;

const UNIQUE_VIOLATION = '23505';

function mapRow(row: any): Review {
  return {
    id: row.id,
    bookingId: row.booking_id,
    parentId: row.parent_id,
    coachId: row.coach_id,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.created_at,
  };
}

function mapRowWithParent(row: any): ReviewWithParent {
  return { ...mapRow(row), parentName: row.parent_name };
}

export async function createReview(
  params: { bookingId: string; parentId: string; coachId: string; rating: number; comment?: string },
  db: Queryable = pool,
): Promise<Review> {
  try {
    const { rows } = await db.query(
      `INSERT INTO reviews (booking_id, parent_id, coach_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [params.bookingId, params.parentId, params.coachId, params.rating, params.comment ?? null],
    );
    return mapRow(rows[0]);
  } catch (err: any) {
    // Único índice único posible en este INSERT: reviews_booking_id_key (una reseña por reserva).
    if (err.code === UNIQUE_VIOLATION) {
      throw new ConflictError('Esta reserva ya tiene una reseña', 'review_already_exists');
    }
    throw err;
  }
}

/** TrainerProfileScreen: reseñas con el nombre del padre (JOIN con users), más recientes primero. */
export async function listReviewsForCoach(coachId: string, db: Queryable = pool): Promise<ReviewWithParent[]> {
  const { rows } = await db.query(
    `SELECT r.*, u.full_name AS parent_name
     FROM reviews r
     JOIN users u ON u.id = r.parent_id
     WHERE r.coach_id = $1
     ORDER BY r.created_at DESC`,
    [coachId],
  );
  return rows.map(mapRowWithParent);
}
