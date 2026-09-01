import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { NotFoundError } from '../lib/errors.js';
import type { CountryCode, TournamentCreationRequest } from '../types.js';

type Queryable = Pool | PoolClient;

function mapRow(row: any): TournamentCreationRequest {
  return {
    id: row.id,
    requestedBy: row.requested_by,
    requesterName: row.requester_name,
    tournamentName: row.tournament_name,
    city: row.city,
    country: row.country,
    note: row.note,
    createdTournamentId: row.created_tournament_id,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

const SELECT_WITH_JOIN = `
  SELECT tcr.id, tcr.requested_by, u.full_name AS requester_name, tcr.tournament_name, tcr.city,
         tcr.country, tcr.note, tcr.created_tournament_id, tcr.resolved_by, tcr.resolved_at,
         tcr.created_at
  FROM tournament_creation_requests tcr
  JOIN users u ON u.id = tcr.requested_by
`;

/** Pedir que se agregue un torneo que no existe (decisión #55) — sin validar duplicados: a
 * diferencia de tournament_reports (que sí bloquea un segundo reporte abierto del mismo torneo),
 * acá no hay tournament_id contra el cual comparar, así que dos pedidos "parecidos" simplemente
 * quedan como dos filas separadas — platform_admin los ve juntos en la cola y decide. */
export async function create(
  params: { requestedBy: string; tournamentName: string; city: string; country: CountryCode; note?: string },
  db: Queryable = pool,
): Promise<TournamentCreationRequest> {
  const { rows } = await db.query(
    `INSERT INTO tournament_creation_requests (requested_by, tournament_name, city, country, note)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [params.requestedBy, params.tournamentName, params.city, params.country, params.note ?? null],
  );
  const { rows: joined } = await db.query(`${SELECT_WITH_JOIN} WHERE tcr.id = $1`, [rows[0].id]);
  return mapRow(joined[0]);
}

/** PlatformAdminTournamentScreen: todas las pendientes, el único que las consulta (no hay
 * club/federación identificado todavía al que mostrárselas). */
export async function listPending(db: Queryable = pool): Promise<TournamentCreationRequest[]> {
  const { rows } = await db.query(`${SELECT_WITH_JOIN} WHERE tcr.resolved_at IS NULL ORDER BY tcr.created_at`);
  return rows.map(mapRow);
}

/** Resuelve un pedido — createdTournamentId presente = se creó el torneo (fulfillsRequestId en
 * tournamentService.createUnclaimedTournament), null = se descartó sin crear nada. 0 filas puede
 * significar que no existe o que ya estaba resuelto — no vale la pena distinguirlos acá. */
export async function resolve(
  id: string,
  resolvedBy: string,
  createdTournamentId: string | null,
  db: Queryable = pool,
): Promise<TournamentCreationRequest> {
  const { rows } = await db.query(
    `UPDATE tournament_creation_requests
     SET resolved_by = $2, resolved_at = now(), created_tournament_id = $3
     WHERE id = $1 AND resolved_at IS NULL
     RETURNING id`,
    [id, resolvedBy, createdTournamentId],
  );
  if (rows.length === 0) throw new NotFoundError('TournamentCreationRequest', id);
  const { rows: joined } = await db.query(`${SELECT_WITH_JOIN} WHERE tcr.id = $1`, [id]);
  return mapRow(joined[0]);
}
