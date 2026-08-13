import type { BookingForParent } from './api';
import type { BookingHistoryEntry, BookingHistoryStatus } from '../mock/parentFlow';

/** Colapsa el enum real de 8 estados al modelo de 5 estados que ya usa BookingHistoryScreen. */
const STATUS_MAP: Record<BookingForParent['status'], BookingHistoryStatus> = {
  requested: 'requested',
  accepted: 'accepted',
  paid: 'confirmed',
  completed: 'completed',
  rejected: 'rejected',
  cancelled: 'cancelled',
  expired: 'cancelled',
  payment_failed: 'cancelled',
};

/** Adapta una reserva real al shape mock/parentFlow.ts#BookingHistoryEntry que ya consume BookingHistoryScreen. */
export function toBookingHistoryEntry(booking: BookingForParent): BookingHistoryEntry {
  const matchDate = new Date(booking.matchDatetime);
  return {
    id: booking.id,
    trainerName: booking.coachName,
    trainerInitial: booking.coachName[0] ?? '?',
    playerName: booking.playerName,
    ageCategory: booking.ageCategory,
    tournamentName: booking.tournamentName,
    date: matchDate.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }),
    time: matchDate.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }),
    venue: booking.tournamentVenue,
    price: Number(booking.agreedRate),
    status: STATUS_MAP[booking.status],
    reviewed: booking.reviewed,
    hasUnreadMessages: booking.hasUnreadMessages,
  };
}
