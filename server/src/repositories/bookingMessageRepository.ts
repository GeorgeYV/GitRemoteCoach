import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import type { BookingMessage, MessageSenderType } from '../types.js';

type Queryable = Pool | PoolClient;

function mapRow(row: any): BookingMessage {
  return {
    id: row.id,
    bookingId: row.booking_id,
    senderType: row.sender_type,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

export async function createMessage(
  params: { bookingId: string; senderType: MessageSenderType; senderId?: string | null; body: string },
  db: Queryable = pool,
): Promise<BookingMessage> {
  const { rows } = await db.query(
    `INSERT INTO booking_messages (booking_id, sender_type, sender_id, body)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [params.bookingId, params.senderType, params.senderId ?? null, params.body],
  );
  return mapRow(rows[0]);
}

export async function listMessagesForBooking(bookingId: string, db: Queryable = pool): Promise<BookingMessage[]> {
  const { rows } = await db.query(
    `SELECT * FROM booking_messages WHERE booking_id = $1 ORDER BY created_at ASC`,
    [bookingId],
  );
  return rows.map(mapRow);
}
