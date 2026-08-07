import type { FastifyInstance } from 'fastify';
import * as bookingService from '../services/bookingService.js';

export async function parentRoutes(app: FastifyInstance): Promise<void> {
  // BookingHistoryScreen
  app.get('/parents/:id/bookings', async (req) => {
    const { id } = req.params as { id: string };
    return bookingService.listBookingsForParent(id);
  });
}
