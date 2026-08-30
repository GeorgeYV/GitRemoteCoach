import type { FastifyInstance } from 'fastify';
import * as paymentAccountService from '../services/paymentAccountService.js';

/** BookingPaymentScreen: a qué cuenta pagar (Deuna en Ecuador, Yape/Plin en Perú) — dato de la
 * plataforma editable por platform_admin (payment_collection_accounts, decisión #54), no por
 * reserva, así que no hace falta ligarlo a bookings.ts. */
export async function paymentInstructionsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/payment-instructions', { preHandler: app.authenticate }, async () => {
    return paymentAccountService.getPaymentInstructions();
  });
}
