import * as coachRepository from '../repositories/coachRepository.js';
import * as userRepository from '../repositories/userRepository.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';
import type { AdminAccountSummary } from '../types.js';

// Alcance de la primera entrega (decisión #51): solo coach/parent. club_admin (federaciones)
// queda para una segunda vuelta — deshabilitar un club arrastra sus torneos y coaches oficiales,
// más para pensar que esto.
const DISABLEABLE_ROLES = ['coach', 'parent'] as const;

/** PlatformAdminAccountsScreen, pestaña "Entrenadores". */
export async function listCoachesForAdmin(search?: string): Promise<AdminAccountSummary[]> {
  return coachRepository.listAllForAdmin(search);
}

/** PlatformAdminAccountsScreen, pestaña "Padres". */
export async function listParentsForAdmin(search?: string): Promise<AdminAccountSummary[]> {
  return userRepository.listByRole('parent', search);
}

/**
 * Deshabilita la cuenta de un coach o padre/madre — reversible (ver enableAccount), no un
 * borrado. No cancela reservas/torneos ya en curso automáticamente (ver decisión #51): eso queda
 * a criterio del admin caso por caso, no algo que el sistema decida solo.
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
