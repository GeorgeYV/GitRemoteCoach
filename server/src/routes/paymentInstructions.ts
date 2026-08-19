import type { FastifyInstance } from 'fastify';
import { paymentCollectionAccounts } from '../config.js';

/** BookingPaymentScreen: a qué cuenta pagar (Deuna en Ecuador, Yape/Plin en Perú) — dato estático
 * de la plataforma, no por reserva, así que no hace falta ligarlo a bookings.ts. */
export async function paymentInstructionsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/payment-instructions', { preHandler: app.authenticate }, async () => {
    return paymentCollectionAccounts;
  });
}
