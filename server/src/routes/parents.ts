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
}
