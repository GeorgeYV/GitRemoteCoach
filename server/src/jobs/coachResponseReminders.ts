import { businessRules } from '../config.js';
import * as bookingRepository from '../repositories/bookingRepository.js';
import * as notificationService from '../services/notificationService.js';

export interface CoachResponseRemindersResult {
  remindedBookingIds: string[];
}

/**
 * Job periódico — espejo exacto de jobs/paymentReminders, pero para el lado del entrenador: push
 * + correo para las solicitudes 'requested' cuyo response_deadline está por vencer (ver
 * businessRules.coachResponseReminderHoursBeforeDeadline) y todavía no recibieron el recordatorio.
 * A diferencia del padre (que solo ve un cronómetro si tiene la app abierta), sin esto un
 * entrenador que no está mirando el celular deja vencer una solicitud sin enterarse.
 */
export async function runCoachResponseRemindersJob(): Promise<CoachResponseRemindersResult> {
  const threshold = new Date(Date.now() + businessRules.coachResponseReminderHoursBeforeDeadline * 3600_000);
  const bookings = await bookingRepository.findRequestedBookingsNeedingResponseReminder(threshold);

  const remindedBookingIds: string[] = [];
  for (const booking of bookings) {
    // coachId es directamente el user_id del coach (coach_profiles.user_id) — sin join extra,
    // mismo criterio que requestBooking en bookingService.ts.
    await notificationService.notifyUser(booking.coachId, {
      title: 'Una solicitud está por vencer',
      body: 'Todavía no respondiste una solicitud de reserva — acéptala o recházala antes de que expire.',
      data: { bookingId: booking.id },
    });
    await notificationService.notifyUserByEmail(booking.coachId, {
      subject: 'Una solicitud está por vencer — Remote Coach',
      html: '<p>Todavía no respondiste una solicitud de reserva — entra a la app y acéptala o recházala antes de que expire.</p>',
    });
    await bookingRepository.markResponseReminderSent(booking.id);
    remindedBookingIds.push(booking.id);
  }
  return { remindedBookingIds };
}
