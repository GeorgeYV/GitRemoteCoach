import * as coachRepository from '../repositories/coachRepository.js';
import * as pushTokenRepository from '../repositories/pushTokenRepository.js';
import * as userRepository from '../repositories/userRepository.js';
import { sendPushNotifications } from '../lib/pushNotifications.js';
import { sendEmail } from '../lib/emailClient.js';
import type { CountryCode, UserRole } from '../types.js';

export async function registerPushToken(userId: string, token: string): Promise<void> {
  await pushTokenRepository.upsert(userId, token);
}

export async function unregisterPushToken(userId: string, token: string): Promise<void> {
  await pushTokenRepository.deleteToken(userId, token);
}

/**
 * Un token inválido/expirado nunca debe tumbar el flujo que dispara la notificación
 * (ej. aceptar una reserva) — se loguea y se sigue.
 */
export async function notifyUser(
  userId: string,
  notification: { title: string; body: string; data?: Record<string, unknown> },
): Promise<void> {
  try {
    const tokens = await pushTokenRepository.listTokensForUser(userId);
    await sendPushNotifications(tokens.map((to) => ({ to, ...notification })));
  } catch (err) {
    console.error(`No se pudo notificar al usuario ${userId}:`, err);
  }
}

/**
 * Igual criterio que notifyUser (push): un correo que falla nunca debe tumbar el flujo que lo
 * dispara — se loguea y se sigue. A diferencia del push (dispositivo → 0 o más tokens), un
 * usuario siempre tiene exactamente un correo, así que esto es 0 o 1 envío.
 */
export async function notifyUserByEmail(
  userId: string,
  email: { subject: string; html: string },
): Promise<void> {
  try {
    const user = await userRepository.findById(userId);
    await sendEmail({ to: user.email, ...email });
  } catch (err) {
    console.error(`No se pudo mandar el correo al usuario ${userId}:`, err);
  }
}

/**
 * Para avisos que no son de un usuario puntual sino de un rol entero (platform_admin — no es
 * 1:1, puede haber más de una cuenta con ese rol, ver userRepository.listEmailsByRole). Cada
 * destinatario se manda por separado y con su propio try/catch: uno que falle no debe frenar a
 * los demás.
 */
export async function notifyRoleByEmail(role: UserRole, email: { subject: string; html: string }): Promise<void> {
  const emails = await userRepository.listEmailsByRole(role);
  await Promise.all(
    emails.map((to) =>
      sendEmail({ to, ...email }).catch((err) => {
        console.error(`No se pudo mandar el correo a ${to} (rol ${role}):`, err);
      }),
    ),
  );
}

/** jobs/recruitCoachesForUncoveredTournaments (decisión #50): mismo patrón que notifyRoleByEmail
 * (0 o más destinatarios, cada envío con su propio try/catch para que uno que falle no frene a
 * los demás), pero acotado a los coaches aprobados de un país en vez de un rol entero. */
export async function notifyCoachesInCountryByEmail(
  country: CountryCode,
  email: { subject: string; html: string },
): Promise<void> {
  const emails = await coachRepository.listApprovedEmailsByCountry(country);
  await Promise.all(
    emails.map((to) =>
      sendEmail({ to, ...email }).catch((err) => {
        console.error(`No se pudo mandar el correo a ${to} (país ${country}):`, err);
      }),
    ),
  );
}
