import * as clubRepository from '../repositories/clubRepository.js';
import * as coachRepository from '../repositories/coachRepository.js';
import * as userRepository from '../repositories/userRepository.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';
import type { AdminAccountSummary } from '../types.js';

// coach/parent/club_admin (decisión #51 + #52) — deshabilitar la CUENTA de un club_admin puntual
// no toca el club ni sus torneos, así que es el mismo mecanismo simple que coach/parent. Lo que
// sigue afuera es deshabilitar el CLUB/federación entero (arrastra torneos y coaches oficiales,
// mucho más para pensar) — eso sigue pendiente.
const DISABLEABLE_ROLES = ['coach', 'parent', 'club_admin'] as const;

/** PlatformAdminAccountsScreen, pestaña "Entrenadores". */
export async function listCoachesForAdmin(search?: string): Promise<AdminAccountSummary[]> {
  return coachRepository.listAllForAdmin(search);
}

/** PlatformAdminAccountsScreen, pestaña "Padres". */
export async function listParentsForAdmin(search?: string): Promise<AdminAccountSummary[]> {
  return userRepository.listByRole('parent', search);
}

/** PlatformAdminAccountsScreen, pestaña "Administradores de club" (decisión #52). */
export async function listClubAdminsForAdmin(search?: string): Promise<AdminAccountSummary[]> {
  return clubRepository.listClubAdminsForAdmin(search);
}

/**
 * Deshabilita la cuenta de un coach, padre/madre o admin de club — reversible (ver enableAccount),
 * no un borrado. No cancela reservas/torneos ya en curso automáticamente (ver decisión #51): eso
 * queda a criterio del admin caso por caso, no algo que el sistema decida solo. Para un club_admin:
 * no valida que quede al menos un admin habilitado en su club (fn_club_admins_prevent_last_removal
 * solo protege un DELETE de club_admins, no esto) — el propio platform_admin tiene que fijarse.
 */
export async function disableAccount(userId: string, params: { disabledBy: string; reason: string }): Promise<void> {
  if (params.reason.trim().length === 0) {
    throw new ValidationError('El motivo no puede estar vacío');
  }
  const target = await userRepository.findById(userId);
  if (!DISABLEABLE_ROLES.includes(target.primaryRole as (typeof DISABLEABLE_ROLES)[number])) {
    throw new ForbiddenError('Todavía no se puede deshabilitar una cuenta de este rol');
  }
  await userRepository.disable(userId, { disabledBy: params.disabledBy, reason: params.reason.trim() });
}

export async function enableAccount(userId: string): Promise<void> {
  const target = await userRepository.findById(userId);
  if (!DISABLEABLE_ROLES.includes(target.primaryRole as (typeof DISABLEABLE_ROLES)[number])) {
    throw new ForbiddenError('Todavía no se puede habilitar una cuenta de este rol');
  }
  await userRepository.enable(userId);
}
