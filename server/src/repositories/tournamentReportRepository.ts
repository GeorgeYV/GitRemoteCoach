import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import type { TournamentReport } from '../types.js';

type Queryable = Pool | PoolClient;

const UNIQUE_VIOLATION = '23505';

function mapRow(row: any): TournamentReport {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    tournamentName: row.tournament_name,
    clubId: row.club_id,
    clubName: row.club_name,
    reportedBy: row.reported_by,
    reporterName: row.reporter_name,
    message: row.message,
    createdAt: row.created_at,
  };
}

// clubName solo aporta algo en la cola de platform_admin (todos los clubes) — en la del propio
// club siempre es el suyo, pero no vale la pena una segunda consulta solo para omitirlo ahí.
const SELECT_WITH_JOINS = `
  SELECT tr.id, tr.tournament_id, t.name AS tournament_name, t.club_id, c.name AS club_name,
         tr.reported_by, u.full_name AS reporter_name, tr.message, tr.created_at
  FROM tournament_reports tr
  JOIN tournaments t ON t.id = tr.tournament_id
  LEFT JOIN clubs c ON c.id = t.club_id
  JOIN users u ON u.id = tr.reported_by
`;

/** Reportar un posible error de datos (fecha, ciudad, etc.) en un torneo — ver decisión #46.
 * No valida que tournamentId exista: eso ya lo hizo tournamentReportService antes de llamar acá
 * (necesita el club_id del torneo para decidir a quién notificar, así que ya lo trae leído). */
export async function create(
  params: { tournamentId: string; reportedBy: string; message: string },
  db: Queryable = pool,
): Promise<TournamentReport> {
  try {
    const { rows } = await db.query(
      `INSERT INTO tournament_reports (tournament_id, reported_by, message) VALUES ($1, $2, $3) RETURNING id`,
      [params.tournamentId, params.reportedBy, params.message],
    );
    const { rows: joined } = await db.query(`${SELECT_WITH_JOINS} WHERE tr.id = $1`, [rows[0].id]);
    return mapRow(joined[0]);
  } catch (err: any) {
    // Única violación posible: idx_tournament_reports_no_duplicate_open.
    if (err.code === UNIQUE_VIOLATION) {
      throw new ConflictError(
        'Ya reportaste un posible error en este torneo — sigue pendiente de revisión',
        'duplicate_report',
      );
    }
    throw err;
  }
}

/** ClubTournamentListScreen: reportes abiertos sobre torneos de este club. */
export async function listOpenForClub(clubId: string, db: Queryable = pool): Promise<TournamentReport[]> {
  const { rows } = await db.query(
    `${SELECT_WITH_JOINS} WHERE t.club_id = $1 AND tr.status = 'open' ORDER BY tr.created_at DESC`,
    [clubId],
  );
  return rows.map(mapRow);
}

/** PlatformAdminTournamentScreen: TODOS los reportes abiertos, de cualquier club — respaldo si el
 * club no reacciona (o el torneo no tiene club, ver decisión #36). */
export async function listOpenForAdmin(db: Queryable = pool): Promise<TournamentReport[]> {
  const { rows } = await db.query(`${SELECT_WITH_JOINS} WHERE tr.status = 'open' ORDER BY tr.created_at DESC`);
  return rows.map(mapRow);
}

/** Marca un reporte como resuelto. `clubId`, si viene, restringe atómicamente el UPDATE a
 * reportes de torneos de ese club (camino del club_admin) — sin él, cualquier reporte abierto
 * (camino del platform_admin). 0 filas puede significar que no existe, que ya estaba resuelto, o
 * que no pertenece a ese club — no vale la pena distinguir esos tres casos para esta acción. */
export async function resolve(
  id: string,
  resolvedBy: string,
  clubId: string | undefined,
  db: Queryable = pool,
): Promise<TournamentReport> {
  const values: unknown[] = [id, resolvedBy];
  let clubCondition = '';
  if (clubId) {
    values.push(clubId);
    clubCondition = `AND tournament_id IN (SELECT id FROM tournaments WHERE club_id = $${values.length})`;
  }
  // resolved_at se fija acá explícito, no solo vía trg_tournament_reports_guard_resolve — pg-mem
  // (smoke tests) no ejecuta triggers/PL-pgSQL (ver test/setupDb.ts), así que sin esto la fila
  // quedaría con status='resolved' y resolved_at NULL, violando chk_tournament_reports_resolved_at.
  const { rows } = await db.query(
    `UPDATE tournament_reports SET status = 'resolved', resolved_by = $2, resolved_at = now()
     WHERE id = $1 AND status = 'open' ${clubCondition}
     RETURNING id`,
    values,
  );
  if (rows.length === 0) throw new NotFoundError('TournamentReport', id);
  const { rows: joined } = await db.query(`${SELECT_WITH_JOINS} WHERE tr.id = $1`, [id]);
  return mapRow(joined[0]);
}
