import * as bookingRepository from '../repositories/bookingRepository.js';

export interface ExpireBookingsResult {
  expiredRequests: string[];
  expiredPayments: string[];
}

/**
 * Job periódico (ej. cada 5 min): pasa a 'expired' las solicitudes que el
 * entrenador no respondió a tiempo, y las aceptadas que el padre no pagó
 * dentro de su ventana. Idempotente — cada corrida solo toca filas que
 * siguen en el estado esperado (ver WHERE en el repositorio).
 */
export async function runExpireBookingsJob(): Promise<ExpireBookingsResult> {
  const expiredRequests = await bookingRepository.expireOverdueRequests();
  const expiredPayments = await bookingRepository.expireOverduePayments();
  return {
    expiredRequests: expiredRequests.map((b) => b.id),
    expiredPayments: expiredPayments.map((b) => b.id),
  };
}
