import { newDb, DataType } from 'pg-mem';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';

/**
 * pg-mem no puede cargar los triggers de db/schema.sql:
 *  - CREATE TRIGGER ni siquiera es una sintaxis que su parser (pgsql-ast-parser)
 *    reconozca — falla al parsear, no es un problema de "lenguaje no soportado".
 *  - Las funciones PL/pgSQL (fn_bookings_apply_settlement, recalculate_coach_rating,
 *    etc.) sí parsean como CREATE FUNCTION, pero pg-mem no trae un intérprete de
 *    plpgsql; solo soporta lenguajes que uno registra vía .registerLanguage()
 *    (ej. su lenguaje 'sql' embebido, limitado a un único SELECT).
 * Por eso se filtran ambos tipos de sentencia antes de cargar el schema en el
 * pool de prueba. Esto no relaja la cobertura de los smoke tests: cada columna
 * que estos triggers recalculan (club_settlements.total_commission_amount/paid_at,
 * bookings.club_commission_status, coach_profiles.rating_avg/rating_count) ya se
 * fija explícitamente desde el código de la aplicación (ver settlementService,
 * bookingRepository.markBookingsSettled); los triggers son un refuerzo a nivel
 * de base de datos, no la única fuente de esos valores en el flujo actual.
 */
function stripUnsupportedTriggerDdl(sql: string): string {
  const statements: string[] = [];
  let current = '';
  let inDollarQuote = false;
  let inLineComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];

    if (ch === '\n') {
      inLineComment = false;
      current += ch;
      continue;
    }
    if (inLineComment) {
      current += ch;
      continue;
    }
    if (sql[i] === '-' && sql[i + 1] === '-') {
      inLineComment = true;
      current += ch;
      continue;
    }
    if (sql[i] === '$' && sql[i + 1] === '$') {
      inDollarQuote = !inDollarQuote;
      current += '$$';
      i++;
      continue;
    }
    current += ch;
    if (ch === ';' && !inDollarQuote) {
      statements.push(current);
      current = '';
    }
  }
  if (current.trim()) statements.push(current);

  return statements
    .filter((stmt) => {
      const withoutComments = stmt.replace(/--.*$/gm, '').trim();
      const isTrigger = /^CREATE\s+TRIGGER\b/i.test(withoutComments);
      const isPlpgsqlFunction =
        /^CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\b/i.test(withoutComments) &&
        /LANGUAGE\s+plpgsql/i.test(withoutComments);
      return !isTrigger && !isPlpgsqlFunction;
    })
    .join('');
}

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
  db.public.none(stripUnsupportedTriggerDdl(schemaSql));

  const adapter = db.adapters.createPg();
  return new adapter.Pool() as unknown as Pool;
}
