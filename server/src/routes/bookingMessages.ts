import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as bookingRepository from '../repositories/bookingRepository.js';
import * as bookingMessageService from '../services/bookingMessageService.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';

const sendMessageSchema = z.object({
  body: z.string().min(1).max(1000),
});

/** Chat de coordinación padre↔entrenador por reserva (CoachChatScreen). senderType/senderId ya
 * no llegan del body — se derivan de la sesión ('system' solo se crea internamente, ver
 * bookingService.acceptBooking, nunca a través de esta ruta). */
export async function bookingMessageRoutes(app: FastifyInstance): Promise<void> {
  app.get('/bookings/:id/messages', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };
    const { coachId, guardianUserId } = await bookingRepository.getBookingParticipants(id);
    if (sub !== coachId && sub !== guardianUserId) {
      throw new ForbiddenError('No tienes acceso a esta reserva');
    }
    return bookingMessageService.listMessages(id);
  });

  app.post('/bookings/:id/messages', { preHandler: app.authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);

    const { sub } = req.user as { sub: string };
    const { coachId, guardianUserId } = await bookingRepository.getBookingParticipants(id);
    let senderType: 'coach' | 'parent';
    if (sub === coachId) senderType = 'coach';
    else if (sub === guardianUserId) senderType = 'parent';
    else throw new ForbiddenError('No eres parte de esta reserva');

    const message = await bookingMessageService.sendMessage({
      bookingId: id,
      senderType,
      senderId: sub,
      body: parsed.data.body,
    });
    reply.code(201).send(message);
  });
}
