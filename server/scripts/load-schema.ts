/**
 * Aplica db/schema.sql contra una base de datos Postgres externa (ej. la de Render recién creada
 * por render.yaml) — no hay migration runner en este proyecto (ver server/README.md), schema.sql
 * es la fuente de verdad y se aplica a mano cada vez que hace falta poblar una base nueva.
 *
 * Uso (desde server/):
 *   $env:DATABASE_URL = "<External Database URL de Render>"
 *   npx tsx scripts/load-schema.ts
 *
 * A propósito NO lee .env ni el pool compartido de lib/db.ts: este script apunta a una base
 * DISTINTA a la de desarrollo local (la de Render), así que DATABASE_URL se exige explícita en
 * cada corrida — mejor fallar con un mensaje claro que aplicar el schema a la base equivocada por
 * un olvido.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Falta DATABASE_URL. Ejemplo: $env:DATABASE_URL = "postgres://..."; npx tsx scripts/load-schema.ts');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, '..', '..', 'db', 'schema.sql');
const sql = readFileSync(schemaPath, 'utf8');

// rejectUnauthorized: false — Render firma el certificado TLS de la conexión externa con una CA
// propia que Node no trae en su almacén de confianza por defecto; sin esto, la conexión externa
// se cae con un error de certificado antes de llegar a ejecutar nada.
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

pool
  .query(sql)
  .then(() => {
    console.log(`Schema aplicado correctamente (${schemaPath}).`);
  })
  .catch((err) => {
    console.error('Error aplicando el schema:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
