import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import type { Booking, BookingStatus } from '../types.js';

type Queryable = Pool | PoolClient;

const UNIQUE_VIOLATION = '23505';

function mapRow(row: any): Booking {
  return {
    id: row.id,
    playerId: row.player_id,
    coachId: row.coach_id,
    tournamentId: row.tournament_id,
    matchDatetime: row.match_datetime,
    agreedRate: row.agreed_rate,
    status: row.status,
    parentNote: row.parent_note,
    courtLabel: row.court_label,
    meetingPointDetail: row.meeting_point_detail,
    responseDeadline: row.response_deadline,
    paymentDeadline: row.payment_deadline,
    totalAmountPaid: row.total_amount_paid,
    coachNetAmount: row.coach_net_amount,
    platformCommissionAmount: row.platform_commission_amount,
    clubCommissionAmount: row.club_commission_amount,
    clubCommissionStatus: row.club_commission_status,
    settlementId: row.settlement_id,
    cancelledBy: row.cancelled_by,
    cancellationReason: row.cancellation_reason,
    refundAmount: row.refund_amount,
    coachCompensationAmount: row.coach_compensation_amount,
    flaggedForCoachPenalty: row.flagged_for_coach_penalty,
    paymentReference: row.payment_reference,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
  };
}

export async function createBookingRequest(
  params: {
    playerId: string;
    coachId: string;
    tournamentId: string;
    matchDatetime: string;
    agreedRate: number;
    responseDeadline: Date;
    parentNote?: string;
  },
  db: Queryable = pool,
): Promise<Booking> {
  try {
    const { rows } = await db.query(
      `INSERT INTO bookings (player_id, coach_id, tournament_id, match_datetime, agreed_rate, response_deadline, parent_note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        params.playerId,
        params.coachId,
        params.tournamentId,
        params.matchDatetime,
        params.agreedRate,
        params.responseDeadline,
        params.parentNote ?? null,
      ],
    );
    return mapRow(rows[0]);
  } catch (err: any) {
    // Única violación de unicidad posible en este INSERT (id es un UUID
    // recién generado): idx_bookings_no_duplicate_active. No se compara
    // err.constraint porque algunos drivers/motores no lo reportan igual.
    if (err.code === UNIQUE_VIOLATION) {
      throw new ConflictError(
        'Ya existe una solicitud activa para este entrenador en ese horario',
        'duplicate_booking',
      );
    }
    throw err;
  }
}

export async function getBookingById(id: string, db: Queryable = pool): Promise<Booking> {
  const { rows } = await db.query('SELECT * FROM bookings WHERE id = $1', [id]);
  if (rows.length === 0) throw new NotFoundError('Booking', id);
  return mapRow(rows[0]);
}

/** Bloquea la fila dentro de una transacción — necesario para transiciones de estado seguras ante condiciones de carrera. */
export async function getBookingByIdForUpdate(id: string, client: PoolClient): Promise<Booking> {
  const { rows } = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [id]);
  if (rows.length === 0) throw new NotFoundError('Booking', id);
  return mapRow(rows[0]);
}

/** Fija la logística de encuentro (cancha, punto de encuentro) mostrada en CoachPreMatchReminderScreen. */
export async function setMeetingDetails(
  id: string,
  details: { courtLabel?: string; meetingPointDetail?: string },
  db: Queryable = pool,
): Promise<Booking> {
  const { rows } = await db.query(
    `UPDATE bookings
     SET court_label = COALESCE($2, court_label),
         meeting_point_detail = COALESCE($3, meeting_point_detail)
     WHERE id = $1
     RETURNING *`,
    [id, details.courtLabel ?? null, details.meetingPointDetail ?? null],
  );
  if (rows.length === 0) throw new NotFoundError('Booking', id);
  return mapRow(rows[0]);
}

export async function updateStatus(
  id: string,
  fromStatuses: BookingStatus[],
  toStatus: BookingStatus,
  extraColumns: Record<string, unknown> = {},
  db: Queryable = pool,
): Promise<Booking | null> {
  const columns = Object.keys(extraColumns);
  const setClauses = ['status = $1', ...columns.map((col, i) => `${col} = $${i + 3}`)];
  const values = [toStatus, id, ...columns.map((col) => extraColumns[col])];
  // IN (...) con un placeholder por valor en vez de "= ANY($n::booking_status[])":
  // el patrón ANY(array) sobre una columna enum no siempre compila igual entre
  // motores/versiones, mientras que IN con placeholders individuales es SQL
  // estándar sin ambigüedad de tipos.
  const statusPlaceholders = fromStatuses.map((_, i) => `$${values.length + i + 1}`).join(', ');

  const { rows } = await db.query(
    `UPDATE bookings
     SET ${setClauses.join(', ')}
     WHERE id = $2 AND status IN (${statusPlaceholders})
     RETURNING *`,
    [...values, ...fromStatuses],
  );
  return rows.length > 0 ? mapRow(rows[0]) : null;
}

/** Transición atómica en bulk: evita la carrera con un accept/reject concurrente (la fila solo se toma si sigue en 'requested'). */
export async function expireOverdueRequests(db: Queryable = pool): Promise<Booking[]> {
  const { rows } = await db.query(
    `UPDATE bookings
     SET status = 'expired', decided_at = now()
     WHERE status = 'requested' AND response_deadline < now()
     RETURNING *`,
  );
  return rows.map(mapRow);
}

/** Idem para el padre que no pagó dentro de la ventana tras la aceptación. */
export async function expireOverduePayments(db: Queryable = pool): Promise<Booking[]> {
  const { rows } = await db.query(
    `UPDATE bookings
     SET status = 'expired'
     WHERE status = 'accepted' AND payment_deadline < now()
     RETURNING *`,
  );
  return rows.map(mapRow);
}

export async function findPendingCommissionsForTournament(
  tournamentId: string,
  db: Queryable = pool,
): Promise<Booking[]> {
  const { rows } = await db.query(
    `SELECT * FROM bookings
     WHERE tournament_id = $1 AND status = 'completed' AND club_commission_status = 'generated'
     FOR UPDATE`,
    [tournamentId],
  );
  return rows.map(mapRow);
}

export async function markBookingsSettled(
  bookingIds: string[],
  settlementId: string,
  client: PoolClient,
): Promise<void> {
  if (bookingIds.length === 0) return;
  // IN (...) con un placeholder por id en vez de "= ANY($n::uuid[])" — ver
  // el comentario en updateStatus sobre por qué se evita ese patrón.
  const placeholders = bookingIds.map((_, i) => `$${i + 2}`).join(', ');
  await client.query(
    `UPDATE bookings SET club_commission_status = 'settled', settlement_id = $1 WHERE id IN (${placeholders})`,
    [settlementId, ...bookingIds],
  );
}
