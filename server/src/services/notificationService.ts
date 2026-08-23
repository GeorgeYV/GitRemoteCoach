import * as pushTokenRepository from '../repositories/pushTokenRepository.js';
import { sendPushNotifications } from '../lib/pushNotifications.js';

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
