import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as adminAccountService from '../services/adminAccountService.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';

const disableSchema = z.object({ reason: z.string().min(1) });

function assertPlatformAdmin(role: string): void {
  if (role !== 'platform_admin') {
    throw new ForbiddenError('Solo un administrador de la plataforma puede gestionar cuentas');
  }
}

/** PlatformAdminAccountsScreen (decisión #51 + #52): listar y deshabilitar/habilitar cuentas de
 * coach/parent/club_admin — deshabilitar el club/federación entero (no solo la cuenta de uno de
 * sus admins) queda fuera de este alcance por ahora. */
export async function adminAccountRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/coaches', { preHandler: app.authenticate }, async (req) => {
    const { role } = req.user as { role: string };
    assertPlatformAdmin(role);
    const { search } = req.query as { search?: string };
    return adminAccountService.listCoachesForAdmin(search);
  });

  app.get('/admin/parents', { preHandler: app.authenticate }, async (req) => {
    const { role } = req.user as { role: string };
    assertPlatformAdmin(role);
    const { search } = req.query as { search?: string };
    return adminAccountService.listParentsForAdmin(search);
  });

  app.get('/admin/club-admins', { preHandler: app.authenticate }, async (req) => {
    const { role } = req.user as { role: string };
    assertPlatformAdmin(role);
    const { search } = req.query as { search?: string };
    return adminAccountService.listClubAdminsForAdmin(search);
  });

  app.post('/admin/users/:id/disable', { preHandler: app.authenticate }, async (req, reply) => {
    const { sub, role } = req.user as { sub: string; role: string };
    assertPlatformAdmin(role);
    const { id } = req.params as { id: string };
    const parsed = disableSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    await adminAccountService.disableAccount(id, { disabledBy: sub, reason: parsed.data.reason });
    reply.code(204);
  });

  app.post('/admin/users/:id/enable', { preHandler: app.authenticate }, async (req, reply) => {
    const { role } = req.user as { role: string };
    assertPlatformAdmin(role);
    const { id } = req.params as { id: string };
    await adminAccountService.enableAccount(id);
    reply.code(204);
  });
}
