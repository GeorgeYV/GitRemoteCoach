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

/** POST /bookings/:id/review — BookingReviewScreen. parentId se deriva de la sesión en el server. */
export function submitBookingReview(
  authToken: string,
  bookingId: string,
  params: { rating: number; comment?: string },
): Promise<Review> {
  return request(`/bookings/${bookingId}/review`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
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
export function getBooking(authToken: string, bookingId: string): Promise<Booking> {
  return request(`/bookings/${bookingId}`, { headers: { Authorization: `Bearer ${authToken}` } });
}

/** Espeja server/src/services/bookingService.ts#AlternativeCoach — sugerencia simple (mismo
 * torneo, sin lógica real de matching/disponibilidad) para cuando la reserva original no prosperó. */
export interface AlternativeCoach {
  coachId: string;
  name: string;
  ratingAvg: number;
}

/** GET /bookings/:id/alternatives — BookingStatusScreen, cuando la reserva termina 'rejected' o 'expired'. */
export function getBookingAlternatives(authToken: string, bookingId: string): Promise<AlternativeCoach[]> {
  return request(`/bookings/${bookingId}/alternatives`, { headers: { Authorization: `Bearer ${authToken}` } });
}

/** GET /coaches/:id/bookings — CoachHomeScreen, CoachRequestInboxScreen, CoachSessionHistoryScreen, CoachEarningsScreen. */
export function listCoachBookings(authToken: string, coachId: string): Promise<BookingWithParticipants[]> {
  return request(`/coaches/${coachId}/bookings`, { headers: { Authorization: `Bearer ${authToken}` } });
}

/** Espeja server/src/types.ts#BookingForParent — lo que devuelve el listado por padre. */
export interface BookingForParent extends Booking {
  coachName: string;
  playerName: string;
  ageCategory: AgeCategory;
  tournamentName: string;
  tournamentVenue: string;
  reviewed: boolean;
}

/** GET /parents/:id/bookings — BookingHistoryScreen. */
export function listParentBookings(authToken: string, parentUserId: string): Promise<BookingForParent[]> {
  return request(`/parents/${parentUserId}/bookings`, { headers: { Authorization: `Bearer ${authToken}` } });
}

/** POST /bookings/:id/accept — CoachRequestInboxScreen. */
export function acceptBookingRequest(authToken: string, bookingId: string): Promise<Booking> {
  return request(`/bookings/${bookingId}/accept`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** POST /bookings/:id/reject — CoachRequestInboxScreen. */
export function rejectBookingRequest(authToken: string, bookingId: string): Promise<Booking> {
  return request(`/bookings/${bookingId}/reject`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** POST /bookings/:id/cancel — BookingCancelScreen (parent) y CoachBookingCancelScreen. actor/actorUserId
 * se derivan de la sesión en el server (no del cliente). */
export function cancelBooking(
  authToken: string,
  bookingId: string,
  params: { reason?: string },
): Promise<Booking> {
  return request(`/bookings/${bookingId}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(params),
  });
}

/** POST /bookings/:id/complete — CoachBookingDetailScreen "Marcar sesión como completada". Solo el
 * entrenador de la reserva puede liberar su propio pago; requiere que ya esté 'paid'. */
export function completeBooking(authToken: string, bookingId: string): Promise<Booking> {
  return request(`/bookings/${bookingId}/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** PATCH /bookings/:id/meeting-details — CoachPreMatchReminderScreen. Solo el entrenador de la
 * reserva puede fijar la logística de encuentro (cancha, punto de encuentro). */
export function setMeetingDetails(
  authToken: string,
  bookingId: string,
  params: { courtLabel?: string; meetingPointDetail?: string },
): Promise<Booking> {
  return request(`/bookings/${bookingId}/meeting-details`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(params),
  });
}

/** POST /bookings — BookingConfirmScreen. Crea la reserva en estado 'requested'. */
export function requestBooking(
  authToken: string,
  params: {
    playerId: string;
    coachId: string;
    tournamentId: string;
    matchDatetime: string;
    agreedRate: number;
    note?: string;
  },
): Promise<Booking> {
  return request('/bookings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(params),
  });
}

/** POST /bookings/:id/pay — BookingPaymentScreen. Solo funciona si el coach ya aceptó la reserva. */
export function payBooking(
  authToken: string,
  bookingId: string,
  paymentMethodId: string,
): Promise<{ booking: Booking; requiresAction?: { clientSecret: string } }> {
  return request(`/bookings/${bookingId}/pay`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
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
export function listBookingMessages(authToken: string, bookingId: string): Promise<BookingMessage[]> {
  return request(`/bookings/${bookingId}/messages`, { headers: { Authorization: `Bearer ${authToken}` } });
}

/** POST /bookings/:id/messages — ParentChatScreen, CoachChatScreen. Rechazado con 409 si la reserva ya no
 * está activa. senderType/senderId se derivan de la sesión en el server. */
export function sendBookingMessage(
  authToken: string,
  bookingId: string,
  params: { body: string },
): Promise<BookingMessage> {
  return request(`/bookings/${bookingId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(params),
  });
}

export type AgeCategory = 'U10' | 'U12' | 'U14' | 'U16' | 'U18';
export type PlayingLevel = 'recreativo' | 'competitivo' | 'alto_rendimiento';
export type VerificationStatus = 'pending' | 'approved' | 'rejected';
export type VerificationDocType = 'identity' | 'background_check' | 'certification' | 'club_reference';

/** Espeja server/src/types.ts#CoachVerificationDocument. */
export interface CoachVerificationDocument {
  id: string;
  coachId: string;
  docType: VerificationDocType;
  fileUrl: string;
  status: VerificationStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  uploadedAt: string;
}

/** Espeja server/src/types.ts#CoachProfile. */
export interface CoachProfile {
  userId: string;
  fullName: string;
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

/** POST /coaches — CoachRegistrationScreen "Enviar para verificación". Crea el perfil del coach
 * de la sesión (deriva el user_id del token, no de un id que mande el cliente). */
export function registerCoachProfile(
  authToken: string,
  params: {
    city: string;
    region?: string;
    yearsExperience: number;
    specialty?: string;
    hourlyRate: number;
    ageCategories: AgeCategory[];
    levels: PlayingLevel[];
    documents: { docType: VerificationDocType; fileUrl: string }[];
  },
): Promise<CoachProfileWithTraining> {
  return request('/coaches', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(params),
  });
}

/** GET /coaches/:id/verification-documents — CoachVerificationPendingScreen: checklist real del
 * propio entrenador (no público, requiere ser el dueño de la sesión). */
export function listCoachVerificationDocuments(authToken: string, coachId: string): Promise<CoachVerificationDocument[]> {
  return request(`/coaches/${coachId}/verification-documents`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** PUT /coaches/:id/training — CoachRegistrationScreen. */
export function updateCoachTraining(
  authToken: string,
  coachId: string,
  params: { ageCategories: AgeCategory[]; levels: PlayingLevel[] },
): Promise<CoachProfileWithTraining> {
  return request(`/coaches/${coachId}/training`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(params),
  });
}

/** Espeja server/src/types.ts#Player. */
export interface Player {
  id: string;
  guardianUserId: string;
  fullName: string;
  birthDate: string;
  ageCategory: AgeCategory;
  createdAt: string;
}

/** GET /players — BookingConfirmScreen: hijos/as del padre de la sesión. */
export function listPlayers(authToken: string): Promise<Player[]> {
  return request('/players', { headers: { Authorization: `Bearer ${authToken}` } });
}

/** POST /players — PlayerRegistrationScreen. Crea al hijo/a del padre de la sesión (deriva el
 * guardián del token, no de un id que mande el cliente). */
export function registerPlayer(
  authToken: string,
  params: { fullName: string; birthDate: string; ageCategory: AgeCategory },
): Promise<Player> {
  return request('/players', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
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
  authToken: string,
  coachId: string,
  tournamentId: string,
  days: Array<{ slotDate: string; morning: boolean; afternoon: boolean }>,
): Promise<CoachTournamentAvailability[]> {
  return request(`/coaches/${coachId}/tournaments/${tournamentId}/availability`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ days }),
  });
}

/** PUT /coaches/:coachId/tournaments/:tournamentId/rate — CoachAvailabilityScreen. */
export function setCoachTournamentRate(
  authToken: string,
  coachId: string,
  tournamentId: string,
  params: { rateMode: RateMode; amount: number },
): Promise<CoachTournamentRate> {
  return request(`/coaches/${coachId}/tournaments/${tournamentId}/rate`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${authToken}` },
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
export function listClubInvitations(authToken: string, coachId: string): Promise<ClubCoachInvitationWithNames[]> {
  return request(`/coaches/${coachId}/club-invitations`, { headers: { Authorization: `Bearer ${authToken}` } });
}

/** POST /club-invitations — ClubInviteCoachScreen. Club/federación invita a un entrenador a ser oficial en un
 * torneo. invitedBy se deriva de la sesión en el server (no del cliente). */
export function createClubInvitation(
  authToken: string,
  params: {
    clubId: string;
    tournamentId: string;
    coachId: string;
    message?: string;
  },
): Promise<ClubCoachInvitation> {
  return request('/club-invitations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(params),
  });
}

/** POST /club-invitations/:id/respond — CoachClubInvitationScreen. */
export function respondClubInvitation(
  authToken: string,
  invitationId: string,
  decision: 'accepted' | 'declined',
): Promise<ClubCoachInvitation> {
  return request(`/club-invitations/${invitationId}/respond`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
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

/** GET /club-admins/:userId/club — ClubFlow, para resolver el club del club_admin logueado. */
export function getClubForAdmin(userId: string): Promise<Club> {
  return request(`/club-admins/${userId}/club`);
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

/** POST /clubs/:id/tournaments — ClubCreateTournamentScreen. Solo un admin del club (derivado de
 * la sesión en el server) puede crear torneos para ese club. */
export function createTournament(
  authToken: string,
  clubId: string,
  params: { name: string; venue: string; startDate: string; endDate: string },
): Promise<TournamentSummary> {
  return request(`/clubs/${clubId}/tournaments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(params),
  });
}

/** Espeja server/src/types.ts#TournamentSearchResult — descubrimiento público de torneos activos. */
export interface TournamentSearchResult {
  id: string;
  name: string;
  venue: string;
  city: string;
  startDate: string;
  endDate: string;
}

/** GET /tournaments?search= — CoachTournamentSearchScreen. */
export function searchTournaments(query?: string): Promise<TournamentSearchResult[]> {
  const qs = new URLSearchParams();
  if (query) qs.set('search', query);
  const suffix = qs.toString();
  return request(`/tournaments${suffix ? `?${suffix}` : ''}`);
}

/** Espeja server/src/types.ts#CoachClubTag — insignias de "oficial" del propio entrenador. */
export interface CoachClubTag {
  tournamentId: string;
  tournamentName: string;
  clubName: string;
  taggedAt: string;
}

/** GET /coaches/:id/club-tags — CoachAvailabilityScreen, CoachTournamentSearchScreen, CoachReputationScreen. */
export function listCoachClubTags(coachId: string): Promise<CoachClubTag[]> {
  return request(`/coaches/${coachId}/club-tags`);
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

/** POST /tournaments/:id/settle — ClubTournamentDetailScreen "Liquidar". Solo un admin del
 * club dueño del torneo puede liquidarlo (verificado en el server contra la sesión). */
export function settleTournament(
  authToken: string,
  tournamentId: string,
): Promise<{ message?: string; settlement: ClubSettlement | null }> {
  return request(`/tournaments/${tournamentId}/settle`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  });
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

export interface MatchReport {
  match: Match;
  points: MatchPointEvent[];
}

/** GET /bookings/:id/match — ParentReportsScreen. El padre o el entrenador de la reserva pueden
 * leerlo; null si la reserva nunca tuvo una captura en vivo (no es un error). */
export function getBookingMatch(authToken: string, bookingId: string): Promise<MatchReport | null> {
  return request(`/bookings/${bookingId}/match`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** POST /matches — CoachMatchSetupScreen "Comenzar captura en vivo". Idempotente por bookingId.
 * Solo el entrenador dueño de la reserva puede iniciar la captura (verificado en el server). */
export function createOrGetMatch(
  authToken: string,
  params: {
    bookingId: string;
    player2Label: string;
    bestOf: MatchBestOf;
    noAd: boolean;
    initialServer: MatchPlayerSlot;
    captureMode: CaptureMode;
  },
): Promise<Match> {
  return request('/matches', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(params),
  });
}

/** POST /matches/:id/points — LiveCaptureView, cada punto anotado en vivo. */
export function createMatchPoint(authToken: string, matchId: string, point: MatchPointInput): Promise<MatchPointEvent> {
  return request(`/matches/${matchId}/points`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(point),
  });
}

/** POST /matches/:id/points/bulk — LiveCaptureView, catálogo de recuperación (hidratación de
 * AsyncStorage o botón "Reintentar sincronización"). Idempotente: reenviar puntos ya
 * sincronizados no los duplica. */
export function createMatchPointsBulk(
  authToken: string,
  matchId: string,
  points: MatchPointInput[],
): Promise<MatchPointEvent[]> {
  return request(`/matches/${matchId}/points/bulk`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ points }),
  });
}

/** DELETE /matches/:id/points/:sequenceNumber — LiveCaptureView, deshacer último punto. */
export function deleteMatchPoint(authToken: string, matchId: string, sequenceNumber: number): Promise<void> {
  return request(`/matches/${matchId}/points/${sequenceNumber}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** POST /matches/:id/restart — MatchSummaryView "Nuevo partido": reinicia el mismo partido
 * (booking_id es UNIQUE, no se puede crear uno nuevo para la misma reserva). */
export function restartMatch(authToken: string, matchId: string): Promise<Match> {
  return request(`/matches/${matchId}/restart`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** PATCH /matches/:id/status — LiveCaptureView "Finalizar partido" / MatchSummaryView "Deshacer último punto y volver". */
export function updateMatchStatus(authToken: string, matchId: string, status: MatchStatus): Promise<Match> {
  return request(`/matches/${matchId}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ status }),
  });
}

/** PATCH /matches/:id/observations — MatchSummaryView, debounced mientras el entrenador escribe. */
export function updateMatchObservations(authToken: string, matchId: string, coachObservations: string): Promise<Match> {
  return request(`/matches/${matchId}/observations`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ coachObservations }),
  });
}

/** PATCH /matches/:id/capture-mode — LiveCaptureView, ModeSwitch (rápida/detallada). */
export function updateMatchCaptureMode(authToken: string, matchId: string, captureMode: CaptureMode): Promise<Match> {
  return request(`/matches/${matchId}/capture-mode`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ captureMode }),
  });
}
