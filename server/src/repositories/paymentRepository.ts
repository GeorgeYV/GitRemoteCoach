import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import type { PaymentTransaction, PaymentTransactionStatus, PaymentTransactionType } from '../types.js';

type Queryable = Pool | PoolClient;

function mapRow(row: any): PaymentTransaction {
  return {
    id: row.id,
    bookingId: row.booking_id,
    type: row.type,
    status: row.status,
    amount: row.amount,
    stripeObjectId: row.stripe_object_id,
    rawResponse: row.raw_response,
    createdAt: row.created_at,
  };
}

export async function recordTransaction(
  params: {
    bookingId: string;
    type: PaymentTransactionType;
    status: PaymentTransactionStatus;
    amount: number;
    stripeObjectId?: string;
    rawResponse?: unknown;
  },
  db: Queryable = pool,
): Promise<PaymentTransaction> {
  const { rows } = await db.query(
    `INSERT INTO payment_transactions (booking_id, type, status, amount, stripe_object_id, raw_response)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      params.bookingId,
      params.type,
      params.status,
      params.amount,
      params.stripeObjectId ?? null,
      params.rawResponse ? JSON.stringify(params.rawResponse) : null,
    ],
  );
  return mapRow(rows[0]);
}

export async function listTransactionsForBooking(bookingId: string, db: Queryable = pool): Promise<PaymentTransaction[]> {
  const { rows } = await db.query(
    `SELECT * FROM payment_transactions WHERE booking_id = $1 ORDER BY created_at ASC`,
    [bookingId],
  );
  return rows.map(mapRow);
}

export async function findByStripeObjectId(stripeObjectId: string, db: Queryable = pool): Promise<PaymentTransaction | null> {
  const { rows } = await db.query(`SELECT * FROM payment_transactions WHERE stripe_object_id = $1`, [stripeObjectId]);
  return rows.length > 0 ? mapRow(rows[0]) : null;
}
