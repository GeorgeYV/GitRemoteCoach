import type { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { NotFoundError } from '../lib/errors.js';
import type {
  AgeCategory,
  CountryCode,
  TournamentReadyForCoachPayout,
  TournamentSearchResult,
  TournamentSummary,
  UnclaimedTournament,
} from '../types.js';

type Queryable = Pool | PoolClient;

/** create() Y update() la usan — DELETE primero (no-op para un torneo recién insertado, real
 * reemplazo al editar) para que sea un "set" de verdad, mismo patrón que
 * coachRepository.setCoachAgeCategories. */
async function setAgeCategories(tournamentId: string, ageCategories: AgeCategory[], db: Queryable): Promise<void> {
  await db.query(`DELETE FROM tournament_age_categories WHERE tournament_id = $1`, [tournamentId]);
  if (ageCategories.length === 0) return;
  const values = ageCategories.map((_, i) => `($1, $${i + 2})`).join(', ');
  await db.query(`INSERT INTO tournament_age_categories (tournament_id, age_category) VALUES ${values}`, [
    tournamentId,
    ...ageCategories,
  ]);
}

/** pg devuelve un objeto Date para columnas DATE (no hay setTypeParser registrado, ver el mismo
 * comentario en playerRepository.mapPlayerRow) — normaliza a 'YYYY-MM-DD' tanto si llega como
 * Date (Postgres real) como si ya llega string (pg-mem, usado por los smoke tests). Sin esto,
 * comparar tournaments.start_date recién leído contra un 'YYYY-MM-DD' tipeado a mano (ver
 * clubService.updateTournamentForClub) nunca daría igual aunque no haya cambiado nada. */
function normalizeDate(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

// Un torneo con al menos una reserva que no fue descartada (rechazada/expirada/fallida/cancelada)
// tiene una fecha real de la que depende un padre — ver decisión #47 y
// clubService.updateTournamentForClub, que bloquea el cambio de fechas mientras esto sea cierto.
const NON_BLOCKING_BOOKING_STATUSES = ['rejected', 'expired', 'payment_failed', 'cancelled'];

/** Segunda consulta + merge en memoria en vez de una subconsulta correlacionada dentro del SELECT
 * (array_agg(...) WHERE tac.tournament_id = t.id): pg-mem, que usan los smoke tests, no resuelve
 * una referencia a la tabla externa (t.id) dentro de una subconsulta, ni en el SELECT ni en el
 * WHERE (un JOIN normal sí — ver el filtro de ageCategory en search, más abajo). Con listas de a
 * lo sumo 25 torneos esto no pesa. IN (...) con un placeholder por id en vez de "= ANY($1)" —
 * mismo motivo/precedente que bookingRepository.transitionStatus. */
async function fetchAgeCategoriesByTournament(
  tournamentIds: string[],
  db: Queryable,
): Promise<Map<string, AgeCategory[]>> {
  const byTournament = new Map<string, AgeCategory[]>();
  if (tournamentIds.length === 0) return byTournament;
  const placeholders = tournamentIds.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await db.query(
    `SELECT tournament_id, age_category FROM tournament_age_categories
     WHERE tournament_id IN (${placeholders}) ORDER BY age_category`,
    tournamentIds,
  );
  for (const row of rows) {
    const existing = byTournament.get(row.tournament_id) ?? [];
    existing.push(row.age_category);
    byTournament.set(row.tournament_id, existing);
  }
  return byTournament;
}

function mapSearchRow(row: any, ageCategories: AgeCategory[]): TournamentSearchResult {
  return {
    id: row.id,
    name: row.name,
    venue: row.venue,
    city: row.city,
    country: row.country,
    ageCategories,
    startDate: row.start_date,
    endDate: row.end_date,
  };
}

/** CoachTournamentSearchScreen/ParentHomeScreen: descubrimiento público de torneos activos —
 * mismo patrón de condiciones ILIKE que coachRepository.search. status IN ('scheduled',
 * 'in_progress') (idx_tournaments_active) es la intención original, pero nada en la app todavía
 * transiciona el status de un torneo (sin job ni endpoint que lo mueva a 'completed'/'cancelled'),
 * así que por sí solo nunca excluye nada — nos apoyamos también en end_date para no listar
 * torneos cuyas fechas ya pasaron. country filtra por el país del club (toggle "mi país"/"todos"
 * de ambas pantallas) — opcional, sin él devuelve todos los países. LEFT JOIN (no JOIN) porque un
 * torneo sin reclamar (club_id NULL, ver decisión #36) también debe aparecer aquí — su
 * ciudad/país salen de las columnas propias del torneo en vez del club vía COALESCE.
 * (t.club_id IS NULL OR c.verification_status = 'approved'): mismo filtro que ya aplica
 * coachRepository.search sobre coach_profiles.verification_status — un club recién autoregistrado
 * y sin revisar puede existir y hasta tener torneos, pero no aparecen acá hasta que un
 * platform_admin lo apruebe (ver decisión #41). Un torneo sin reclamar sigue visible igual.
 * ageCategory filtra con un INNER JOIN a tournament_age_categories (ver decisión #45) — opcional,
 * sin él devuelve torneos de cualquier categoría (incluyendo los que todavía no declaran
 * ninguna). Es un JOIN y no un EXISTS/subconsulta correlacionada porque pg-mem (usado por los
 * smoke tests) no resuelve una referencia a la tabla externa (t.id) dentro de una subconsulta,
 * ni en el SELECT ni en el WHERE — un JOIN normal sí, igual que los de listByClub. COALESCE
 * (t.city, c.city) — no al revés — porque la sede real de un torneo puede no ser la ciudad
 * registrada del club que lo organiza; t.city queda poblada siempre para un torneo nuevo
 * (obligatoria al crear) y solo cae al club para las filas de antes de esa decisión. */
export async function search(
  params: { query?: string; country?: CountryCode; ageCategory?: AgeCategory },
  db: Queryable = pool,
): Promise<TournamentSearchResult[]> {
  const conditions: string[] = [
    `t.status IN ('scheduled', 'in_progress')`,
    `t.end_date >= CURRENT_DATE`,
    `(t.club_id IS NULL OR c.verification_status = 'approved')`,
  ];
  const values: unknown[] = [];

  if (params.query) {
    values.push(`%${params.query}%`);
    conditions.push(
      `(t.name ILIKE $${values.length} OR t.venue ILIKE $${values.length} OR COALESCE(t.city, c.city) ILIKE $${values.length})`,
    );
  }

  if (params.country) {
    values.push(params.country);
    conditions.push(`COALESCE(c.country, t.country) = $${values.length}`);
  }

  let ageCategoryJoin = '';
  if (params.ageCategory) {
    values.push(params.ageCategory);
    ageCategoryJoin = `JOIN tournament_age_categories tac_filter
       ON tac_filter.tournament_id = t.id AND tac_filter.age_category = $${values.length}`;
  }

  const { rows } = await db.query(
    `SELECT t.id, t.name, t.venue, COALESCE(t.city, c.city) AS city, COALESCE(c.country, t.country) AS country,
            t.start_date, t.end_date
     FROM tournaments t
     LEFT JOIN clubs c ON c.id = t.club_id
     ${ageCategoryJoin}
     WHERE ${conditions.join(' AND ')}
     ORDER BY t.start_date
     LIMIT 25`,
    values,
  );
  const ageCategoriesByTournament = await fetchAgeCategoriesByTournament(
    rows.map((r) => r.id),
    db,
  );
  return rows.map((row) => mapSearchRow(row, ageCategoriesByTournament.get(row.id) ?? []));
}

function mapSummaryRow(row: any, ageCategories: AgeCategory[]): TournamentSummary {
  return {
    id: row.id,
    clubId: row.club_id,
    name: row.name,
    venue: row.venue,
    city: row.city,
    ageCategories,
    startDate: normalizeDate(row.start_date),
    endDate: normalizeDate(row.end_date),
    status: row.status,
    officialCoachCount: Number(row.official_coach_count),
    pendingCommissionAmount: row.pending_commission_amount,
    hasActiveBookings: !!row.has_active_bookings,
  };
}

// Compartido por listByClub y getSummaryById — mismo torneo, la única diferencia es el WHERE.
// JOINs a subconsultas derivadas (ya agregadas) en vez de JOIN directo + GROUP BY, para no
// inflar la suma de comisiones con el producto cartesiano de tags × bookings.
// COALESCE(t.city, c.city) — mismo motivo que search — solo cae al club para torneos creados
// antes de la decisión #45. has_active_bookings alimenta el bloqueo de fechas de la decisión #47.
const SUMMARY_SELECT = `
  SELECT t.id, t.club_id, t.name, t.venue, COALESCE(t.city, c.city) AS city, t.start_date, t.end_date, t.status,
         COALESCE(tag_counts.official_coach_count, 0) AS official_coach_count,
         COALESCE(commission_totals.pending_commission_amount, 0) AS pending_commission_amount,
         (active_bookings.tournament_id IS NOT NULL) AS has_active_bookings
  FROM tournaments t
  LEFT JOIN clubs c ON c.id = t.club_id
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
  LEFT JOIN (
    SELECT DISTINCT tournament_id
    FROM bookings
    WHERE status NOT IN (${NON_BLOCKING_BOOKING_STATUSES.map((_, i) => `$${i + 1}`).join(', ')})
  ) active_bookings ON active_bookings.tournament_id = t.id
`;

/** ClubTournamentListScreen: torneos del club con conteo de coaches oficiales y comisión
 * pendiente de liquidar por torneo. */
export async function listByClub(clubId: string, db: Queryable = pool): Promise<TournamentSummary[]> {
  const { rows } = await db.query(
    `${SUMMARY_SELECT} WHERE t.club_id = $${NON_BLOCKING_BOOKING_STATUSES.length + 1} ORDER BY t.start_date DESC`,
    [...NON_BLOCKING_BOOKING_STATUSES, clubId],
  );
  const ageCategoriesByTournament = await fetchAgeCategoriesByTournament(
    rows.map((r) => r.id),
    db,
  );
  return rows.map((row) => mapSummaryRow(row, ageCategoriesByTournament.get(row.id) ?? []));
}

/** ClubCreateTournamentScreen (editar): estado actual de un torneo puntual — create()/update() lo
 * usan para devolver el TournamentSummary completo después de escribir, y
 * clubService.updateTournamentForClub lo usa antes de escribir para decidir si el cambio de
 * fechas está permitido (ver decisión #47). null si no existe. */
export async function getSummaryById(tournamentId: string, db: Queryable = pool): Promise<TournamentSummary | null> {
  const { rows } = await db.query(
    `${SUMMARY_SELECT} WHERE t.id = $${NON_BLOCKING_BOOKING_STATUSES.length + 1}`,
    [...NON_BLOCKING_BOOKING_STATUSES, tournamentId],
  );
  if (rows.length === 0) return null;
  const ageCategoriesByTournament = await fetchAgeCategoriesByTournament([rows[0].id], db);
  return mapSummaryRow(rows[0], ageCategoriesByTournament.get(rows[0].id) ?? []);
}

export interface TournamentBasicInfo {
  id: string;
  name: string;
  clubId: string | null;
}

/** tournamentReportService: validar que el torneo exista y saber a qué club avisarle (si tiene
 * uno) al crear un reporte — no hace falta traer más que esto. */
export async function getBasicInfo(tournamentId: string, db: Queryable = pool): Promise<TournamentBasicInfo | null> {
  const { rows } = await db.query(`SELECT id, name, club_id FROM tournaments WHERE id = $1`, [tournamentId]);
  if (rows.length === 0) return null;
  return { id: rows[0].id, name: rows[0].name, clubId: rows[0].club_id };
}

export interface TournamentCommissionInfo {
  tournamentId: string;
  clubId: string | null;
  startDate: string;
  endDate: string;
  /** commission_rate_override si existe, si no default_commission_rate del club, si no 0
   * (torneo sin reclamar todavía — nadie cobra la parte de "club", ver decisión #36). */
  clubCommissionRate: number;
}

export async function getTournamentCommissionInfo(
  tournamentId: string,
  db: Queryable = pool,
): Promise<TournamentCommissionInfo> {
  const { rows } = await db.query(
    `SELECT t.id AS tournament_id, t.club_id, t.start_date, t.end_date,
            COALESCE(t.commission_rate_override, c.default_commission_rate, 0) AS club_commission_rate
     FROM tournaments t
     LEFT JOIN clubs c ON c.id = t.club_id
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

/** ClubCreateTournamentScreen: un torneo nuevo siempre arranca 'scheduled'. city es la sede real
 * del torneo (ver decisión #45), no la ciudad del club. Devuelve vía getSummaryById en vez de
 * armar el objeto a mano (como antes) — mismo camino que update(), así ambos quedan consistentes
 * (fechas normalizadas, hasActiveBookings) sin duplicar esa lógica. */
export async function create(
  params: { clubId: string; name: string; venue: string; city: string; ageCategories: AgeCategory[]; startDate: string; endDate: string },
  db: Queryable = pool,
): Promise<TournamentSummary> {
  const { rows } = await db.query(
    `INSERT INTO tournaments (club_id, name, venue, city, start_date, end_date, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'scheduled')
     RETURNING id`,
    [params.clubId, params.name, params.venue, params.city, params.startDate, params.endDate],
  );
  const tournamentId = rows[0].id;
  await setAgeCategories(tournamentId, params.ageCategories, db);
  const summary = await getSummaryById(tournamentId, db);
  if (!summary) throw new NotFoundError('Tournament', tournamentId);
  return summary;
}

/** ClubCreateTournamentScreen (editar) — clubService.updateTournamentForClub ya validó que las
 * fechas se puedan cambiar (o que no cambiaron) antes de llamar acá; este repositorio no repite
 * esa validación (ver decisión #47). */
export async function update(
  tournamentId: string,
  params: { name: string; venue: string; city: string; ageCategories: AgeCategory[]; startDate: string; endDate: string },
  db: Queryable = pool,
): Promise<TournamentSummary> {
  await db.query(
    `UPDATE tournaments SET name = $2, venue = $3, city = $4, start_date = $5, end_date = $6 WHERE id = $1`,
    [tournamentId, params.name, params.venue, params.city, params.startDate, params.endDate],
  );
  await setAgeCategories(tournamentId, params.ageCategories, db);
  const summary = await getSummaryById(tournamentId, db);
  if (!summary) throw new NotFoundError('Tournament', tournamentId);
  return summary;
}

function mapUnclaimedRow(row: any): UnclaimedTournament {
  return {
    id: row.id,
    name: row.name,
    venue: row.venue,
    city: row.city,
    country: row.country,
    startDate: row.start_date,
    endDate: row.end_date,
  };
}

/** PlatformAdminTournamentScreen: platform_admin siembra un torneo con demanda conocida antes de
 * que algún club se anime a crearlo — sin club_id, con su propia ciudad/país (ver decisión #36). */
export async function createUnclaimed(
  params: { name: string; venue: string; city: string; country: CountryCode; startDate: string; endDate: string },
  db: Queryable = pool,
): Promise<UnclaimedTournament> {
  const { rows } = await db.query(
    `INSERT INTO tournaments (club_id, name, venue, city, country, start_date, end_date, status)
     VALUES (NULL, $1, $2, $3, $4, $5, $6, 'scheduled')
     RETURNING id, name, venue, city, country, start_date, end_date`,
    [params.name, params.venue, params.city, params.country, params.startDate, params.endDate],
  );
  return mapUnclaimedRow(rows[0]);
}

/** ClubTournamentListScreen, sección "Torneos disponibles para reclamar" — torneos sin club en
 * el país del club que consulta. */
export async function listUnclaimed(country: CountryCode, db: Queryable = pool): Promise<UnclaimedTournament[]> {
  const { rows } = await db.query(
    `SELECT id, name, venue, city, country, start_date, end_date
     FROM tournaments
     WHERE club_id IS NULL AND country = $1
     ORDER BY start_date`,
    [country],
  );
  return rows.map(mapUnclaimedRow);
}

/** Reclamar un torneo sin club — WHERE club_id IS NULL evita que dos clubes lo reclamen a la vez
 * (el segundo en llegar recibe 0 filas y el route responde 409). */
export async function claim(tournamentId: string, clubId: string, db: Queryable = pool): Promise<boolean> {
  const { rowCount } = await db.query(`UPDATE tournaments SET club_id = $2 WHERE id = $1 AND club_id IS NULL`, [
    tournamentId,
    clubId,
  ]);
  return (rowCount ?? 0) > 0;
}

export interface UncoveredTournament {
  id: string;
  name: string;
  venue: string;
  city: string;
  country: CountryCode | null;
  startDate: string;
  endDate: string;
}

function mapUncoveredRow(row: any): UncoveredTournament {
  return {
    id: row.id,
    name: row.name,
    venue: row.venue,
    city: row.city,
    country: row.country,
    startDate: normalizeDate(row.start_date),
    endDate: normalizeDate(row.end_date),
  };
}

/** jobs/recruitCoachesForUncoveredTournaments (decisión #50): torneos vigentes, creados hace más
 * de coachRecruitmentEmailDelayDays, que arrancan en al menos coachRecruitmentEmailMinDaysBeforeStart,
 * sin ningún coach_tournament_rates cargado todavía y que todavía no recibieron este correo.
 * LEFT JOIN a una subconsulta agregada (no NOT EXISTS/subconsulta correlacionada) por el mismo
 * motivo que el resto del archivo: pg-mem (smoke tests) no resuelve una referencia a la tabla
 * externa (t.id) dentro de una subconsulta — un JOIN normal sí. Mismo COALESCE(t.city, c.city) /
 * COALESCE(c.country, t.country) que search(), y el mismo filtro de club aprobado (un torneo de un
 * club todavía sin revisar no debería generarle correos a nadie). */
export async function findUncoveredTournamentsNeedingRecruitmentEmail(
  createdBefore: Date,
  /** 'YYYY-MM-DD' — se compara contra t.start_date (DATE), no un TIMESTAMPTZ como createdBefore. */
  startsAfter: string,
  db: Queryable = pool,
): Promise<UncoveredTournament[]> {
  const { rows } = await db.query(
    `SELECT t.id, t.name, t.venue, COALESCE(t.city, c.city) AS city, COALESCE(c.country, t.country) AS country,
            t.start_date, t.end_date
     FROM tournaments t
     LEFT JOIN clubs c ON c.id = t.club_id
     LEFT JOIN (SELECT DISTINCT tournament_id FROM coach_tournament_rates) configured
       ON configured.tournament_id = t.id
     WHERE t.status IN ('scheduled', 'in_progress')
       AND t.end_date >= CURRENT_DATE
       AND t.coach_recruitment_email_sent_at IS NULL
       AND t.created_at <= $1
       AND t.start_date >= $2
       AND configured.tournament_id IS NULL
       AND (t.club_id IS NULL OR c.verification_status = 'approved')`,
    [createdBefore, startsAfter],
  );
  return rows.map(mapUncoveredRow);
}

export async function markRecruitmentEmailSent(tournamentId: string, db: Queryable = pool): Promise<void> {
  await db.query(`UPDATE tournaments SET coach_recruitment_email_sent_at = now() WHERE id = $1`, [tournamentId]);
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

/** Lista propia (no reutiliza findTournamentsEndedWithoutFullSettlement): esa está filtrada por
 * club_commission_status, una señal de "listo" distinta de coach_payout_id — un torneo sin club
 * (que nunca liquida comisión, ver settleTournamentCommissions) igual le debe pagar a su
 * entrenador, y uno que ya salió de la lista de comisiones puede seguir debiendo el payout. */
export async function findTournamentsEndedWithoutCoachPayout(db: Queryable = pool): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT DISTINCT t.id
     FROM tournaments t
     JOIN bookings b ON b.tournament_id = t.id
     WHERE t.end_date < CURRENT_DATE
       AND b.status = 'completed'
       AND b.coach_payout_id IS NULL`,
  );
  return rows.map((r: any) => r.id);
}

/** PlatformAdminPayoutsScreen: mismo criterio que findTournamentsEndedWithoutCoachPayout, con
 * nombre/fecha para mostrar el botón "Liquidar" manual (jobs/settleCoachPayoutsRunner.ts es el
 * mismo cálculo sin programar todavía, ver decisión de fase 1 — esto le da al admin una forma de
 * dispararlo desde la app mientras tanto). */
export async function findTournamentsEndedWithoutCoachPayoutWithNames(
  db: Queryable = pool,
): Promise<TournamentReadyForCoachPayout[]> {
  const { rows } = await db.query(
    `SELECT DISTINCT t.id, t.name, t.end_date
     FROM tournaments t
     JOIN bookings b ON b.tournament_id = t.id
     WHERE t.end_date < CURRENT_DATE
       AND b.status = 'completed'
       AND b.coach_payout_id IS NULL
     ORDER BY t.end_date DESC`,
  );
  return rows.map((r: any) => ({ id: r.id, name: r.name, endDate: r.end_date }));
}
