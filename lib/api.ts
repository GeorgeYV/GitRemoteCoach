/** Cliente HTTP mínimo hacia server/ (ver server/src/routes). Sin auth todavía: los
 * IDs de padre/coach se pasan explícitamente hasta que exista sesión real. */
const DEFAULT_API_BASE_URL = 'http://localhost:3000';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_BASE_URL;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError(0, 'network_error', 'No se pudo conectar con el servidor');
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? 'unknown_error', body?.message ?? 'Error inesperado');
  }
  return body as T;
}

/** Espeja server/src/types.ts#Review — la reseña recién creada, sin el nombre del padre. */
export interface Review {
  id: string;
  bookingId: string;
  parentId: string;
  coachId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

/** Espeja server/src/types.ts#ReviewWithParent — lo que devuelve el listado por coach. */
export interface ReviewWithParent extends Review {
  parentName: string;
}

/** POST /bookings/:id/review — BookingReviewScreen. */
export function submitBookingReview(
  bookingId: string,
  params: { parentId: string; rating: number; comment?: string },
): Promise<Review> {
  return request(`/bookings/${bookingId}/review`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** GET /coaches/:id/reviews — TrainerProfileScreen. */
export function listCoachReviews(coachId: string): Promise<ReviewWithParent[]> {
  return request(`/coaches/${coachId}/reviews`);
}

export type BookingStatus =
  | 'requested'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'payment_failed'
  | 'paid'
  | 'completed'
  | 'cancelled';

/** Subconjunto de server/src/types.ts#Booking — lo que las pantallas de reserva necesitan mostrar. */
export interface Booking {
  id: string;
  status: BookingStatus;
  matchDatetime: string;
  totalAmountPaid: string | null;
  refundAmount: string | null;
  coachCompensationAmount: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

/** GET /bookings/:id — BookingStatusScreen (poll hasta que el coach acepte). */
export function getBooking(bookingId: string): Promise<Booking> {
  return request(`/bookings/${bookingId}`);
}

/** POST /bookings/:id/cancel — BookingCancelScreen. */
export function cancelBooking(
  bookingId: string,
  params: { actor: 'parent'; actorUserId: string; reason?: string },
): Promise<Booking> {
  return request(`/bookings/${bookingId}/cancel`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** POST /bookings — BookingConfirmScreen. Crea la reserva en estado 'requested'. */
export function requestBooking(params: {
  playerId: string;
  coachId: string;
  tournamentId: string;
  matchDatetime: string;
  agreedRate: number;
  note?: string;
}): Promise<Booking> {
  return request('/bookings', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** POST /bookings/:id/pay — BookingPaymentScreen. Solo funciona si el coach ya aceptó la reserva. */
export function payBooking(
  bookingId: string,
  paymentMethodId: string,
): Promise<{ booking: Booking; requiresAction?: { clientSecret: string } }> {
  return request(`/bookings/${bookingId}/pay`, {
    method: 'POST',
    body: JSON.stringify({ paymentMethodId }),
  });
}

export type MessageSenderType = 'coach' | 'parent' | 'system';

/** Espeja server/src/types.ts#BookingMessage. */
export interface BookingMessage {
  id: string;
  bookingId: string;
  senderType: MessageSenderType;
  senderId: string | null;
  body: string;
  createdAt: string;
}

/** GET /bookings/:id/messages — ParentChatScreen. */
export function listBookingMessages(bookingId: string): Promise<BookingMessage[]> {
  return request(`/bookings/${bookingId}/messages`);
}

/** POST /bookings/:id/messages — ParentChatScreen. Rechazado con 409 si la reserva ya no está activa. */
export function sendBookingMessage(
  bookingId: string,
  params: { senderType: MessageSenderType; senderId?: string; body: string },
): Promise<BookingMessage> {
  return request(`/bookings/${bookingId}/messages`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}
