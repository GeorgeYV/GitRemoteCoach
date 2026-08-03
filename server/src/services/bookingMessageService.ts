import { ConflictError } from '../lib/errors.js';
import * as bookingRepository from '../repositories/bookingRepository.js';
import * as bookingMessageRepository from '../repositories/bookingMessageRepository.js';
import type { Booking, BookingMessage, MessageSenderType } from '../types.js';

/** El chat solo tiene sentido en el contexto de una reserva que sigue en pie (ver copy de CoachChatScreen: "Reserva confirmada · usa este chat..."). */
const INACTIVE_BOOKING_STATUSES: Booking['status'][] = ['rejected', 'expired', 'cancelled'];

export interface SendMessageParams {
  bookingId: string;
  senderType: MessageSenderType;
  senderId?: string;
  body: string;
}

export async function sendMessage(params: SendMessageParams): Promise<BookingMessage> {
  const booking = await bookingRepository.getBookingById(params.bookingId);
  if (INACTIVE_BOOKING_STATUSES.includes(booking.status)) {
    throw new ConflictError(
      `No se pueden enviar mensajes en una reserva en estado "${booking.status}"`,
      'booking_not_active',
    );
  }
  return bookingMessageRepository.createMessage(params);
}

export async function listMessages(bookingId: string): Promise<BookingMessage[]> {
  return bookingMessageRepository.listMessagesForBooking(bookingId);
}
