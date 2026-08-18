import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { NotFoundError } from '../lib/errors.js';
import type { TournamentSearchResult, TournamentSummary } from '../types.js';

type Queryable = Pool | PoolClient;

function mapSearchRow(row: any): TournamentSearchResult {
  return {
    id: row.id,
    name: row.name,
    venue: row.venue,
    city: row.city,
    startDate: row.start_date,
    endDate: row.end_date,
  };
}

/** CoachTournamentSearchScreen/ParentHomeScreen: descubrimiento público de torneos activos —
 * mismo patrón de condiciones ILIKE que coachRepository.search. status IN ('scheduled',
 * 'in_progress') (idx_tournaments_active) es la intención original, pero nada en la app todavía
 * transiciona el status de un torneo (sin job ni endpoint que lo mueva a 'completed'/'cancelled'),
 * así que por sí solo nunca excluye nada — nos apoyamos también en end_date para no listar
 * torneos cuyas fechas ya pasaron. */
export async function search(params: { query?: string }, db: Queryable = pool): Promise<TournamentSearchResult[]> {
  const conditions: string[] = [`t.status IN ('scheduled', 'in_progress')`, `t.end_date >= CURRENT_DATE`];
  const values: unknown[] = [];

  if (params.query) {
    values.push(`%${params.query}%`);
    conditions.push(`(t.name ILIKE $${values.length} OR t.venue ILIKE $${values.length} OR c.city ILIKE $${values.length})`);
  }

  const { rows } = await db.query(
    `SELECT t.id, t.name, t.venue, c.city, t.start_date, t.end_date
     FROM tournaments t
     JOIN clubs c ON c.id = t.club_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY t.start_date
     LIMIT 25`,
    values,
  );
  return rows.map(mapSearchRow);
}

function mapSummaryRow(row: any): TournamentSummary {
  return {
    id: row.id,
    clubId: row.club_id,
    name: row.name,
    venue: row.venue,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    officialCoachCount: Number(row.official_coach_count),
    pendingCommissionAmount: row.pending_commission_amount,
  };
}

/** ClubTournamentListScreen: torneos del club con conteo de coaches oficiales y comisión
 * pendiente de liquidar por torneo. JOINs a subconsultas derivadas (ya agregadas) en vez de
 * JOIN directo + GROUP BY, para no inflar la suma de comisiones con el producto cartesiano
 * de tags × bookings. */
export async function listByClub(clubId: string, db: Queryable = pool): Promise<TournamentSummary[]> {
  const { rows } = await db.query(
    `SELECT t.id, t.club_id, t.name, t.venue, t.start_date, t.end_date, t.status,
            COALESCE(tag_counts.official_coach_count, 0) AS official_coach_count,
            COALESCE(commission_totals.pending_commission_amount, 0) AS pending_commission_amount
     FROM tournaments t
     LEFT JOIN (
       SELECT tournament_id, COUNT(*) AS official_coach_count
       FROM tournament_coach_tags
       GROUP BY tournament_id
     ) tag_counts ON tag_counts.tournament_id = t.id
     LEFT JOIN (
       SELECT tournament_id, SUM(club_commission_amount) AS pending_commission_amount
       FROM bookings
       WHERE status = 'completed' AND club_commission_status = 'generated'
       GROUP BY tournament_id
     ) commission_totals ON commission_totals.tournament_id = t.id
     WHERE t.club_id = $1
     ORDER BY t.start_date DESC`,
    [clubId],
  );
  return rows.map(mapSummaryRow);
}

export interface TournamentCommissionInfo {
  tournamentId: string;
  clubId: string;
  startDate: string;
  endDate: string;
  /** commission_rate_override si existe, si no default_commission_rate del club. */
  clubCommissionRate: number;
}

export async function getTournamentCommissionInfo(
  tournamentId: string,
  db: Queryable = pool,
): Promise<TournamentCommissionInfo> {
  const { rows } = await db.query(
    `SELECT t.id AS tournament_id, t.club_id, t.start_date, t.end_date,
            COALESCE(t.commission_rate_override, c.default_commission_rate) AS club_commission_rate
     FROM tournaments t
     JOIN clubs c ON c.id = t.club_id
     WHERE t.id = $1`,
    [tournamentId],
  );
  if (rows.length === 0) throw new NotFoundError('Tournament', tournamentId);
  return {
    tournamentId: rows[0].tournament_id,
    clubId: rows[0].club_id,
    startDate: rows[0].start_date,
    endDate: rows[0].end_date,
    clubCommissionRate: Number(rows[0].club_commission_rate),
  };
}

/** ClubTournamentDetailScreen: comisión de club generada y todavía sin liquidar para este torneo,
 * de solo lectura (a diferencia de bookingRepository.findPendingCommissionsForTournament, que
 * bloquea las filas con FOR UPDATE porque se usa dentro de settlementService al liquidar). */
export async function getPendingCommissionAmount(tournamentId: string, db: Queryable = pool): Promise<string> {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(club_commission_amount), 0) AS amount
     FROM bookings
     WHERE tournament_id = $1 AND status = 'completed' AND club_commission_status = 'generated'`,
    [tournamentId],
  );
  return rows[0].amount;
}

/** ClubCreateTournamentScreen: un torneo nuevo siempre arranca 'scheduled' y sin coaches oficiales
 * ni comisión pendiente todavía, así que no hace falta ir a buscarlos con las subqueries de
 * listByClub. */
export async function create(
  params: { clubId: string; name: string; venue: string; startDate: string; endDate: string },
  db: Queryable = pool,
): Promise<TournamentSummary> {
  const { rows } = await db.query(
    `INSERT INTO tournaments (club_id, name, venue, start_date, end_date, status)
     VALUES ($1, $2, $3, $4, $5, 'scheduled')
     RETURNING id, club_id, name, venue, start_date, end_date, status`,
    [params.clubId, params.name, params.venue, params.startDate, params.endDate],
  );
  const row = rows[0];
  return {
    id: row.id,
    clubId: row.club_id,
    name: row.name,
    venue: row.venue,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    officialCoachCount: 0,
    pendingCommissionAmount: '0',
  };
}

export async function findTournamentsEndedWithoutFullSettlement(db: Queryable = pool): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT DISTINCT t.id
     FROM tournaments t
     JOIN bookings b ON b.tournament_id = t.id
     WHERE t.end_date < CURRENT_DATE
       AND b.status = 'completed'
       AND b.club_commission_status = 'generated'`,
  );
  return rows.map((r: any) => r.id);
}
