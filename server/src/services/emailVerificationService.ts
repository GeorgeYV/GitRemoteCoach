import { randomInt, createHash } from 'node:crypto';
import * as userRepository from '../repositories/userRepository.js';
import * as emailVerificationTokenRepository from '../repositories/emailVerificationTokenRepository.js';
import { sendEmail } from '../lib/emailClient.js';
import { AppError, ConflictError } from '../lib/errors.js';
import { businessRules } from '../config.js';
import type { PublicUser } from '../types.js';

/** Verificación de correo al registrarse (decisión #48) — mismo diseño que
 * passwordResetService.ts (código de 6 dígitos, no un link: esta app no tiene deep-linking).
 * No importa authService.toPublicUser a propósito — authService.register llama a
 * sendVerificationCode() de acá, así que importar en el otro sentido crearía un ciclo. */
function toPublicUser(user: userRepository.UserRecord): PublicUser {
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

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function invalidCodeError(): AppError {
  return new AppError('Código inválido o vencido', 400, 'invalid_code');
}

/** Genera y manda un código nuevo — usado tanto al registrarse como en "Reenviar código" y tras
 * cambiar de correo. A diferencia de passwordResetService.requestPasswordReset, acá SÍ conocemos
 * al usuario de antemano (viene de una sesión autenticada) — no hace falta el criterio
 * enumeration-safe. Si el envío falla, se propaga como 500 igual que el de contraseña. */
export async function sendVerificationCode(userId: string): Promise<void> {
  const user = await userRepository.findById(userId);
  const code = randomInt(100000, 1000000).toString();
  const expiresAt = new Date(Date.now() + businessRules.emailVerificationCodeTtlMinutes * 60_000);
  await emailVerificationTokenRepository.create({ userId: user.id, codeHash: hashCode(code), expiresAt });

  await sendEmail({
    to: user.email,
    subject: 'Confirma tu correo — Remote Coach',
    html: `<p>Tu código para confirmar tu correo es <strong>${code}</strong>. Vence en ${businessRules.emailVerificationCodeTtlMinutes} minutos.</p>`,
  });
}

/** POST /auth/verify-email. */
export async function verifyEmail(userId: string, code: string): Promise<PublicUser> {
  const tokenRow = await emailVerificationTokenRepository.findLatestActiveByUserId(userId);
  if (!tokenRow) throw invalidCodeError();

  if (tokenRow.codeHash !== hashCode(code)) {
    const attempts = await emailVerificationTokenRepository.incrementAttempts(tokenRow.id);
    if (attempts >= businessRules.emailVerificationMaxAttempts) {
      await emailVerificationTokenRepository.markUsed(tokenRow.id);
    }
    throw invalidCodeError();
  }

  await emailVerificationTokenRepository.markUsed(tokenRow.id);
  await userRepository.markEmailVerified(userId);
  return toPublicUser(await userRepository.findById(userId));
}

/** PUT /auth/me/email — corrige un correo mal escrito al registrarse (ver decisión #48) sin
 * necesitar que alguien con acceso a la base lo arregle a mano. Reinicia la verificación y manda
 * un código nuevo a la dirección corregida. */
export async function changeEmail(userId: string, newEmail: string): Promise<PublicUser> {
  const existing = await userRepository.findByEmail(newEmail);
  if (existing && existing.id !== userId) {
    throw new ConflictError('Ya existe una cuenta con ese correo', 'email_taken');
  }

  const updated = await userRepository.updateEmail(userId, newEmail);
  await sendVerificationCode(userId);
  return toPublicUser(updated);
}
