import type { FastifyInstance } from 'fastify';
import * as bookingService from '../services/bookingService.js';
import { ForbiddenError } from '../lib/errors.js';

export async function parentRoutes(app: FastifyInstance): Promise<void> {
  // BookingHistoryScreen
  app.get('/parents/:id/bookings', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };
    if (sub !== id) throw new ForbiddenError('No puedes ver las reservas de otro padre/madre');
    return bookingService.listBookingsForParent(id);
  });

  // ParentTabBar: badge de reservas "por confirmar" + decididas sin ver.
  app.get('/parents/:id/bookings/badge-summary', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };
    if (sub !== id) throw new ForbiddenError('No puedes ver las reservas de otro padre/madre');
    return bookingService.getParentBookingBadgeSummary(id);
  });

  // BookingHistoryScreen la llama al montar, para limpiar el badge de decididas-no-vistas.
  app.post(
    '/parents/:id/bookings/mark-decisions-seen',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { sub } = req.user as { sub: string };
      if (sub !== id) throw new ForbiddenError('No puedes modificar las reservas de otro padre/madre');
      await bookingService.markParentBookingDecisionsSeen(id);
      reply.code(204);
    },
  );
}
