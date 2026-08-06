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

/** Espeja server/src/types.ts#UserRole. */
export type UserRole = 'parent' | 'coach' | 'club_admin' | 'platform_admin';

/** Espeja server/src/types.ts#PublicUser. */
export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  primaryRole: UserRole;
}

export interface AuthSession {
  user: PublicUser;
  token: string;
}

/** POST /auth/register — AuthContext. primaryRole se limita a los roles auto-registrables. */
export function registerUser(params: {
  email: string;
  password: string;
  fullName: string;
  primaryRole: Exclude<UserRole, 'platform_admin'>;
}): Promise<AuthSession> {
  return request('/auth/register', { method: 'POST', body: JSON.stringify(params) });
}

/** POST /auth/login — AuthContext. */
export function loginUser(params: { email: string; password: string }): Promise<AuthSession> {
  return request('/auth/login', { method: 'POST', body: JSON.stringify(params) });
}

/** GET /auth/me — AuthContext, para hidratar/validar la sesión persistida al abrir la app. */
export function getCurrentUser(token: string): Promise<PublicUser> {
  return request('/auth/me', { headers: { Authorization: `Bearer ${token}` } });
}

/** POST /push-tokens — AuthContext, tras login/registro y al hidratar una sesión existente. */
export function registerPushToken(authToken: string, expoPushToken: string): Promise<void> {
  return request('/push-tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ token: expoPushToken }),
  });
}

/** DELETE /push-tokens/:token — AuthContext#logout, best-effort. */
export function unregisterPushToken(authToken: string, expoPushToken: string): Promise<void> {
  return request(`/push-tokens/${encodeURIComponent(expoPushToken)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${authToken}` },
  });
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

/** Espeja server/src/types.ts#CoachSearchResult. */
export interface CoachSearchResult {
  id: string;
  name: string;
  city: string;
  ratingAvg: string;
  yearsExperience: number;
  specialty: string | null;
}

/** GET /coaches?search=&excludeTournamentId= — ClubInviteCoachScreen. */
export function searchCoaches(params: { query?: string; excludeTournamentId?: string }): Promise<CoachSearchResult[]> {
  const qs = new URLSearchParams();
  if (params.query) qs.set('search', params.query);
  if (params.excludeTournamentId) qs.set('excludeTournamentId', params.excludeTournamentId);
  const suffix = qs.toString();
  return request(`/coaches${suffix ? `?${suffix}` : ''}`);
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

/** POST /club-invitations — ClubInviteCoachScreen. Club/federación invita a un entrenador a ser oficial en un torneo. */
export function createClubInvitation(params: {
  clubId: string;
  tournamentId: string;
  coachId: string;
  invitedBy: string;
  message?: string;
}): Promise<ClubCoachInvitation> {
  return request('/club-invitations', {
    method: 'POST',
    body: JSON.stringify(params),
  });
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

/** Espeja server/src/types.ts#ClubSettlement. */
export interface ClubSettlement {
  id: string;
  clubId: string;
  tournamentId: string;
  periodStart: string;
  periodEnd: string;
  totalCommissionAmount: string;
  status: 'pending' | 'paid';
  paymentReference: string | null;
  createdAt: string;
  paidAt: string | null;
}

/** Espeja server/src/types.ts#ClubSettlementWithTournamentName — lo que devuelve el listado por club. */
export interface ClubSettlementWithTournamentName extends ClubSettlement {
  tournamentName: string;
}

/** Espeja server/src/types.ts#Club. */
export interface Club {
  id: string;
  name: string;
  type: 'club' | 'federation';
  city: string;
  contactEmail: string | null;
  contactPhone: string | null;
  defaultCommissionRate: string;
  createdAt: string;
}

/** GET /clubs/:id — ClubHomeScreen. */
export function getClub(clubId: string): Promise<Club> {
  return request(`/clubs/${clubId}`);
}

/** GET /clubs/:id/settlements — ClubSettlementsScreen. */
export function listClubSettlements(clubId: string): Promise<ClubSettlementWithTournamentName[]> {
  return request(`/clubs/${clubId}/settlements`);
}

export type TournamentStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

/** Espeja server/src/types.ts#TournamentSummary — lo que devuelve el listado por club. */
export interface TournamentSummary {
  id: string;
  clubId: string;
  name: string;
  venue: string;
  startDate: string;
  endDate: string;
  status: TournamentStatus;
  officialCoachCount: number;
  pendingCommissionAmount: string;
}

/** GET /clubs/:id/tournaments — ClubTournamentListScreen. */
export function listClubTournaments(clubId: string): Promise<TournamentSummary[]> {
  return request(`/clubs/${clubId}/tournaments`);
}

/** Espeja server/src/types.ts#TournamentCoachTagWithProfile. */
export interface TournamentCoachTagWithProfile {
  coachId: string;
  name: string;
  city: string;
  ratingAvg: string;
  taggedAt: string;
}

/** Espeja server/src/types.ts#ClubCoachInvitationWithCoachName. */
export interface ClubCoachInvitationWithCoachName extends ClubCoachInvitation {
  coachName: string;
}

export interface TournamentRoster {
  officialCoaches: TournamentCoachTagWithProfile[];
  pendingInvitations: ClubCoachInvitationWithCoachName[];
  pendingCommissionAmount: string;
}

/** GET /tournaments/:id/coaches — ClubTournamentDetailScreen. */
export function getTournamentRoster(tournamentId: string): Promise<TournamentRoster> {
  return request(`/tournaments/${tournamentId}/coaches`);
}

/** POST /tournaments/:id/settle — ClubTournamentDetailScreen "Liquidar". */
export function settleTournament(
  tournamentId: string,
): Promise<{ message?: string; settlement: ClubSettlement | null }> {
  return request(`/tournaments/${tournamentId}/settle`, { method: 'POST' });
}

export type MatchBestOf = '1' | '3';
export type MatchPlayerSlot = 'player1' | 'player2';
export type MatchStatus = 'in_progress' | 'completed';
export type CaptureMode = 'rapida' | 'detallada';
export type PointDetail =
  | 'winner_derecha'
  | 'winner_reves'
  | 'winner_volea'
  | 'ace'
  | 'doble_falta'
  | 'error_no_forzado'
  | 'error_forzado';

/** Espeja server/src/types.ts#Match. */
export interface Match {
  id: string;
  bookingId: string;
  player1Id: string;
  player2Label: string;
  bestOf: MatchBestOf;
  noAd: boolean;
  initialServer: MatchPlayerSlot;
  captureMode: CaptureMode;
  status: MatchStatus;
  coachObservations: string | null;
  startedAt: string;
  completedAt: string | null;
}

/** Espeja server/src/types.ts#MatchPointEvent. */
export interface MatchPointEvent {
  id: string;
  matchId: string;
  sequenceNumber: number;
  occurredAt: string;
  wonBy: MatchPlayerSlot;
  detail: PointDetail | null;
  firstServeIn: boolean;
}

export interface MatchPointInput {
  sequenceNumber: number;
  wonBy: MatchPlayerSlot;
  detail: PointDetail | null;
  firstServeIn: boolean;
}

/** POST /matches — CoachMatchSetupScreen "Comenzar captura en vivo". Idempotente por bookingId. */
export function createOrGetMatch(params: {
  bookingId: string;
  player2Label: string;
  bestOf: MatchBestOf;
  noAd: boolean;
  initialServer: MatchPlayerSlot;
  captureMode: CaptureMode;
}): Promise<Match> {
  return request('/matches', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** POST /matches/:id/points — LiveCaptureView, cada punto anotado en vivo. */
export function createMatchPoint(matchId: string, point: MatchPointInput): Promise<MatchPointEvent> {
  return request(`/matches/${matchId}/points`, {
    method: 'POST',
    body: JSON.stringify(point),
  });
}

/** POST /matches/:id/points/bulk — LiveCaptureView, catálogo de recuperación (hidratación de
 * AsyncStorage o botón "Reintentar sincronización"). Idempotente: reenviar puntos ya
 * sincronizados no los duplica. */
export function createMatchPointsBulk(matchId: string, points: MatchPointInput[]): Promise<MatchPointEvent[]> {
  return request(`/matches/${matchId}/points/bulk`, {
    method: 'POST',
    body: JSON.stringify({ points }),
  });
}

/** DELETE /matches/:id/points/:sequenceNumber — LiveCaptureView, deshacer último punto. */
export function deleteMatchPoint(matchId: string, sequenceNumber: number): Promise<void> {
  return request(`/matches/${matchId}/points/${sequenceNumber}`, { method: 'DELETE' });
}

/** POST /matches/:id/restart — MatchSummaryView "Nuevo partido": reinicia el mismo partido
 * (booking_id es UNIQUE, no se puede crear uno nuevo para la misma reserva). */
export function restartMatch(matchId: string): Promise<Match> {
  return request(`/matches/${matchId}/restart`, { method: 'POST' });
}

/** PATCH /matches/:id/status — LiveCaptureView "Finalizar partido" / MatchSummaryView "Deshacer último punto y volver". */
export function updateMatchStatus(matchId: string, status: MatchStatus): Promise<Match> {
  return request(`/matches/${matchId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

/** PATCH /matches/:id/observations — MatchSummaryView, debounced mientras el entrenador escribe. */
export function updateMatchObservations(matchId: string, coachObservations: string): Promise<Match> {
  return request(`/matches/${matchId}/observations`, {
    method: 'PATCH',
    body: JSON.stringify({ coachObservations }),
  });
}

/** PATCH /matches/:id/capture-mode — LiveCaptureView, ModeSwitch (rápida/detallada). */
export function updateMatchCaptureMode(matchId: string, captureMode: CaptureMode): Promise<Match> {
  return request(`/matches/${matchId}/capture-mode`, {
    method: 'PATCH',
    body: JSON.stringify({ captureMode }),
  });
}
