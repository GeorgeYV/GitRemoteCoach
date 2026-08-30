import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as paymentAccountService from '../services/paymentAccountService.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';

const updateSchema = z.object({
  handle: z.string().optional(),
  bankName: z.string().optional(),
  accountType: z.string().optional(),
  accountNumber: z.string().optional(),
  accountHolderName: z.string().optional(),
  interbankAccountNumber: z.string().optional(),
});

function assertPlatformAdmin(role: string): void {
  if (role !== 'platform_admin') {
    throw new ForbiddenError('Solo un administrador de la plataforma puede gestionar cuentas de cobro');
  }
}

/** PlatformAdminPaymentAccountsScreen (decisión #54): editar las cuentas de cobro del pago manual
 * P2P (Deuna/Yape/Plin/transferencia) sin pasar por un redeploy en Render. */
export async function paymentAccountRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/payment-accounts', { preHandler: app.authenticate }, async (req) => {
    const { role } = req.user as { role: string };
    assertPlatformAdmin(role);
    return paymentAccountService.listPaymentAccountsForAdmin();
  });

  app.put('/admin/payment-accounts/:id', { preHandler: app.authenticate }, async (req) => {
    const { sub, role } = req.user as { sub: string; role: string };
    assertPlatformAdmin(role);
    const { id } = req.params as { id: string };
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    return paymentAccountService.updatePaymentAccount(id, parsed.data, sub);
  });
}
