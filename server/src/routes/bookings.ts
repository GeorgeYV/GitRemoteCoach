import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as bookingRepository from '../repositories/bookingRepository.js';
import * as playerRepository from '../repositories/playerRepository.js';
import * as bookingService from '../services/bookingService.js';
import * as paymentService from '../services/paymentService.js';
import * as cancellationService from '../services/cancellationService.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';
import type { CancelActor } from '../types.js';

const requestBookingSchema = z.object({
  playerId: z.string().uuid(),
  coachId: z.string().uuid(),
  tournamentId: z.string().uuid(),
  matchDatetime: z.string().datetime(),
  agreedRate: z.number().positive(),
  note: z.string().max(500).optional(),
});

const setMeetingDetailsSchema = z
  .object({
    courtLabel: z.string().max(100).optional(),
    meetingPointDetail: z.string().max(500).optional(),
  })
  .refine((v) => v.courtLabel !== undefined || v.meetingPointDetail !== undefined, {
    message: 'Debe incluir courtLabel y/o meetingPointDetail',
  });

const payBookingSchema = z.object({
  paymentMethodId: z.string().min(1),
});

const cancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
});

export async function bookingRoutes(app: FastifyInstance): Promise<void> {
  // El playerId sale del body (un padre puede tener más de un hijo/a) pero se verifica contra
  // la sesión: sin esto, cualquiera podría reservar en nombre del hijo/a de otro padre.
  app.post('/bookings', { preHandler: app.authenticate }, async (req, reply) => {
    const parsed = requestBookingSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);

    const { sub } = req.user as { sub: string };
    const player = await playerRepository.getById(parsed.data.playerId);
    if (player.guardianUserId !== sub) {
      throw new ForbiddenError('El jugador indicado no pertenece a tu cuenta');
    }

    const booking = await bookingService.requestBooking(parsed.data);
    reply.code(201).send(booking);
  });

  app.get('/bookings/:id', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };
    const { coachId, guardianUserId } = await bookingRepository.getBookingParticipants(id);
    if (sub !== coachId && sub !== guardianUserId) {
      throw new ForbiddenError('No tienes acceso a esta reserva');
    }
    return bookingRepository.getBookingById(id);
  });

  app.post('/bookings/:id/accept', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };
    const { coachId } = await bookingRepository.getBookingParticipants(id);
    if (sub !== coachId) throw new ForbiddenError('Solo el entrenador de la reserva puede aceptarla');
    return bookingService.acceptBooking(id);
  });

  app.post('/bookings/:id/reject', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };
    const { coachId } = await bookingRepository.getBookingParticipants(id);
    if (sub !== coachId) throw new ForbiddenError('Solo el entrenador de la reserva puede rechazarla');
    return bookingService.rejectBooking(id);
  });

  app.get('/bookings/:id/alternatives', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };
    const { coachId, guardianUserId } = await bookingRepository.getBookingParticipants(id);
    if (sub !== coachId && sub !== guardianUserId) {
      throw new ForbiddenError('No tienes acceso a esta reserva');
    }
    return bookingService.suggestAlternativeCoaches(id);
  });

  app.post('/bookings/:id/pay', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const parsed = payBookingSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const { sub } = req.user as { sub: string };
    const { guardianUserId } = await bookingRepository.getBookingParticipants(id);
    if (sub !== guardianUserId) throw new ForbiddenError('Solo el padre/madre de la reserva puede pagarla');
    return paymentService.initiatePayment(id, parsed.data.paymentMethodId);
  });

  app.post('/bookings/:id/complete', async (req) => {
    const { id } = req.params as { id: string };
    return paymentService.completeBooking(id);
  });

  // actor/actorUserId ya no llegan del cliente — se derivan de la sesión, tanto para saber
  // quién canceló (afecta la política de reembolso) como para que nadie pueda cancelar en
  // nombre de otro usuario.
  app.post('/bookings/:id/cancel', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const parsed = cancelBookingSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new ValidationError(parsed.error.message);

    const { sub } = req.user as { sub: string };
    const { coachId, guardianUserId } = await bookingRepository.getBookingParticipants(id);
    let actor: CancelActor;
    if (sub === coachId) actor = 'coach';
    else if (sub === guardianUserId) actor = 'parent';
    else throw new ForbiddenError('No eres parte de esta reserva');

    return cancellationService.cancelBooking({ bookingId: id, actor, actorUserId: sub, reason: parsed.data.reason });
  });

  // Logística de encuentro mostrada en CoachPreMatchReminderScreen (cancha, punto de encuentro).
  app.patch('/bookings/:id/meeting-details', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const parsed = setMeetingDetailsSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const { sub } = req.user as { sub: string };
    const { coachId } = await bookingRepository.getBookingParticipants(id);
    if (sub !== coachId) throw new ForbiddenError('Solo el entrenador de la reserva puede fijar la logística');
    return bookingRepository.setMeetingDetails(id, parsed.data);
  });
}
