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
      // Solo se manda Content-Type cuando de verdad hay body — Fastify rechaza con
      // 400 (que este error handler no distingue de un 500) un body vacío con
      // Content-Type: application/json, y varios POST (accept/reject/pay sin
      // requiresAction) no llevan body.
      headers: init?.body ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
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

/** Espeja server/src/types.ts#Booking. */
export interface Booking {
  id: string;
  playerId: string;
  coachId: string;
  tournamentId: string;
  matchDatetime: string;
  agreedRate: string;
  status: BookingStatus;
  parentNote: string | null;
  courtLabel: string | null;
  meetingPointDetail: string | null;
  responseDeadline: string;
  paymentDeadline: string | null;
  totalAmountPaid: string | null;
  coachNetAmount: string | null;
  platformCommissionAmount: string | null;
  clubCommissionAmount: string | null;
  refundAmount: string | null;
  coachCompensationAmount: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  requestedAt: string;
  decidedAt: string | null;
  completedAt: string | null;
}

/** Espeja server/src/types.ts#BookingWithParticipants — lo que devuelve el listado por coach. */
export interface BookingWithParticipants extends Booking {
  playerName: string;
  ageCategory: string;
  parentName: string;
  tournamentName: string;
  tournamentVenue: string;
}

/** GET /bookings/:id — BookingStatusScreen (poll hasta que el coach acepte). */
export function getBooking(bookingId: string): Promise<Booking> {
  return request(`/bookings/${bookingId}`);
}

/** GET /coaches/:id/bookings — CoachHomeScreen, CoachRequestInboxScreen, CoachSessionHistoryScreen, CoachEarningsScreen. */
export function listCoachBookings(coachId: string): Promise<BookingWithParticipants[]> {
  return request(`/coaches/${coachId}/bookings`);
}

/** POST /bookings/:id/accept — CoachRequestInboxScreen. */
export function acceptBookingRequest(bookingId: string): Promise<Booking> {
  return request(`/bookings/${bookingId}/accept`, { method: 'POST' });
}

/** POST /bookings/:id/reject — CoachRequestInboxScreen. */
export function rejectBookingRequest(bookingId: string): Promise<Booking> {
  return request(`/bookings/${bookingId}/reject`, { method: 'POST' });
}

/** POST /bookings/:id/cancel — BookingCancelScreen (parent) y CoachBookingCancelScreen. */
export function cancelBooking(
  bookingId: string,
  params: { actor: 'parent' | 'coach'; actorUserId: string; reason?: string },
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

/** POST /bookings/:id/messages — ParentChatScreen, CoachChatScreen. Rechazado con 409 si la reserva ya no está activa. */
export function sendBookingMessage(
  bookingId: string,
  params: { senderType: MessageSenderType; senderId?: string; body: string },
): Promise<BookingMessage> {
  return request(`/bookings/${bookingId}/messages`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export type AgeCategory = 'U10' | 'U12' | 'U14' | 'U16' | 'U18';
export type PlayingLevel = 'recreativo' | 'competitivo' | 'alto_rendimiento';
export type VerificationStatus = 'pending' | 'approved' | 'rejected';

/** Espeja server/src/types.ts#CoachProfile. */
export interface CoachProfile {
  userId: string;
  city: string;
  region: string | null;
  photoUrl: string | null;
  yearsExperience: number;
  specialty: string | null;
  hourlyRate: string;
  verificationStatus: VerificationStatus;
  ratingAvg: string;
  ratingCount: number;
  bio: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CoachProfileWithTraining {
  profile: CoachProfile;
  ageCategories: AgeCategory[];
  levels: PlayingLevel[];
}

/** GET /coaches/:id — CoachHomeScreen, CoachVerificationPendingScreen, CoachReputationScreen. */
export function getCoachProfile(coachId: string): Promise<CoachProfileWithTraining> {
  return request(`/coaches/${coachId}`);
}

/** PUT /coaches/:id/training — CoachRegistrationScreen. */
export function updateCoachTraining(
  coachId: string,
  params: { ageCategories: AgeCategory[]; levels: PlayingLevel[] },
): Promise<CoachProfileWithTraining> {
  return request(`/coaches/${coachId}/training`, {
    method: 'PUT',
    body: JSON.stringify(params),
  });
}

export type RateMode = 'per_match' | 'per_day' | 'per_tournament';

export interface CoachTournamentAvailability {
  id: string;
  coachId: string;
  tournamentId: string;
  slotDate: string;
  morning: boolean;
  afternoon: boolean;
  updatedAt: string;
}

export interface CoachTournamentRate {
  coachId: string;
  tournamentId: string;
  rateMode: RateMode;
  amount: string;
  updatedAt: string;
}

/** GET /coaches/:coachId/tournaments/:tournamentId/availability — CoachAvailabilityScreen. */
export function getCoachTournamentAvailability(
  coachId: string,
  tournamentId: string,
): Promise<{ availability: CoachTournamentAvailability[]; rate: CoachTournamentRate | null }> {
  return request(`/coaches/${coachId}/tournaments/${tournamentId}/availability`);
}

/** PUT /coaches/:coachId/tournaments/:tournamentId/availability — CoachAvailabilityScreen "Guardar disponibilidad". */
export function setCoachTournamentAvailability(
  coachId: string,
  tournamentId: string,
  days: Array<{ slotDate: string; morning: boolean; afternoon: boolean }>,
): Promise<CoachTournamentAvailability[]> {
  return request(`/coaches/${coachId}/tournaments/${tournamentId}/availability`, {
    method: 'PUT',
    body: JSON.stringify({ days }),
  });
}

/** PUT /coaches/:coachId/tournaments/:tournamentId/rate — CoachAvailabilityScreen. */
export function setCoachTournamentRate(
  coachId: string,
  tournamentId: string,
  params: { rateMode: RateMode; amount: number },
): Promise<CoachTournamentRate> {
  return request(`/coaches/${coachId}/tournaments/${tournamentId}/rate`, {
    method: 'PUT',
    body: JSON.stringify(params),
  });
}

export type ClubInvitationStatus = 'pending' | 'accepted' | 'declined';

/** Espeja server/src/types.ts#ClubCoachInvitation. */
export interface ClubCoachInvitation {
  id: string;
  clubId: string;
  tournamentId: string;
  coachId: string;
  invitedBy: string;
  message: string | null;
  status: ClubInvitationStatus;
  invitedAt: string;
  respondedAt: string | null;
}

/** Espeja server/src/types.ts#ClubCoachInvitationWithNames — lo que devuelve el listado por coach. */
export interface ClubCoachInvitationWithNames extends ClubCoachInvitation {
  clubName: string;
  tournamentName: string;
}

/** GET /coaches/:id/club-invitations — CoachClubInvitationScreen. */
export function listClubInvitations(coachId: string): Promise<ClubCoachInvitationWithNames[]> {
  return request(`/coaches/${coachId}/club-invitations`);
}

/** POST /club-invitations/:id/respond — CoachClubInvitationScreen. */
export function respondClubInvitation(
  invitationId: string,
  decision: 'accepted' | 'declined',
): Promise<ClubCoachInvitation> {
  return request(`/club-invitations/${invitationId}/respond`, {
    method: 'POST',
    body: JSON.stringify({ decision }),
  });
}
