#!/usr/bin/env node
/**
 * Herramienta de validación manual — no es parte de la app, no la usa ningún job. Sirve para
 * capturar un partido de verdad en la app (celular o navegador) y ver acá, al toque, exactamente
 * qué quedó guardado en cada punto (detail/lado/shotType/netApproach/errorDirection/rallyLength),
 * para chequear que el árbol de captura 'detallada' esté alimentando los campos correctos.
 *
 * Uso:
 *   node scripts/inspect-match.mjs "nombre de la jugadora o del entrenador"
 *   node scripts/inspect-match.mjs --booking <bookingId>
 *   node scripts/inspect-match.mjs --watch "nombre"   (repite cada 2s — dejalo corriendo mientras capturás)
 */
import 'dotenv/config';
import pg from 'pg';

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const bookingFlagIndex = args.indexOf('--booking');
const bookingIdArg = bookingFlagIndex >= 0 ? args[bookingFlagIndex + 1] : null;
const searchTerm = args.filter((a) => a !== '--watch' && a !== bookingIdArg && a !== '--booking').join(' ');

if (!bookingIdArg && !searchTerm) {
  console.error('Uso: node scripts/inspect-match.mjs [--watch] "nombre de jugadora o entrenador"');
  console.error('  o: node scripts/inspect-match.mjs [--watch] --booking <bookingId>');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

async function findMatchId() {
  if (bookingIdArg) {
    try {
      const { rows } = await client.query(`SELECT id FROM matches WHERE booking_id = $1`, [bookingIdArg]);
      return rows[0]?.id ?? null;
    } catch {
      return null; // bookingId con formato inválido -- se reporta como "no encontrado", no explota.
    }
  }
  const { rows } = await client.query(
    `SELECT m.id
       FROM matches m
       JOIN bookings b ON b.id = m.booking_id
       JOIN players p ON p.id = b.player_id
       JOIN users coach ON coach.id = b.coach_id
      WHERE p.full_name ILIKE '%' || $1 || '%' OR coach.full_name ILIKE '%' || $1 || '%'
      ORDER BY m.started_at DESC
      LIMIT 1`,
    [searchTerm],
  );
  return rows[0]?.id ?? null;
}

function fmtBool(v) {
  if (v === null || v === undefined) return '—';
  return v ? 'sí' : 'no';
}

async function printOnce() {
  const matchId = await findMatchId();
  if (!matchId) {
    console.log(bookingIdArg ? `No hay ningún partido para booking ${bookingIdArg}.` : `No encontré ningún partido que matchee "${searchTerm}".`);
    return;
  }

  const { rows: matchRows } = await client.query(
    `SELECT m.*, p.full_name AS player1_name, coach.full_name AS coach_name
       FROM matches m
       JOIN bookings b ON b.id = m.booking_id
       JOIN players p ON p.id = m.player1_id
       JOIN users coach ON coach.id = b.coach_id
      WHERE m.id = $1`,
    [matchId],
  );
  const match = matchRows[0];

  console.clear?.();
  console.log('='.repeat(100));
  console.log(
    `Partido ${match.id}  ·  ${match.player1_name} vs ${match.player2_label}  ·  entrenador: ${match.coach_name}`,
  );
  console.log(
    `formato=${match.format}  captureMode=${match.capture_mode}  status=${match.status}  noAd=${fmtBool(match.no_ad)}`,
  );
  console.log('='.repeat(100));

  const { rows: points } = await client.query(
    `SELECT sequence_number, won_by, detail, first_serve_in, serve_direction, error_direction,
            rally_length, net_approach, is_return_error, lado, shot_type
       FROM match_point_events
      WHERE match_id = $1
      ORDER BY sequence_number`,
    [matchId],
  );

  if (points.length === 0) {
    console.log('(todavía no hay puntos capturados)');
  } else {
    const header = ['#', 'ganó', 'detail', '1sv', 'saque', 'lado', 'shotType', 'red', 'errDir', 'rally', 'devol.'];
    const colWidths = [3, 6, 26, 4, 7, 7, 20, 4, 7, 6, 6];
    const printRow = (cells) => console.log(cells.map((c, i) => String(c ?? '—').padEnd(colWidths[i])).join(' '));
    printRow(header);
    console.log('-'.repeat(100));
    for (const p of points) {
      printRow([
        p.sequence_number,
        p.won_by,
        p.detail,
        fmtBool(p.first_serve_in),
        p.serve_direction,
        p.lado,
        p.shot_type,
        fmtBool(p.net_approach),
        p.error_direction,
        p.rally_length,
        fmtBool(p.is_return_error),
      ]);
    }
  }

  const tallies = {};
  for (const p of points) {
    const key = `${p.won_by} · ${p.detail ?? 'sin detail'}`;
    tallies[key] = (tallies[key] ?? 0) + 1;
  }
  console.log('-'.repeat(100));
  console.log('Conteo por (ganador · detail):');
  for (const [key, count] of Object.entries(tallies).sort()) {
    console.log(`  ${count.toString().padStart(3)}  ${key}`);
  }
  console.log(`Total: ${points.length} puntos`);
}

if (watch) {
  console.log('Modo --watch: refrescando cada 2s. Ctrl+C para salir.\n');
  while (true) {
    await printOnce();
    await new Promise((r) => setTimeout(r, 2000));
  }
} else {
  await printOnce();
  await client.end();
}
