import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as bookingRepository from '../repositories/bookingRepository.js';
import * as bookingService from '../services/bookingService.js';
import * as paymentService from '../services/paymentService.js';
import * as cancellationService from '../services/cancellationService.js';
import { ValidationError } from '../lib/errors.js';

const requestBookingSchema = z.object({
  playerId: z.string().uuid(),
  coachId: z.string().uuid(),
  tournamentId: z.string().uuid(),
  matchDatetime: z.string().datetime(),
  agreedRate: z.number().positive(),
});

const payBookingSchema = z.object({
  paymentMethodId: z.string().min(1),
});

const cancelBookingSchema = z.object({
  actor: z.enum(['parent', 'coach']),
  actorUserId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

export async function bookingRoutes(app: FastifyInstance): Promise<void> {
  app.post('/bookings', async (req, reply) => {
    const parsed = requestBookingSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const booking = await bookingService.requestBooking(parsed.data);
    reply.code(201).send(booking);
  });

  app.get('/bookings/:id', async (req) => {
    const { id } = req.params as { id: string };
    return bookingRepository.getBookingById(id);
  });

  app.post('/bookings/:id/accept', async (req) => {
    const { id } = req.params as { id: string };
    return bookingService.acceptBooking(id);
  });

  app.post('/bookings/:id/reject', async (req) => {
    const { id } = req.params as { id: string };
    return bookingService.rejectBooking(id);
  });

  app.get('/bookings/:id/alternatives', async (req) => {
    const { id } = req.params as { id: string };
    return bookingService.suggestAlternativeCoaches(id);
  });

  app.post('/bookings/:id/pay', async (req) => {
    const { id } = req.params as { id: string };
    const parsed = payBookingSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    return paymentService.initiatePayment(id, parsed.data.paymentMethodId);
  });

  app.post('/bookings/:id/complete', async (req) => {
    const { id } = req.params as { id: string };
    return paymentService.completeBooking(id);
  });

  app.post('/bookings/:id/cancel', async (req) => {
    const { id } = req.params as { id: string };
    const parsed = cancelBookingSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    return cancellationService.cancelBooking({ bookingId: id, ...parsed.data });
  });
}
