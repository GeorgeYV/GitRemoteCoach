import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import type { Booking, BookingForParent, BookingStatus, BookingWithParticipants } from '../types.js';

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

function mapRowWithParticipants(row: any): BookingWithParticipants {
  return {
    ...mapRow(row),
    playerName: row.player_name,
    ageCategory: row.age_category,
    parentName: row.parent_name,
    tournamentName: row.tournament_name,
    tournamentVenue: row.tournament_venue,
    hasUnreadMessages: row.has_unread_messages,
  };
}

function mapRowForParent(row: any): BookingForParent {
  return {
    ...mapRow(row),
    coachName: row.coach_name,
    playerName: row.player_name,
    ageCategory: row.age_category,
    tournamentName: row.tournament_name,
    tournamentVenue: row.tournament_venue,
    reviewed: row.reviewed,
    hasUnreadMessages: row.has_unread_messages,
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
        'Ya existe una solicitud activa para este jugador con este entrenador en ese horario',
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

/** Autorización a nivel de ruta: quién puede actuar sobre esta reserva (el entrenador o el
 * padre/guardián del jugador) — un único JOIN reutilizado por todas las rutas de bookings. */
export async function getBookingParticipants(
  id: string,
  db: Queryable = pool,
): Promise<{ coachId: string; guardianUserId: string }> {
  const { rows } = await db.query(
    `SELECT b.coach_id, p.guardian_user_id
     FROM bookings b
     JOIN players p ON p.id = b.player_id
     WHERE b.id = $1`,
    [id],
  );
  if (rows.length === 0) throw new NotFoundError('Booking', id);
  return { coachId: rows[0].coach_id, guardianUserId: rows[0].guardian_user_id };
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

/** Reprogramar horario — WHERE excluye estados terminales (el llamador ya verificó que el
 * booking existe vía getBookingParticipants, así que 0 filas acá solo puede significar "estado
 * terminal", no "no existe"). Mismo UNIQUE_VIOLATION que createBookingRequest: si el nuevo
 * horario choca con otra reserva activa del mismo jugador+coach, idx_bookings_no_duplicate_active
 * lo rechaza. */
export async function reschedule(id: string, matchDatetime: string, db: Queryable = pool): Promise<Booking | null> {
  try {
    const { rows } = await db.query(
      `UPDATE bookings SET match_datetime = $2
       WHERE id = $1 AND status NOT IN ('rejected', 'expired', 'cancelled', 'completed')
       RETURNING *`,
      [id, matchDatetime],
    );
    return rows.length > 0 ? mapRow(rows[0]) : null;
  } catch (err: any) {
    if (err.code === UNIQUE_VIOLATION) {
      throw new ConflictError(
        'Ya existe una solicitud activa para este jugador con este entrenador en ese horario',
        'duplicate_booking',
      );
    }
    throw err;
  }
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

/** TrainerProfileScreen: cuántos jugadores distintos tienen una reserva activa (no rechazada,
 * cancelada ni ya completada) con este coach para este torneo — "reservado actualmente". */
export async function countActivePlayersForCoachTournament(
  coachId: string,
  tournamentId: string,
  db: Queryable = pool,
): Promise<number> {
  const { rows } = await db.query(
    `SELECT COUNT(DISTINCT player_id) AS count FROM bookings
     WHERE coach_id = $1 AND tournament_id = $2 AND status IN ('requested', 'accepted', 'paid')`,
    [coachId, tournamentId],
  );
  return Number(rows[0].count);
}

/** TrainerListScreen: nombres (no solo el conteo) de los jugadores que ya reservaron con este
 * coach en este torneo — un coach ahora puede aceptar varios alumnos el mismo día, así que el
 * padre necesita ver quiénes antes de elegir. GROUP BY en vez de DISTINCT ON (no estándar,
 * pg-mem de los smoke tests no lo soporta) evita duplicar un jugador con más de una reserva
 * activa con el mismo coach en el torneo. */
export async function listActivePlayersForCoachTournament(
  coachId: string,
  tournamentId: string,
  db: Queryable = pool,
): Promise<Array<{ playerId: string; playerName: string }>> {
  const { rows } = await db.query(
    `SELECT p.id AS player_id, p.full_name AS player_name
     FROM bookings b
     JOIN players p ON p.id = b.player_id
     WHERE b.coach_id = $1 AND b.tournament_id = $2 AND b.status IN ('requested', 'accepted', 'paid')
     GROUP BY p.id, p.full_name
     ORDER BY p.full_name`,
    [coachId, tournamentId],
  );
  return rows.map((row) => ({ playerId: row.player_id, playerName: row.player_name }));
}

/** BookingHistoryScreen tab badge: cuántas reservas del padre están "por confirmar" (transitorio,
 * se resuelve solo cuando el coach responde) y cuántas ya fueron decididas (aceptada/rechazada)
 * pero el padre todavía no vio esa decisión — esta segunda parte se limpia con markDecisionsSeenForParent. */
export async function getBadgeSummaryForParent(
  guardianUserId: string,
  db: Queryable = pool,
): Promise<{ pending: number; decidedUnseen: number; unreadMessages: number }> {
  const { rows } = await db.query(
    `SELECT
       COUNT(CASE WHEN b.status = 'requested' THEN 1 END) AS pending,
       COUNT(CASE WHEN b.status IN ('accepted', 'paid', 'rejected')
                       AND b.decided_at IS NOT NULL
                       AND (b.parent_decision_seen_at IS NULL OR b.parent_decision_seen_at < b.decided_at)
                  THEN 1 END) AS decided_unseen,
       COUNT(CASE WHEN coach_msgs.last_at IS NOT NULL
                       AND coach_msgs.last_at > COALESCE(b.parent_messages_read_at, TIMESTAMP '1970-01-01')
                  THEN 1 END) AS unread_messages
     FROM bookings b
     JOIN players p ON p.id = b.player_id
     LEFT JOIN (
       SELECT booking_id, MAX(created_at) AS last_at
       FROM booking_messages
       WHERE sender_type != 'parent'
       GROUP BY booking_id
     ) coach_msgs ON coach_msgs.booking_id = b.id
     WHERE p.guardian_user_id = $1`,
    [guardianUserId],
  );
  return {
    pending: Number(rows[0].pending),
    decidedUnseen: Number(rows[0].decided_unseen),
    unreadMessages: Number(rows[0].unread_messages),
  };
}

/** Se llama al abrir BookingHistoryScreen — marca todas las decisiones ya tomadas como vistas,
 * para que el badge de decididas-no-vistas se limpie (las "por confirmar" no se tocan acá, se
 * resuelven solas cuando el coach responde). */
export async function markDecisionsSeenForParent(guardianUserId: string, db: Queryable = pool): Promise<void> {
  await db.query(
    `UPDATE bookings SET parent_decision_seen_at = now()
     WHERE status IN ('accepted', 'paid', 'rejected')
       AND player_id IN (SELECT id FROM players WHERE guardian_user_id = $1)`,
    [guardianUserId],
  );
}

/** Se llama al abrir ParentChatScreen/CoachChatScreen — limpia el punto de "mensaje nuevo" de
 * esa reserva para quien la abrió. Cada lado tiene su propia columna: leer como coach no marca
 * como visto lo que el propio coach escribió, y viceversa. */
export async function markMessagesRead(
  bookingId: string,
  role: 'coach' | 'parent',
  db: Queryable = pool,
): Promise<void> {
  const column = role === 'coach' ? 'coach_messages_read_at' : 'parent_messages_read_at';
  await db.query(`UPDATE bookings SET ${column} = now() WHERE id = $1`, [bookingId]);
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

/** CoachHomeScreen, CoachRequestInboxScreen, CoachSessionHistoryScreen, CoachEarningsScreen: todas las
 * reservas de un coach, con nombre de jugador/padre y datos del torneo, más recientes primero. */
export async function listBookingsForCoach(
  coachId: string,
  db: Queryable = pool,
): Promise<BookingWithParticipants[]> {
  const { rows } = await db.query(
    // LEFT JOIN a una subquery derivada (no correlacionada) en vez de un EXISTS en el SELECT
    // list — mismo motivo que reviewed en listBookingsForParent, pg-mem no resuelve esa forma.
    `SELECT b.*, p.full_name AS player_name, p.age_category, u.full_name AS parent_name,
            t.name AS tournament_name, t.venue AS tournament_venue,
            (parent_msgs.last_at IS NOT NULL
             AND parent_msgs.last_at > COALESCE(b.coach_messages_read_at, TIMESTAMP '1970-01-01')) AS has_unread_messages
     FROM bookings b
     JOIN players p ON p.id = b.player_id
     JOIN users u ON u.id = p.guardian_user_id
     JOIN tournaments t ON t.id = b.tournament_id
     LEFT JOIN (
       SELECT booking_id, MAX(created_at) AS last_at
       FROM booking_messages
       WHERE sender_type != 'coach'
       GROUP BY booking_id
     ) parent_msgs ON parent_msgs.booking_id = b.id
     WHERE b.coach_id = $1
     ORDER BY b.match_datetime DESC`,
    [coachId],
  );
  return rows.map(mapRowWithParticipants);
}

/** BookingHistoryScreen: todas las reservas de un padre (a través de sus hijos/as), con nombre
 * del entrenador y del torneo, más recientes primero. */
export async function listBookingsForParent(
  guardianUserId: string,
  db: Queryable = pool,
): Promise<BookingForParent[]> {
  const { rows } = await db.query(
    // LEFT JOIN en vez de EXISTS(SELECT ...) correlacionado: pg-mem (smoke tests, ver
    // setupDb.ts) no resuelve una subquery en el SELECT list que referencia una columna
    // de la consulta externa (b.id) — mismo tipo de limitación ya documentada ahí.
    `SELECT b.*, cu.full_name AS coach_name, p.full_name AS player_name, p.age_category,
            t.name AS tournament_name, t.venue AS tournament_venue,
            (rv.id IS NOT NULL) AS reviewed,
            (coach_msgs.last_at IS NOT NULL
             AND coach_msgs.last_at > COALESCE(b.parent_messages_read_at, TIMESTAMP '1970-01-01')) AS has_unread_messages
     FROM bookings b
     JOIN players p ON p.id = b.player_id
     JOIN users cu ON cu.id = b.coach_id
     JOIN tournaments t ON t.id = b.tournament_id
     LEFT JOIN reviews rv ON rv.booking_id = b.id
     LEFT JOIN (
       SELECT booking_id, MAX(created_at) AS last_at
       FROM booking_messages
       WHERE sender_type != 'parent'
       GROUP BY booking_id
     ) coach_msgs ON coach_msgs.booking_id = b.id
     WHERE p.guardian_user_id = $1
     ORDER BY b.match_datetime DESC`,
    [guardianUserId],
  );
  return rows.map(mapRowForParent);
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

/** notificationService: a quién avisar (push) cuando cambia el estado de esta reserva. */
export async function getParentUserIdForBooking(bookingId: string, db: Queryable = pool): Promise<string> {
  const { rows } = await db.query(
    `SELECT p.guardian_user_id
     FROM bookings b
     JOIN players p ON p.id = b.player_id
     WHERE b.id = $1`,
    [bookingId],
  );
  if (rows.length === 0) throw new NotFoundError('Booking', bookingId);
  return rows[0].guardian_user_id;
}
