import { businessRules } from '../config.js';
import * as bookingRepository from '../repositories/bookingRepository.js';
import * as notificationService from '../services/notificationService.js';

export interface PaymentRemindersResult {
  remindedBookingIds: string[];
}

/**
 * Job periódico (ej. cada 15-30 min): push al padre para las reservas 'accepted' cuyo
 * payment_deadline está por vencer (ver businessRules.paymentReminderHoursBeforeDeadline) y
 * todavía no recibieron el recordatorio — pensado para quien tiene que viajar a la ciudad del
 * torneo y no está mirando la app en el momento exacto en que el entrenador aceptó.
 */
export async function runPaymentRemindersJob(): Promise<PaymentRemindersResult> {
  const threshold = new Date(Date.now() + businessRules.paymentReminderHoursBeforeDeadline * 3600_000);
  const bookings = await bookingRepository.findAcceptedBookingsNeedingPaymentReminder(threshold);

  const remindedBookingIds: string[] = [];
  for (const booking of bookings) {
    const parentUserId = await bookingRepository.getParentUserIdForBooking(booking.id);
    await notificationService.notifyUser(parentUserId, {
      title: 'Tu pago está por vencer',
      body: 'Todavía no confirmamos tu pago — complétalo antes de perder el cupo con el entrenador.',
      data: { bookingId: booking.id },
    });
    // Respaldo por correo — mismo criterio que acceptBooking/rejectBooking/verifyPayment
    // (bookingService.ts/paymentService.ts): el push depende de un token de dispositivo que hoy
    // nunca se registra en el target web, así que sin esto el padre no se entera de nada.
    await notificationService.notifyUserByEmail(parentUserId, {
      subject: 'Tu pago está por vencer — Remote Coach',
      html: '<p>Todavía no confirmamos tu pago — completa el pago desde la app antes de perder el cupo con el entrenador.</p>',
    });
    await bookingRepository.markPaymentReminderSent(booking.id);
    remindedBookingIds.push(booking.id);
  }
  return { remindedBookingIds };
}
