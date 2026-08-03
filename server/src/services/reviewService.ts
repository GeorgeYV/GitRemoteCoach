import { withTransaction } from '../lib/db.js';
import { ConflictError } from '../lib/errors.js';
import * as bookingRepository from '../repositories/bookingRepository.js';
import * as coachRepository from '../repositories/coachRepository.js';
import * as reviewRepository from '../repositories/reviewRepository.js';
import type { Review } from '../types.js';

export interface SubmitReviewParams {
  bookingId: string;
  parentId: string;
  rating: number;
  comment?: string;
}

/** Solo se puede reseñar una reserva ya completada (BookingReviewScreen solo ofrece "Dejar reseña" ahí). */
export async function submitReview(params: SubmitReviewParams): Promise<Review> {
  return withTransaction(async (client) => {
    const booking = await bookingRepository.getBookingById(params.bookingId, client);
    if (booking.status !== 'completed') {
      throw new ConflictError(`No se puede reseñar una reserva en estado "${booking.status}"`, 'booking_not_completed');
    }

    const review = await reviewRepository.createReview(
      {
        bookingId: params.bookingId,
        parentId: params.parentId,
        coachId: booking.coachId,
        rating: params.rating,
        comment: params.comment,
      },
      client,
    );

    await coachRepository.recalculateRating(booking.coachId, client);

    return review;
  });
}

export async function listReviewsForCoach(coachId: string): Promise<Review[]> {
  return reviewRepository.listReviewsForCoach(coachId);
}
