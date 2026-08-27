import * as clubRepository from '../repositories/clubRepository.js';
import * as notificationService from './notificationService.js';
import * as tournamentReportRepository from '../repositories/tournamentReportRepository.js';
import * as tournamentRepository from '../repositories/tournamentRepository.js';
import { NotFoundError } from '../lib/errors.js';
import type { TournamentReport } from '../types.js';

/**
 * Reporte de un posible error de datos en un torneo (decisión #46) — no cambia nada del torneo,
 * solo avisa al club/federación que lo creó (push, a todos sus admins si hay más de uno por el
 * administrador de respaldo) y queda visible para platform_admin como respaldo. Un torneo sin
 * club (sembrado sin reclamar, ver decisión #36) no tiene a quién avisarle por push — igual queda
 * en la cola de platform_admin.
 */
export async function reportTournament(
  tournamentId: string,
  reportedBy: string,
  message: string,
): Promise<TournamentReport> {
  const tournament = await tournamentRepository.getBasicInfo(tournamentId);
  if (!tournament) throw new NotFoundError('Tournament', tournamentId);

  const report = await tournamentReportRepository.create({ tournamentId, reportedBy, message });

  if (tournament.clubId) {
    const adminUserIds = await clubRepository.listAdminUserIds(tournament.clubId);
    await Promise.all(
      adminUserIds.map((adminUserId) =>
        notificationService.notifyUser(adminUserId, {
          title: 'Posible error en un torneo',
          body: `Alguien reportó un problema en "${tournament.name}" — revísalo cuando puedas.`,
          data: { tournamentId, tournamentReportId: report.id },
        }),
      ),
    );
  }

  return report;
}

/** ClubTournamentListScreen: reportes abiertos sobre torneos de este club. */
export async function listOpenReportsForClub(clubId: string): Promise<TournamentReport[]> {
  return tournamentReportRepository.listOpenForClub(clubId);
}

/** PlatformAdminTournamentScreen: todos los reportes abiertos, de cualquier club. */
export async function listOpenReportsForAdmin(): Promise<TournamentReport[]> {
  return tournamentReportRepository.listOpenForAdmin();
}

/** clubId presente = camino del club_admin (solo puede resolver reportes de su propio club, ver
 * tournamentReportRepository.resolve); ausente = camino del platform_admin (cualquiera). */
export async function resolveReport(
  reportId: string,
  resolvedBy: string,
  clubId?: string,
): Promise<TournamentReport> {
  return tournamentReportRepository.resolve(reportId, resolvedBy, clubId);
}
