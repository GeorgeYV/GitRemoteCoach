import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as bookingRepository from '../repositories/bookingRepository.js';
import * as coachPayoutRepository from '../repositories/coachPayoutRepository.js';
import * as paymentService from '../services/paymentService.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';

const verifyPaymentSchema = z.object({
  bookingIds: z.array(z.string().uuid()).min(1),
  decision: z.enum(['verified', 'rejected']),
});

/**
 * Cola de verificación de pagos manuales del admin de plataforma (rol 'platform_admin', no
 * auto-registrable — ver SELF_SERVICE_ROLES en authService), mismo guard idiom que
 * coachVerificationDocuments.ts. Fase 1 sin Stripe: el padre paga por fuera de la app
 * (Deuna/Yape/Plin) y manda un código de operación (POST /bookings/:id/submit-payment-proof);
 * acá el admin lo confirma o lo rechaza.
 */
export async function paymentVerificationRoutes(app: FastifyInstance): Promise<void> {
  // PlatformAdminPaymentsScreen: reservas con un comprobante enviado, esperando confirmación.
  app.get('/bookings/payment-verification-queue', { preHandler: app.authenticate }, async (req) => {
    const { role } = req.user as { role: string };
    if (role !== 'platform_admin') {
      throw new ForbiddenError('Solo un administrador de la plataforma puede ver la cola de verificación');
    }
    return bookingRepository.findPendingPaymentVerification();
  });

  app.put('/bookings/verify-payment', { preHandler: app.authenticate }, async (req) => {
    const { sub, role } = req.user as { sub: string; role: string };
    if (role !== 'platform_admin') {
      throw new ForbiddenError('Solo un administrador de la plataforma puede verificar pagos');
    }
    const parsed = verifyPaymentSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    return paymentService.verifyPayment(parsed.data.bookingIds, sub, parsed.data.decision);
  });

  // PlatformAdminPayoutsScreen: cuánto se le ha pagado (agregado, ver
  // settlementService.settleTournamentCoachPayouts) a cada entrenador por torneo.
  app.get('/coaches/payouts', { preHandler: app.authenticate }, async (req) => {
    const { role } = req.user as { role: string };
    if (role !== 'platform_admin') {
      throw new ForbiddenError('Solo un administrador de la plataforma puede ver los pagos a entrenadores');
    }
    return coachPayoutRepository.listAll();
  });
}
