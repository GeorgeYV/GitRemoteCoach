/**
 * Promueve una cuenta ya registrada a platform_admin — este rol NO es auto-registrable (ver
 * SELF_SERVICE_ROLES en src/routes/auth.ts), así que la única forma de tener un admin es
 * registrar una cuenta normal desde la app y después subirle el rol acá, a mano.
 *
 * Uso (desde server/):
 *   $env:DATABASE_URL = "<External Database URL de Render>"
 *   npx tsx scripts/set-platform-admin.ts correo@ejemplo.com
 *
 * Mismo criterio que load-schema.ts: exige DATABASE_URL explícito (no lee .env) para no correr
 * esto por accidente contra la base de desarrollo local.
 */
import { Pool } from 'pg';

const email = process.argv[2];
if (!email) {
  console.error('Falta el correo. Uso: npx tsx scripts/set-platform-admin.ts correo@ejemplo.com');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Falta DATABASE_URL. Ejemplo: $env:DATABASE_URL = "postgres://..."; npx tsx scripts/set-platform-admin.ts correo@ejemplo.com');
  process.exit(1);
}

const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

pool
  .query(`UPDATE users SET primary_role = 'platform_admin' WHERE email = $1 RETURNING id, email, primary_role`, [email])
  .then(({ rows }) => {
    if (rows.length === 0) {
      console.error(`No existe ninguna cuenta con ese correo. Registrala primero desde la app y vuelve a correr esto.`);
      process.exitCode = 1;
      return;
    }
    console.log('Listo:', rows[0]);
  })
  .catch((err) => {
    console.error('Error:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
