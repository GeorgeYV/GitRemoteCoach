import * as userRepository from '../repositories/userRepository.js';
import * as emailVerificationService from './emailVerificationService.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { AppError, ConflictError, ValidationError } from '../lib/errors.js';
import type { PublicUser, UserRole } from '../types.js';

export const SELF_SERVICE_ROLES: UserRole[] = ['parent', 'coach', 'club_admin'];

export function toPublicUser(user: userRepository.UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    primaryRole: user.primaryRole,
    emailVerifiedAt: user.emailVerifiedAt,
    disabledAt: user.disabledAt,
    disabledReason: user.disabledReason,
  };
}

export async function register(params: {
  email: string;
  password: string;
  fullName: string;
  primaryRole: UserRole;
}): Promise<PublicUser> {
  if (!SELF_SERVICE_ROLES.includes(params.primaryRole)) {
    throw new ValidationError(`No se puede registrar el rol "${params.primaryRole}" directamente`);
  }

  const existing = await userRepository.findByEmail(params.email);
  if (existing) throw new ConflictError('Ya existe una cuenta con ese correo', 'email_taken');

  const user = await userRepository.create({
    email: params.email,
    passwordHash: hashPassword(params.password),
    fullName: params.fullName,
    primaryRole: params.primaryRole,
  });

  // No fatal: crear la cuenta es el propósito principal de este llamado, el correo de
  // verificación es secundario — si el envío falla, el usuario igual queda registrado y puede
  // pedir un código nuevo con "Reenviar código" (a diferencia de passwordResetService, donde
  // mandar el correo ES el propósito entero de la solicitud).
  try {
    await emailVerificationService.sendVerificationCode(user.id);
  } catch (err) {
    console.error(`No se pudo mandar el código de verificación a ${user.id}:`, err);
  }

  return toPublicUser(user);
}

export async function login(params: { email: string; password: string }): Promise<PublicUser> {
  const user = await userRepository.findByEmail(params.email);
  // user.passwordHash es null en cuentas creadas solo por Google (ver decisión #32 en
  // db/schema.sql) — no hay nada que verificar ahí, y verifyPassword truena con null.
  if (!user || !user.passwordHash || !verifyPassword(params.password, user.passwordHash)) {
    throw new AppError('Correo o contraseña incorrectos', 401, 'invalid_credentials');
  }
  // Rechazar acá (no solo con el gate de AuthenticatedHome, ver decisión #51) da un mensaje claro
  // en la propia pantalla de login en vez de dejarlo entrar y recién ahí frenarlo.
  if (user.disabledAt) {
    throw new AppError('Esta cuenta fue deshabilitada', 403, 'account_disabled');
  }
  return toPublicUser(user);
}

export async function getById(id: string): Promise<PublicUser> {
  return toPublicUser(await userRepository.findById(id));
}

export async function updateProfile(id: string, params: { fullName: string; phone: string | null }): Promise<PublicUser> {
  return toPublicUser(await userRepository.update(id, params));
}
