import { newDb, DataType } from 'pg-mem';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';

/**
 * Postgres en memoria (pg-mem) para smoke tests, sin depender de una
 * instancia real. pg-mem no trae pgcrypto/citext embebidos, así que se
 * registran como polyfills mínimos antes de cargar db/schema.sql.
 */
export function createTestPool(): Pool {
  const db = newDb({ autoCreateForeignKeyIndices: true });

  db.registerExtension('pgcrypto', (schema) => {
    schema.registerFunction({
      name: 'gen_random_uuid',
      args: [],
      returns: DataType.uuid,
      impure: true,
      implementation: () => randomUUID(),
    });
  });

  db.registerExtension('citext', (schema) => {
    schema.registerEquivalentType({
      name: 'citext',
      equivalentTo: DataType.text,
      isValid: () => true,
    });
  });

  const schemaSql = readFileSync(path.resolve(import.meta.dirname, '../../db/schema.sql'), 'utf-8');
  db.public.none(schemaSql);

  const adapter = db.adapters.createPg();
  return new adapter.Pool() as unknown as Pool;
}
