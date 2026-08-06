import * as userRepository from '../repositories/userRepository.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { AppError, ConflictError, ValidationError } from '../lib/errors.js';
import type { PublicUser, UserRole } from '../types.js';

const SELF_SERVICE_ROLES: UserRole[] = ['parent', 'coach', 'club_admin'];

function toPublicUser(user: userRepository.UserRecord): PublicUser {
  return { id: user.id, email: user.email, fullName: user.fullName, primaryRole: user.primaryRole };
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
  return toPublicUser(user);
}

export async function login(params: { email: string; password: string }): Promise<PublicUser> {
  const user = await userRepository.findByEmail(params.email);
  if (!user || !verifyPassword(params.password, user.passwordHash)) {
    throw new AppError('Correo o contraseña incorrectos', 401, 'invalid_credentials');
  }
  return toPublicUser(user);
}

export async function getById(id: string): Promise<PublicUser> {
  return toPublicUser(await userRepository.findById(id));
}
