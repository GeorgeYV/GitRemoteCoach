import { ConflictError } from '../lib/errors.js';
import * as bookingRepository from '../repositories/bookingRepository.js';
import * as bookingMessageRepository from '../repositories/bookingMessageRepository.js';
import * as notificationService from './notificationService.js';
import type { Booking, BookingMessage, MessageSenderType } from '../types.js';

const MESSAGE_PREVIEW_LENGTH = 80;

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
  const message = await bookingMessageRepository.createMessage(params);

  const preview =
    params.body.length > MESSAGE_PREVIEW_LENGTH
      ? `${params.body.slice(0, MESSAGE_PREVIEW_LENGTH)}…`
      : params.body;
  // Respaldo por correo además del push (ver mismo criterio en bookingService.ts#acceptBooking):
  // el push no llega en el target web, que es como se usa esta app en la práctica.
  if (params.senderType === 'parent') {
    await notificationService.notifyUser(booking.coachId, {
      title: 'Nuevo mensaje',
      body: preview,
      data: { bookingId: params.bookingId },
    });
    await notificationService.notifyUserByEmail(booking.coachId, {
      subject: 'Nuevo mensaje sobre tu reserva — Remote Coach',
      html: `<p>Tienes un mensaje nuevo: "${preview}"</p><p>Abre la app para responder.</p>`,
    });
  } else if (params.senderType === 'coach') {
    const parentUserId = await bookingRepository.getParentUserIdForBooking(params.bookingId);
    await notificationService.notifyUser(parentUserId, {
      title: 'Nuevo mensaje',
      body: preview,
      data: { bookingId: params.bookingId },
    });
    await notificationService.notifyUserByEmail(parentUserId, {
      subject: 'Nuevo mensaje sobre tu reserva — Remote Coach',
      html: `<p>Tienes un mensaje nuevo: "${preview}"</p><p>Abre la app para responder.</p>`,
    });
  }

  return message;
}

export async function listMessages(bookingId: string): Promise<BookingMessage[]> {
  return bookingMessageRepository.listMessagesForBooking(bookingId);
}
