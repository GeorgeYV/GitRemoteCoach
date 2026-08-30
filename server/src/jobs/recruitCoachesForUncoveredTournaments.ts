import { businessRules } from '../config.js';
import * as tournamentRepository from '../repositories/tournamentRepository.js';
import * as notificationService from '../services/notificationService.js';

export interface RecruitCoachesResult {
  notifiedTournamentIds: string[];
}

/**
 * Job periódico (diario alcanza, a diferencia de paymentReminders — acá la urgencia es baja):
 * torneos vigentes que siguen sin ningún coach_tournament_rates cargado varios días después de
 * creados (ver decisión #50 en db/schema.sql) — le avisa por correo a todos los entrenadores
 * aprobados del país del torneo, una sola vez por torneo. No es un botón que dependa de que un
 * padre entre, note el vacío y decida actuar — conseguir cobertura de entrenadores es un problema
 * de oferta que le corresponde resolver a la plataforma, no a quien busca un entrenador.
 *
 * El asunto siempre remarca ciudad y sede (pedido explícito), para que un entrenador reconozca de
 * un vistazo si le queda cerca antes de abrir el correo.
 */
export async function runRecruitCoachesForUncoveredTournamentsJob(): Promise<RecruitCoachesResult> {
  const createdBefore = new Date(Date.now() - businessRules.coachRecruitmentEmailDelayDays * 24 * 3600_000);
  const startsAfter = new Date(Date.now() + businessRules.coachRecruitmentEmailMinDaysBeforeStart * 24 * 3600_000)
    .toISOString()
    .slice(0, 10);
  const tournaments = await tournamentRepository.findUncoveredTournamentsNeedingRecruitmentEmail(
    createdBefore,
    startsAfter,
  );

  const notifiedTournamentIds: string[] = [];
  for (const tournament of tournaments) {
    if (!tournament.country) {
      // Club sin país propio y torneo tampoco lo pisó — no hay a quién avisarle. Rarísimo (la
      // mayoría cae al país del club), se deja para el próximo corrido en vez de marcarlo enviado.
      console.error(`Torneo ${tournament.id} sin país resoluble — no se pudo reclutar entrenadores`);
      continue;
    }

    await notificationService.notifyCoachesInCountryByEmail(tournament.country, {
      subject: `Buscan entrenadores en ${tournament.city} — ${tournament.venue} — Remote Coach`,
      html: `<p><strong>${tournament.name}</strong> (${tournament.venue}, ${tournament.city}) todavía no tiene
        ningún entrenador con disponibilidad cargada. Se juega del ${tournament.startDate} al ${tournament.endDate}.</p>
        <p>Si te interesa, abrí la app, buscalo en "Torneos activos" y configurá tu disponibilidad y tarifa.</p>`,
    });
    await tournamentRepository.markRecruitmentEmailSent(tournament.id);
    notifiedTournamentIds.push(tournament.id);
  }
  return { notifiedTournamentIds };
}
