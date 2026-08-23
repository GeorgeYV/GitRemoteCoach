import type { Pool } from 'pg';

export interface Fixtures {
  clubId: string;
  clubAdminUserId: string;
  tournamentId: string;
  parentUserId: string;
  coachAUserId: string;
  coachBUserId: string;
  playerId: string;
  /** Torneo activo (status scheduled, fechas futuras) — a diferencia de tournamentId, que es
   * 'completed' a propósito para probar liquidación. Usado por el escenario de GET /tournaments. */
  activeTournamentId: string;
  /** 'platform_admin' no es auto-registrable (ver SELF_SERVICE_ROLES en authService), así que se
   * sembra directo — igual que club_admin. Usado para probar la revisión de documentos. */
  platformAdminUserId: string;
}

const CLUB_ID = '00000000-0000-0000-0000-000000000001';
const TOURNAMENT_ID = '00000000-0000-0000-0000-000000000002';
const PARENT_ID = '00000000-0000-0000-0000-000000000003';
const COACH_A_ID = '00000000-0000-0000-0000-000000000004';
const COACH_B_ID = '00000000-0000-0000-0000-000000000005';
const PLAYER_ID = '00000000-0000-0000-0000-000000000006';
const CLUB_ADMIN_ID = '00000000-0000-0000-0000-000000000007';
const CLUB_2_ID = '00000000-0000-0000-0000-000000000008';
const ACTIVE_TOURNAMENT_ID = '00000000-0000-0000-0000-000000000009';
const PLATFORM_ADMIN_ID = '00000000-0000-0000-0000-000000000010';

export async function seedFixtures(pool: Pool): Promise<Fixtures> {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, full_name, primary_role) VALUES
     ($1, 'maria@example.com', 'x', 'María Guardián', 'parent'),
     ($2, 'carlos@example.com', 'x', 'Carlos Medina', 'coach'),
     ($3, 'ana@example.com', 'x', 'Ana Beltrán', 'coach'),
     ($4, 'club.bosques@example.com', 'x', 'Laura Ibarra', 'club_admin'),
     ($5, 'admin@example.com', 'x', 'Admin Plataforma', 'platform_admin')`,
    [PARENT_ID, COACH_A_ID, COACH_B_ID, CLUB_ADMIN_ID, PLATFORM_ADMIN_ID],
  );

  await pool.query(
    `INSERT INTO coach_profiles (user_id, city, years_experience, hourly_rate, verification_status, stripe_connected_account_id) VALUES
     ($1, 'CDMX', 12, 35, 'approved', 'acct_test_coachA'),
     ($2, 'CDMX', 8, 28, 'approved', 'acct_test_coachB')`,
    [COACH_A_ID, COACH_B_ID],
  );

  await pool.query(
    `INSERT INTO clubs (id, name, type, city, default_commission_rate, verification_status) VALUES
     ($1, 'Club Deportivo Bosques', 'club', 'CDMX', 0.10, 'approved')`,
    [CLUB_ID],
  );

  await pool.query(`INSERT INTO club_admins (club_id, user_id) VALUES ($1, $2)`, [CLUB_ID, CLUB_ADMIN_ID]);

  // end_date en el pasado a propósito, para poder probar el descubrimiento
  // de torneos listos para liquidación (findTournamentsReadyForSettlement).
  await pool.query(
    `INSERT INTO tournaments (id, club_id, name, venue, start_date, end_date, status) VALUES
     ($1, $2, 'Copa Nacional Juvenil', 'Club Deportivo Bosques', CURRENT_DATE - INTERVAL '3 days', CURRENT_DATE - INTERVAL '1 day', 'completed')`,
    [TOURNAMENT_ID, CLUB_ID],
  );

  // tagged_by debe ser un club_admin del club dueño del torneo (fn_tournament_coach_tags_validate_tagger).
  await pool.query(
    `INSERT INTO tournament_coach_tags (tournament_id, coach_id, tagged_by) VALUES ($1, $2, $3), ($1, $4, $3)`,
    [TOURNAMENT_ID, COACH_A_ID, CLUB_ADMIN_ID, COACH_B_ID],
  );

  await pool.query(
    `INSERT INTO players (id, guardian_user_id, full_name, birth_date, age_category) VALUES
     ($1, $2, 'Valentina Guardián', '2012-03-04', 'U14')`,
    [PLAYER_ID, PARENT_ID],
  );

  // Segundo club/torneo, activo y en el futuro — a diferencia de TOURNAMENT_ID (completed, en el
  // pasado). Prueba el descubrimiento de torneos (GET /tournaments): que el filtro de status
  // excluye al ya completado y que la búsqueda por ciudad funciona (Guadalajara vs CDMX).
  await pool.query(
    `INSERT INTO clubs (id, name, type, city, default_commission_rate, verification_status) VALUES
     ($1, 'Club Guadalajara Tenis', 'club', 'Guadalajara', 0.10, 'approved')`,
    [CLUB_2_ID],
  );
  await pool.query(
    `INSERT INTO tournaments (id, club_id, name, venue, start_date, end_date, status) VALUES
     ($1, $2, 'Abierto Regional Sub-16', 'Club Guadalajara Tenis', CURRENT_DATE + INTERVAL '14 days', CURRENT_DATE + INTERVAL '18 days', 'scheduled')`,
    [ACTIVE_TOURNAMENT_ID, CLUB_2_ID],
  );

  return {
    clubId: CLUB_ID,
    clubAdminUserId: CLUB_ADMIN_ID,
    tournamentId: TOURNAMENT_ID,
    parentUserId: PARENT_ID,
    coachAUserId: COACH_A_ID,
    coachBUserId: COACH_B_ID,
    playerId: PLAYER_ID,
    activeTournamentId: ACTIVE_TOURNAMENT_ID,
    platformAdminUserId: PLATFORM_ADMIN_ID,
  };
}
