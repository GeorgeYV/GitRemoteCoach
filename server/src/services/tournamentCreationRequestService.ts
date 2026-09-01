import * as notificationService from './notificationService.js';
import * as tournamentCreationRequestRepository from '../repositories/tournamentCreationRequestRepository.js';
import type { CountryCode, TournamentCreationRequest } from '../types.js';

/**
 * Un padre o entrenador pide que se agregue un torneo que buscó y no encontró (decisión #55) —
 * ParentHomeScreen/CoachTournamentSearchScreen, cuando la búsqueda da 0 resultados. Le avisa a
 * platform_admin por correo: no hay club/federación identificado todavía (el torneo ni existe),
 * así que no hay a quién más notificar — mismo criterio que tournament_reports cuando el torneo
 * no tiene club (decisión #46), solo que acá SIEMPRE es ese caso.
 */
export async function requestTournamentCreation(params: {
  requestedBy: string;
  tournamentName: string;
  city: string;
  country: CountryCode;
  note?: string;
}): Promise<TournamentCreationRequest> {
  const request = await tournamentCreationRequestRepository.create(params);
  await notificationService.notifyRoleByEmail('platform_admin', {
    subject: `Piden que agreguemos un torneo: ${params.tournamentName} — Remote Coach`,
    html: `<p><strong>${request.requesterName}</strong> pidió que agreguemos <strong>${params.tournamentName}</strong> (${params.city}, ${params.country})${params.note ? `: "${params.note}"` : '.'}</p><p>Revísalo desde el panel de admin, sección "Torneos".</p>`,
  });
  return request;
}

/** PlatformAdminTournamentScreen: cola de solicitudes pendientes. */
export async function listPendingRequests(): Promise<TournamentCreationRequest[]> {
  return tournamentCreationRequestRepository.listPending();
}

/** Descartar sin crear nada — duplicado, no es un torneo real, etc. */
export async function dismissRequest(id: string, resolvedBy: string): Promise<TournamentCreationRequest> {
  return tournamentCreationRequestRepository.resolve(id, resolvedBy, null);
}
