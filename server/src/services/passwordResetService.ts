import { randomInt, createHash } from 'node:crypto';
import * as userRepository from '../repositories/userRepository.js';
import * as passwordResetTokenRepository from '../repositories/passwordResetTokenRepository.js';
import { hashPassword } from '../lib/password.js';
import { sendEmail } from '../lib/emailClient.js';
import { withTransaction } from '../lib/db.js';
import { AppError } from '../lib/errors.js';
import { businessRules } from '../config.js';

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function invalidCodeError(): AppError {
  return new AppError('Código inválido o vencido', 400, 'invalid_code');
}

/** POST /auth/forgot-password. Enumeration-safe: no lanza si el correo no existe — la ruta
 * siempre responde 200 sin importar el resultado de esta función. */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await userRepository.findByEmail(email);
  if (!user) return;

  const code = randomInt(100000, 1000000).toString();
  const expiresAt = new Date(Date.now() + businessRules.passwordResetCodeTtlMinutes * 60_000);
  await passwordResetTokenRepository.create({ userId: user.id, codeHash: hashCode(code), expiresAt });

  // A diferencia de sendPushNotifications (notificationService.notifyUser trata un push fallido
  // como no-fatal), acá el envío del correo ES el propósito de la solicitud — si falla, debe
  // propagarse como 500 en vez de tragarse el error.
  await sendEmail({
    to: user.email,
    subject: 'Restablece tu contraseña — Remote Coach',
    html: `<p>Tu código para restablecer la contraseña es <strong>${code}</strong>. Vence en ${businessRules.passwordResetCodeTtlMinutes} minutos.</p>`,
  });
}

/** POST /auth/reset-password. Mismo error genérico para correo inexistente, código incorrecto o
 * vencido — igual criterio enumeration-safe que authService.login. */
export async function resetPassword(params: { email: string; code: string; newPassword: string }): Promise<void> {
  const user = await userRepository.findByEmail(params.email);
  if (!user) throw invalidCodeError();

  const tokenRow = await passwordResetTokenRepository.findLatestActiveByUserId(user.id);
  if (!tokenRow) throw invalidCodeError();

  if (tokenRow.codeHash !== hashCode(params.code)) {
    const attempts = await passwordResetTokenRepository.incrementAttempts(tokenRow.id);
    if (attempts >= businessRules.passwordResetMaxAttempts) {
      await passwordResetTokenRepository.markUsed(tokenRow.id);
    }
    throw invalidCodeError();
  }

  await withTransaction(async (client) => {
    await userRepository.updatePasswordHash(user.id, hashPassword(params.newPassword), client);
    await passwordResetTokenRepository.markUsed(tokenRow.id, client);
  });
}
