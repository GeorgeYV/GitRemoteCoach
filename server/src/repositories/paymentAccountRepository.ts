import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { NotFoundError } from '../lib/errors.js';
import type { PaymentCollectionAccountAdmin } from '../types.js';

type Queryable = Pool | PoolClient;

function mapRow(row: any): PaymentCollectionAccountAdmin {
  return {
    id: row.id,
    country: row.country,
    provider: row.provider,
    label: row.label,
    handle: row.handle,
    bankName: row.bank_name,
    accountType: row.account_type,
    accountNumber: row.account_number,
    accountHolderName: row.account_holder_name,
    interbankAccountNumber: row.interbank_account_number,
    updatedAt: row.updated_at,
  };
}

/** Las 5 filas sembradas por país+proveedor (decisión #54) — PlatformAdminPaymentAccountsScreen
 * las lista todas de una, sin paginar (nunca van a ser más de un puñado). */
export async function listAll(db: Queryable = pool): Promise<PaymentCollectionAccountAdmin[]> {
  const { rows } = await db.query(`SELECT * FROM payment_collection_accounts ORDER BY country, provider`);
  return rows.map(mapRow);
}

export async function findById(id: string, db: Queryable = pool): Promise<PaymentCollectionAccountAdmin> {
  const { rows } = await db.query(`SELECT * FROM payment_collection_accounts WHERE id = $1`, [id]);
  if (rows.length === 0) throw new NotFoundError('PaymentCollectionAccount', id);
  return mapRow(rows[0]);
}

export interface UpdatePaymentAccountFields {
  handle: string | null;
  bankName: string | null;
  accountType: string | null;
  accountNumber: string | null;
  accountHolderName: string | null;
  interbankAccountNumber: string | null;
}

/** Pisa TODOS los campos editables de la fila (no solo los que aplican al provider) — seguro
 * porque el provider de una fila nunca cambia, así que los campos que no le corresponden ya
 * estaban en NULL de entrada (ver paymentAccountService.updatePaymentAccount, que arma este
 * objeto completo según el provider antes de llamar acá). */
export async function update(
  id: string,
  fields: UpdatePaymentAccountFields,
  updatedBy: string,
  db: Queryable = pool,
): Promise<PaymentCollectionAccountAdmin> {
  const { rows } = await db.query(
    `UPDATE payment_collection_accounts
     SET handle = $2, bank_name = $3, account_type = $4, account_number = $5,
         account_holder_name = $6, interbank_account_number = $7, updated_at = now(), updated_by = $8
     WHERE id = $1
     RETURNING *`,
    [
      id,
      fields.handle,
      fields.bankName,
      fields.accountType,
      fields.accountNumber,
      fields.accountHolderName,
      fields.interbankAccountNumber,
      updatedBy,
    ],
  );
  if (rows.length === 0) throw new NotFoundError('PaymentCollectionAccount', id);
  return mapRow(rows[0]);
}
