import type { BookingStatus } from './api';
import type { BookingHistoryStatus } from '../mock/parentFlow';

/** Mismas 5 etiquetas para padre y coach (StepperProgress) — un solo vocabulario visual en toda
 * la app para "en qué etapa está esta reserva". */
export const BOOKING_PROGRESS_STEPS = ['Solicitado', 'Aceptado', 'Pagado', 'Confirmado', 'Completado'];

export type BookingProgress =
  | { kind: 'progress'; stepIndex: number; hint: string }
  /** rechazada/cancelada/expirada — no encaja en la línea de tiempo de arriba, se muestra aparte. */
  | { kind: 'terminal'; hint: string };

/** BookingStatusScreen (justo después de solicitar) y cada fila de BookingHistoryScreen — el
 * padre ve exactamente en qué etapa está y qué le toca hacer ahora, sin tener que interpretar
 * solo una píldora de texto. Usa BookingHistoryStatus (el mismo enum de 7 valores ya colapsado
 * que usa toda la pantalla de reservas del padre — ver STATUS_MAP en lib/parentBookingDisplay.ts),
 * no el enum crudo del servidor. */
export function getParentBookingProgress(status: BookingHistoryStatus, coachFirstName: string): BookingProgress {
  switch (status) {
    case 'requested':
      return {
        kind: 'progress',
        stepIndex: 0,
        hint: `Esperando que ${coachFirstName} acepte tu solicitud — normalmente responde en menos de 30 minutos.`,
      };
    case 'accepted':
      return { kind: 'progress', stepIndex: 1, hint: '¡Confirma tu pago para asegurar el cupo!' };
    case 'paymentSubmitted':
      return { kind: 'progress', stepIndex: 2, hint: 'Estamos verificando tu comprobante de pago.' };
    case 'confirmed':
      return {
        kind: 'progress',
        stepIndex: 3,
        hint: `Todo listo — coordina el punto de encuentro con ${coachFirstName} por el chat.`,
      };
    case 'completed':
      return { kind: 'progress', stepIndex: 4, hint: 'El partido ya pasó — mira el reporte en Reportes.' };
    case 'rejected':
      return { kind: 'terminal', hint: `${coachFirstName} no pudo aceptar esta solicitud.` };
    case 'cancelled':
      return { kind: 'terminal', hint: 'Esta reserva fue cancelada.' };
  }
}

/** CoachBookingDetailScreen — mismo criterio que getParentBookingProgress, pero con el enum crudo
 * del servidor (BookingStatus, no el CoachBookingStatus ya colapsado a 3 valores que usa el resto
 * de las pantallas del coach — ese colapso pierde justo la granularidad que este stepper necesita
 * mostrar). */
export function getCoachBookingProgress(status: BookingStatus, parentFirstName: string): BookingProgress {
  switch (status) {
    case 'requested':
      return { kind: 'progress', stepIndex: 0, hint: 'Todavía no respondiste esta solicitud.' };
    case 'accepted':
      return { kind: 'progress', stepIndex: 1, hint: `Esperando que ${parentFirstName} complete el pago.` };
    case 'payment_submitted':
      return { kind: 'progress', stepIndex: 2, hint: 'La plataforma está verificando el comprobante.' };
    case 'paid':
      return {
        kind: 'progress',
        stepIndex: 3,
        hint: `Todo listo — coordina el punto de encuentro con ${parentFirstName} por el chat.`,
      };
    case 'completed':
      return { kind: 'progress', stepIndex: 4, hint: 'Esta sesión ya se completó y el reporte quedó registrado.' };
    case 'payment_failed':
      return { kind: 'progress', stepIndex: 1, hint: `Esperando que ${parentFirstName} reintente el pago.` };
    case 'rejected':
      return { kind: 'terminal', hint: 'Rechazaste esta solicitud.' };
    case 'expired':
      return { kind: 'terminal', hint: 'Esta solicitud expiró sin respuesta.' };
    case 'cancelled':
      return { kind: 'terminal', hint: 'Esta sesión fue cancelada.' };
  }
}
