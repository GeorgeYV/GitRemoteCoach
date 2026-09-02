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
  // nonnegative (no positive): con tarifa 'per_tournament' y varios días reservados a la vez,
  // solo el primer día de la selección carga el monto total y el resto queda en $0 (ver
  // BookingConfirmScreen) — se cobra una sola vez aunque haya N reservas asociadas al torneo.
  agreedRate: z.number().nonnegative(),
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

const payBookingsBatchSchema = z.object({
  bookingIds: z.array(z.string().uuid()).min(1),
  paymentMethodId: z.string().min(1),
});

const submitPaymentProofBatchSchema = z.object({
  bookingIds: z.array(z.string().uuid()).min(1),
  provider: z.enum(['deuna', 'yape', 'plin', 'bank_transfer']),
  referenceCode: z.string().min(1).max(100),
});

const cancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
});

const rescheduleBookingSchema = z.object({
  matchDatetime: z.string().datetime(),
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

  // Cargo directo con Stripe — BookingPaymentScreen ya no llama a esta ruta (el flujo real es
  // 100% manual, ver submit-payment-proof-batch abajo), pero se deja viva y probada para cuando
  // se reactive Stripe. paymentService.initiatePayment ya no acepta un paymentMethodId simulado
  // (ver decisión de seguridad más abajo en ese archivo) — siempre pasa por Stripe de verdad.
  app.post('/bookings/:id/pay', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const parsed = payBookingSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const { sub } = req.user as { sub: string };
    const { guardianUserId } = await bookingRepository.getBookingParticipants(id);
    if (sub !== guardianUserId) throw new ForbiddenError('Solo el padre/madre de la reserva puede pagarla');
    return paymentService.initiatePayment(id, parsed.data.paymentMethodId);
  });

  // Un solo pago para varias reservas a la vez (padre reservó más de un día con el mismo
  // entrenador) — todas deben pertenecer al padre autenticado, cada una se valida por separado
  // igual que en /bookings/:id/pay.
  app.post('/bookings/pay-batch', { preHandler: app.authenticate }, async (req) => {
    const parsed = payBookingsBatchSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const { sub } = req.user as { sub: string };
    for (const id of parsed.data.bookingIds) {
      const { guardianUserId } = await bookingRepository.getBookingParticipants(id);
      if (sub !== guardianUserId) throw new ForbiddenError('Solo el padre/madre de la reserva puede pagarla');
    }
    return paymentService.initiatePaymentBatch(parsed.data.bookingIds, parsed.data.paymentMethodId);
  });

  // Fase 1 sin Stripe: el padre paga por fuera de la app (Deuna/Yape/Plin) y manda el código de
  // operación acá — solo registra la intención, platform_admin lo confirma después (ver
  // /bookings/payment-verification-queue y /bookings/verify-payment). Un solo comprobante puede
  // cubrir varias reservas a la vez (mismo criterio que /bookings/pay-batch); BookingPaymentScreen
  // usa esta ruta incluso para una sola reserva, así que no existe una variante singular.
  app.post('/bookings/submit-payment-proof-batch', { preHandler: app.authenticate }, async (req) => {
    const parsed = submitPaymentProofBatchSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const { sub } = req.user as { sub: string };
    for (const id of parsed.data.bookingIds) {
      const { guardianUserId } = await bookingRepository.getBookingParticipants(id);
      if (sub !== guardianUserId) throw new ForbiddenError('Solo el padre/madre de la reserva puede pagarla');
    }
    return paymentService.submitPaymentProof(parsed.data.bookingIds, parsed.data);
  });

  // Libera los fondos retenidos al entrenador — solo el propio entrenador de la reserva puede
  // disparar su propio pago.
  app.post('/bookings/:id/complete', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };
    const { coachId } = await bookingRepository.getBookingParticipants(id);
    if (sub !== coachId) throw new ForbiddenError('Solo el entrenador de la reserva puede marcarla como completada');
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

  // Cualquiera de las dos partes puede reprogramar el horario directamente (sin aprobación de
  // la otra) — CoachPreMatchReminderScreen / pantalla equivalente del padre.
  app.patch('/bookings/:id/reschedule', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const parsed = rescheduleBookingSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const { sub } = req.user as { sub: string };
    const { coachId, guardianUserId, tournamentId } = await bookingRepository.getBookingParticipants(id);
    if (sub !== coachId && sub !== guardianUserId) {
      throw new ForbiddenError('No eres parte de esta reserva');
    }
    return bookingService.rescheduleBooking({
      bookingId: id,
      matchDatetime: parsed.data.matchDatetime,
      actorUserId: sub,
      coachId,
      guardianUserId,
      tournamentId,
    });
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
