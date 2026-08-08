import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as bookingRepository from '../repositories/bookingRepository.js';
import * as reviewService from '../services/reviewService.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';

const submitReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export async function reviewRoutes(app: FastifyInstance): Promise<void> {
  // BookingReviewScreen: el padre califica 1–5 (con comentario opcional) tras un partido
  // completado. parentId ya no llega del body — se deriva de la sesión y se verifica contra
  // el padre/guardián real de la reserva.
  app.post('/bookings/:id/review', { preHandler: app.authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = submitReviewSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);

    const { sub } = req.user as { sub: string };
    const { guardianUserId } = await bookingRepository.getBookingParticipants(id);
    if (sub !== guardianUserId) throw new ForbiddenError('Solo el padre/madre de la reserva puede reseñarla');

    const review = await reviewService.submitReview({ bookingId: id, parentId: sub, ...parsed.data });
    reply.code(201).send(review);
  });

  // TrainerProfileScreen: reseñas de padres mostradas en el perfil del entrenador.
  app.get('/coaches/:id/reviews', async (req) => {
    const { id } = req.params as { id: string };
    return reviewService.listReviewsForCoach(id);
  });
}
