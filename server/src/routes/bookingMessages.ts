import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as bookingMessageService from '../services/bookingMessageService.js';
import { ValidationError } from '../lib/errors.js';

const sendMessageSchema = z.object({
  senderType: z.enum(['coach', 'parent', 'system']),
  senderId: z.string().uuid().optional(),
  body: z.string().min(1).max(1000),
});

/** Chat de coordinación padre↔entrenador por reserva (CoachChatScreen). */
export async function bookingMessageRoutes(app: FastifyInstance): Promise<void> {
  app.get('/bookings/:id/messages', async (req) => {
    const { id } = req.params as { id: string };
    return bookingMessageService.listMessages(id);
  });

  app.post('/bookings/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const message = await bookingMessageService.sendMessage({ bookingId: id, ...parsed.data });
    reply.code(201).send(message);
  });
}
