import type { BookingWithParticipants } from './api';
import type { CoachBooking, CoachBookingStatus } from '../mock/coachFlow';

/** Colapsa el enum real de 8 estados al modelo de 3 estados que ya usan las pantallas del coach. */
const STATUS_MAP: Record<BookingWithParticipants['status'], CoachBookingStatus> = {
  requested: 'confirmed',
  accepted: 'confirmed',
  payment_submitted: 'confirmed',
  paid: 'confirmed',
  completed: 'completed',
  cancelled: 'cancelled',
  rejected: 'cancelled',
  expired: 'cancelled',
  payment_failed: 'cancelled',
};

/** Reservas que de verdad van a suceder — lo que CoachHomeScreen llama "próxima sesión". */
const UPCOMING_RAW_STATUSES: BookingWithParticipants['status'][] = ['accepted', 'payment_submitted', 'paid'];

export function isUpcoming(booking: BookingWithParticipants): boolean {
  return UPCOMING_RAW_STATUSES.includes(booking.status) && new Date(booking.matchDatetime).getTime() > Date.now();
}

/** Adapta una reserva real al shape mock/coachFlow.ts#CoachBooking que ya consumen las pantallas del coach. */
export function toCoachBooking(booking: BookingWithParticipants): CoachBooking {
  const matchDate = new Date(booking.matchDatetime);
  return {
    id: booking.id,
    parentName: booking.parentName,
    parentInitial: booking.parentName[0] ?? '?',
    playerName: booking.playerName,
    playerInitial: booking.playerName[0] ?? '?',
    category: booking.ageCategory,
    tournamentName: booking.tournamentName,
    matchDatetime: booking.matchDatetime,
    date: matchDate.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }),
    // null mientras nadie reprogramó con una hora real (ver decisión #53) — matchDate ahí adentro
    // tiene UN valor, pero nadie lo eligió, así que no hay una hora de verdad que mostrar.
    time: booking.scheduleConfirmed ? matchDate.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }) : null,
    scheduleConfirmed: booking.scheduleConfirmed,
    venue: booking.tournamentVenue,
    city: booking.tournamentCity,
    agreedRate: Number(booking.agreedRate),
    coachNetAmount: booking.coachNetAmount !== null ? Number(booking.coachNetAmount) : undefined,
    status: STATUS_MAP[booking.status],
    readyToComplete: booking.status === 'paid',
    hasUnreadMessages: booking.hasUnreadMessages,
    matchStatus: booking.matchStatus ?? null,
  };
}
