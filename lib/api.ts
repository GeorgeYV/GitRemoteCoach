import type { MatchFormatId } from './matchFormats';
import type { ShotType } from './shotTypes';

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
      // requiresAction) no llevan body. FormData (uploadCoachPhoto) es la excepción: fetch
      // necesita fijar su propio Content-Type con el boundary del multipart, forzar
      // application/json ahí rompe el parseo en el servidor.
      headers:
        init?.body && !(init.body instanceof FormData)
          ? { 'Content-Type': 'application/json', ...init?.headers }
          : init?.headers,
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
  phone: string | null;
  primaryRole: UserRole;
  /** NULL = correo sin verificar (ver decisión #48 en db/schema.sql). */
  emailVerifiedAt: string | null;
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

/** PUT /auth/me — ParentProfileScreen "Editar perfil". Solo nombre y teléfono. */
export function updateProfile(authToken: string, params: { fullName: string; phone?: string }): Promise<PublicUser> {
  return request('/auth/me', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(params),
  });
}

/** POST /auth/forgot-password — ForgotPasswordScreen paso 1. Siempre resuelve 200
 * (enumeration-safe), aunque el correo no exista. */
export function requestPasswordReset(email: string): Promise<{ message: string }> {
  return request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
}

/** POST /auth/reset-password — ForgotPasswordScreen paso 2. */
export function resetPassword(params: { email: string; code: string; newPassword: string }): Promise<{
  message: string;
}> {
  return request('/auth/reset-password', { method: 'POST', body: JSON.stringify(params) });
}

/** POST /auth/verify-email — VerifyEmailGateScreen. Devuelve el usuario actualizado (con
 * emailVerifiedAt ya poblado) para que AuthContext pueda salir de la pantalla de bloqueo. */
export function verifyEmail(authToken: string, code: string): Promise<PublicUser> {
  return request('/auth/verify-email', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ code }),
  });
}

/** POST /auth/resend-verification — VerifyEmailGateScreen "Reenviar código". */
export function resendVerificationCode(authToken: string): Promise<{ message: string }> {
  return request('/auth/resend-verification', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** PUT /auth/me/email — VerifyEmailGateScreen "¿Correo incorrecto?". Reinicia la verificación y
 * manda un código nuevo a la dirección corregida. */
export function changeEmail(authToken: string, email: string): Promise<PublicUser> {
  return request('/auth/me/email', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ email }),
  });
}

export type GoogleSignInResult =
  | { status: 'loggedIn'; user: PublicUser; token: string }
  | { status: 'pendingRegistration'; pendingToken: string; email: string; name: string };

/** POST /auth/google — LoginScreen, tras completar el intercambio OAuth con expo-auth-session.
 * Discrimina la respuesta del backend (o ya hay sesión, o falta elegir rol para una cuenta nueva). */
export async function signInWithGoogle(params: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<GoogleSignInResult> {
  const body = await request<{
    user?: PublicUser;
    token?: string;
    pendingRegistration?: boolean;
    pendingToken?: string;
    email?: string;
    name?: string;
  }>('/auth/google', { method: 'POST', body: JSON.stringify(params) });

  if (body.pendingRegistration) {
    return { status: 'pendingRegistration', pendingToken: body.pendingToken!, email: body.email!, name: body.name! };
  }
  return { status: 'loggedIn', user: body.user!, token: body.token! };
}

/** POST /auth/google/complete-registration — LoginScreen, paso de "¿qué rol tienes?" tras una
 * identidad de Google nueva. */
export function completeGoogleRegistration(params: {
  pendingToken: string;
  primaryRole: Exclude<UserRole, 'platform_admin'>;
}): Promise<AuthSession> {
  return request('/auth/google/complete-registration', { method: 'POST', body: JSON.stringify(params) });
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
  | 'payment_submitted'
  | 'rejected'
  | 'expired'
  | 'payment_failed'
  | 'paid'
  | 'completed'
  | 'cancelled';

/** Espeja server/src/types.ts#PaymentProvider. */
export type PaymentProvider = 'deuna' | 'yape' | 'plin' | 'bank_transfer';

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
  // Cuánto se le debe al entrenador se agrega al cerrar el torneo (settlementService.
  // settleTournamentCoachPayouts), no al completar cada reserva — nulo == todavía no incluido en
  // un pago agregado a este entrenador (ver CoachEarningsScreen).
  coachPayoutId: string | null;
  refundAmount: string | null;
  coachCompensationAmount: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  paymentProvider: PaymentProvider | null;
  paymentSubmittedAt: string | null;
  paymentReference: string | null;
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
  tournamentCity?: string;
  hasUnreadMessages: boolean;
  /** Solo poblado por listCoachBookings — null si el entrenador nunca inició la captura en vivo. */
  matchStatus?: MatchStatus | null;
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
  tournamentCity: string;
  tournamentCountry: CountryCode | null;
  tournamentStartDate: string;
  tournamentEndDate: string;
  reviewed: boolean;
  hasUnreadMessages: boolean;
  /** null si el entrenador nunca inició la captura en vivo. */
  matchStatus: MatchStatus | null;
}

/** GET /parents/:id/bookings — BookingHistoryScreen. */
export function listParentBookings(authToken: string, parentUserId: string): Promise<BookingForParent[]> {
  return request(`/parents/${parentUserId}/bookings`, { headers: { Authorization: `Bearer ${authToken}` } });
}

/** GET /parents/:id/bookings/badge-summary — ParentTabBar. */
export function getParentBookingBadgeSummary(
  authToken: string,
  parentUserId: string,
): Promise<{ pending: number; decidedUnseen: number; unreadMessages: number }> {
  return request(`/parents/${parentUserId}/bookings/badge-summary`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** POST /parents/:id/bookings/mark-decisions-seen — BookingHistoryScreen, al montar. */
export function markParentBookingDecisionsSeen(authToken: string, parentUserId: string): Promise<void> {
  return request(`/parents/${parentUserId}/bookings/mark-decisions-seen`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  });
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

/** PATCH /bookings/:id/reschedule — cualquiera de las dos partes puede cambiar el horario
 * directamente, sin que la otra tenga que aprobarlo. matchDatetime en ISO-8601. */
export function rescheduleBooking(authToken: string, bookingId: string, matchDatetime: string): Promise<Booking> {
  return request(`/bookings/${bookingId}/reschedule`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ matchDatetime }),
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

/** POST /bookings/:id/pay — cargo directo con Stripe. Ninguna pantalla lo llama hoy (el flujo
 * real es 100% manual, ver submitPaymentProofBatch abajo); se deja disponible para cuando se
 * reactive Stripe. */
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

/** POST /bookings/pay-batch — variante de payBooking para varios días con el mismo entrenador en
 * un solo cargo. Mismo estado "sin uso hoy" que payBooking. */
export function payBookingsBatch(
  authToken: string,
  bookingIds: string[],
  paymentMethodId: string,
): Promise<{ bookings: Booking[]; requiresAction?: { clientSecret: string } }> {
  return request('/bookings/pay-batch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ bookingIds, paymentMethodId }),
  });
}

/** Cuenta de cobro por app P2P (número/celular alcanza — Deuna en Ecuador, Yape/Plin en Perú). */
export interface PhonePaymentAccount {
  provider: 'deuna' | 'yape' | 'plin';
  label: string;
  handle: string;
}

/** Cuenta de cobro por transferencia bancaria tradicional — a diferencia de las apps P2P, hace
 * falta más que un número de celular para identificar la cuenta. interbankAccountNumber (CCI en
 * Perú) es opcional — solo aplica para transferencias desde un banco distinto. */
export interface BankTransferAccount {
  provider: 'bank_transfer';
  label: string;
  bankName: string;
  accountType: string;
  accountNumber: string;
  accountHolderName: string;
  interbankAccountNumber?: string;
}

export type PaymentAccount = PhonePaymentAccount | BankTransferAccount;

/** Cuentas de cobro de la plataforma por país — mostradas en BookingPaymentScreen. Espeja
 * server/src/config.ts#paymentCollectionAccounts. */
export type PaymentInstructions = Record<'EC' | 'PE', PaymentAccount[]>;

/** GET /payment-instructions — a qué cuenta pagar según el país del torneo. */
export function getPaymentInstructions(authToken: string): Promise<PaymentInstructions> {
  return request('/payment-instructions', { headers: { Authorization: `Bearer ${authToken}` } });
}

/** POST /bookings/submit-payment-proof-batch — mismo criterio que payBookingsBatch: un solo
 * comprobante cubre varias reservas pagadas juntas en un solo envío por Deuna/Yape/Plin.
 * BookingPaymentScreen la usa incluso para una sola reserva (un arreglo de un elemento funciona
 * igual) — no existe una variante singular en el cliente por eso mismo. */
export function submitPaymentProofBatch(
  authToken: string,
  bookingIds: string[],
  params: { provider: PaymentProvider; referenceCode: string },
): Promise<Booking[]> {
  return request('/bookings/submit-payment-proof-batch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ bookingIds, ...params }),
  });
}

/** GET /bookings/payment-verification-queue — PlatformAdminPaymentsScreen: reservas con un
 * comprobante enviado, esperando confirmación. */
export function listPaymentVerificationQueue(authToken: string): Promise<BookingWithParticipants[]> {
  return request('/bookings/payment-verification-queue', { headers: { Authorization: `Bearer ${authToken}` } });
}

/** GET /bookings/refunds — PlatformAdminRefundsScreen: reservas canceladas con reembolso
 * calculado, para que el admin sepa cuánto y por qué canal devolverle la plata a cada padre. */
export function listRefunds(authToken: string): Promise<BookingWithParticipants[]> {
  return request('/bookings/refunds', { headers: { Authorization: `Bearer ${authToken}` } });
}

/** PUT /bookings/verify-payment — PlatformAdminPaymentsScreen: confirma o rechaza un lote de
 * pagos manuales enviados juntos (mismo código de referencia). */
export function verifyPayment(
  authToken: string,
  bookingIds: string[],
  decision: 'verified' | 'rejected',
): Promise<Booking[]> {
  return request('/bookings/verify-payment', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ bookingIds, decision }),
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

/** POST /bookings/:id/messages/mark-read — ParentChatScreen, CoachChatScreen, al montar. */
export function markBookingMessagesRead(authToken: string, bookingId: string): Promise<void> {
  return request(`/bookings/${bookingId}/messages/mark-read`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
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
  country: CountryCode | null;
  photoUrl: string | null;
  yearsExperience: number;
  specialty: string | null;
  verificationStatus: VerificationStatus;
  ratingAvg: string;
  ratingCount: number;
  bio: string | null;
  createdAt: string;
  updatedAt: string;
}

/** backgroundCheck/certification: documentos opcionales (ver decisión #43 en db/schema.sql) —
 * no afectan verificationStatus, se muestran como distintivo aparte en TrainerProfileScreen. */
export interface CoachVerifiedBadges {
  backgroundCheck: boolean;
  certification: boolean;
}

export interface CoachProfileWithTraining {
  profile: CoachProfile;
  ageCategories: AgeCategory[];
  levels: PlayingLevel[];
}

/** Espeja server/src/services/coachProfileService.ts#CoachProfileWithTrainingAndBadges — solo lo
 * que devuelve GET /coaches/:id (el perfil público); registerCoachProfile/updateCoachTraining
 * siguen devolviendo CoachProfileWithTraining sin badges. */
export interface CoachProfileWithTrainingAndBadges extends CoachProfileWithTraining {
  verifiedBadges: CoachVerifiedBadges;
}

/** GET /coaches/:id — CoachHomeScreen, CoachVerificationPendingScreen, CoachReputationScreen,
 * TrainerProfileScreen. */
export function getCoachProfile(coachId: string): Promise<CoachProfileWithTrainingAndBadges> {
  return request(`/coaches/${coachId}`);
}

/** Espeja server/src/types.ts#CoachReportSummary. */
export interface CoachReportSummary {
  matchesCount: number;
  winners: number;
  unforcedErrors: number;
  firstServePct: number | null;
  breaksConverted: number;
  returnGamesPlayed: number;
}

/** GET /coaches/:id/report-summary — TrainerProfileScreen: stats agregadas de todos los partidos
 * completados del coach (público, igual que GET /coaches/:id). null si todavía no tiene ninguno. */
export function getCoachReportSummary(coachId: string): Promise<CoachReportSummary | null> {
  return request(`/coaches/${coachId}/report-summary`);
}

export interface SuspendedMatchSummary {
  matchId: string;
  bookingId: string;
  playerName: string;
}

/** GET /coaches/:id/suspended-match — CoachHomeScreen: banner prioritario de un partido
 * suspendido pendiente de retomar. Privado (solo el propio entrenador), a diferencia de
 * report-summary. null si no hay ninguno suspendido. */
export function getSuspendedMatch(authToken: string, coachId: string): Promise<SuspendedMatchSummary | null> {
  return request(`/coaches/${coachId}/suspended-match`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** GET /coaches/:id/retired-bookings — CoachSessionHistoryScreen: ids de reserva cuyo partido
 * terminó por retiro, para la insignia roja en la lista. */
export function listRetiredBookingIds(authToken: string, coachId: string): Promise<string[]> {
  return request(`/coaches/${coachId}/retired-bookings`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
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
    country: CountryCode;
    yearsExperience: number;
    specialty?: string;
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

/** PUT /coaches/:id/profile — CoachRegistrationScreen "Editar perfil". Datos personales, sin
 * ageCategories/levels (ver updateCoachTraining) ni documentos/verificación. */
export function updateCoachProfileDetails(
  authToken: string,
  coachId: string,
  params: {
    city: string;
    region?: string;
    country: CountryCode;
    yearsExperience: number;
    specialty?: string;
  },
): Promise<CoachProfile> {
  return request(`/coaches/${coachId}/profile`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(params),
  });
}

/** POST /coaches/:id/photo — CoachRegistrationScreen "Agregar foto de perfil". `photo.file` es un
 * File real (solo lo trae expo-image-picker en target web); en nativo, FormData usa en cambio el
 * shape {uri, name, type} que su polyfill de fetch sabe interpretar como un archivo a streamear. */
export function uploadCoachPhoto(
  authToken: string,
  coachId: string,
  photo: { uri: string; name: string; type: string; file?: File },
): Promise<CoachProfile> {
  const formData = new FormData();
  if (photo.file) {
    formData.append('file', photo.file, photo.name);
  } else {
    // React Native's FormData acepta este shape (no es un File real) para subir un archivo local
    // por su uri — no está tipado así en lib.dom.d.ts, de ahí el `as any`.
    formData.append('file', { uri: photo.uri, name: photo.name, type: photo.type } as any);
  }
  return request(`/coaches/${coachId}/photo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: formData,
  });
}

/** POST /coaches/:id/verification-documents/upload — CoachRegistrationScreen: sube el archivo
 * real de un documento del checklist antes de enviar el registro. `coachId` es el propio userId
 * autenticado (todavía no existe la fila en coach_profiles) — mismo patrón multipart que
 * uploadCoachPhoto. */
export function uploadCoachVerificationDocument(
  authToken: string,
  coachId: string,
  docType: VerificationDocType,
  file: { uri: string; name: string; type: string; file?: File },
): Promise<{ fileUrl: string }> {
  const formData = new FormData();
  formData.append('docType', docType);
  if (file.file) {
    formData.append('file', file.file, file.name);
  } else {
    formData.append('file', { uri: file.uri, name: file.name, type: file.type } as any);
  }
  return request(`/coaches/${coachId}/verification-documents/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: formData,
  });
}

/** GET /coaches/:id/verification-documents — CoachVerificationPendingScreen: checklist real del
 * propio entrenador (no público, requiere ser el dueño de la sesión). */
export function listCoachVerificationDocuments(authToken: string, coachId: string): Promise<CoachVerificationDocument[]> {
  return request(`/coaches/${coachId}/verification-documents`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** Espeja server/src/types.ts#CoachVerificationDocumentWithCoachName. */
export interface CoachVerificationDocumentWithCoachName extends CoachVerificationDocument {
  coachName: string;
}

/** GET /coach-verification-documents/pending — PlatformAdminReviewScreen: cola de revisión,
 * solo visible para el rol platform_admin. */
export function listPendingVerificationDocuments(authToken: string): Promise<CoachVerificationDocumentWithCoachName[]> {
  return request('/coach-verification-documents/pending', {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** PUT /coach-verification-documents/:id/review — PlatformAdminReviewScreen: aprobar o rechazar
 * un documento individual. */
export function reviewVerificationDocument(
  authToken: string,
  documentId: string,
  status: Extract<VerificationStatus, 'approved' | 'rejected'>,
): Promise<CoachVerificationDocument> {
  return request(`/coach-verification-documents/${documentId}/review`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ status }),
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

/** Espeja el DOMAIN country_code (db/schema.sql#35). */
export type CountryCode = 'EC' | 'PE' | 'CO' | 'CL' | 'BO' | 'AR' | 'VE' | 'BR' | 'PY' | 'UY';

/** Espeja server/src/types.ts#Player. */
export interface Player {
  id: string;
  guardianUserId: string;
  fullName: string;
  birthDate: string;
  ageCategory: AgeCategory;
  country: CountryCode | null;
  /** Ver decisión #44 en db/schema.sql — false lo saca del selector de reservas. Reversible. */
  active: boolean;
  createdAt: string;
}

/** GET /players — BookingConfirmScreen/PlayerPickerScreen (activeOnly: true, no ofrecer un
 * jugador archivado) y ParentProfileScreen (sin opciones, trae todos). */
export function listPlayers(authToken: string, options: { activeOnly?: boolean } = {}): Promise<Player[]> {
  const suffix = options.activeOnly ? '?activeOnly=true' : '';
  return request(`/players${suffix}`, { headers: { Authorization: `Bearer ${authToken}` } });
}

/** PUT /players/:id/active — ParentProfileScreen "Archivar"/"Reactivar". */
export function setPlayerActive(authToken: string, playerId: string, active: boolean): Promise<Player> {
  return request(`/players/${playerId}/active`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ active }),
  });
}

/** POST /players — PlayerRegistrationScreen. Crea al hijo/a del padre de la sesión (deriva el
 * guardián del token, no de un id que mande el cliente). */
export function registerPlayer(
  authToken: string,
  params: { fullName: string; birthDate: string; ageCategory: AgeCategory; country: CountryCode },
): Promise<Player> {
  return request('/players', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(params),
  });
}

/** PUT /players/:id — ParentProfileScreen "Editar jugador". */
export function updatePlayer(
  authToken: string,
  playerId: string,
  params: { fullName: string; birthDate: string; ageCategory: AgeCategory; country: CountryCode },
): Promise<Player> {
  return request(`/players/${playerId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(params),
  });
}

export type RateMode = 'per_day' | 'per_tournament';

export interface CoachTournamentAvailability {
  id: string;
  coachId: string;
  tournamentId: string;
  slotDate: string;
  available: boolean;
  /** Bloque horario de excepción dentro de un día disponible (HH:MM), ej. coach da clases de
   * 15:00 a 17:00 — ambos null o ambos presentes. */
  unavailableFrom: string | null;
  unavailableTo: string | null;
  updatedAt: string;
}

export interface CoachTournamentRate {
  coachId: string;
  tournamentId: string;
  rateMode: RateMode;
  amount: string;
  /** Cómo va a ser el entrenamiento/seguimiento/activación del coach durante este torneo — texto
   * libre que el padre lee en TrainerProfileScreen antes de reservar. */
  approachDescription: string | null;
  updatedAt: string;
}

/** GET /coaches/:coachId/tournaments/:tournamentId/availability — CoachAvailabilityScreen. */
export function getCoachTournamentAvailability(
  coachId: string,
  tournamentId: string,
): Promise<{ availability: CoachTournamentAvailability[]; rate: CoachTournamentRate | null }> {
  return request(`/coaches/${coachId}/tournaments/${tournamentId}/availability`);
}

/** GET /coaches/:coachId/tournaments/:tournamentId/booking-count — TrainerProfileScreen. */
export function getCoachTournamentBookingCount(
  coachId: string,
  tournamentId: string,
): Promise<{ bookedPlayers: number }> {
  return request(`/coaches/${coachId}/tournaments/${tournamentId}/booking-count`);
}

export interface BookedPlayer {
  playerId: string;
  playerName: string;
}

/** GET /coaches/:coachId/tournaments/:tournamentId/booked-players — TrainerListScreen: quiénes
 * (no solo cuántos) ya reservaron con este coach en este torneo. */
export function getCoachTournamentBookedPlayers(
  coachId: string,
  tournamentId: string,
): Promise<{ players: BookedPlayer[] }> {
  return request(`/coaches/${coachId}/tournaments/${tournamentId}/booked-players`);
}

/** PUT /coaches/:coachId/tournaments/:tournamentId/availability — CoachAvailabilityScreen "Guardar disponibilidad". */
export function setCoachTournamentAvailability(
  authToken: string,
  coachId: string,
  tournamentId: string,
  days: Array<{ slotDate: string; available: boolean; unavailableFrom?: string | null; unavailableTo?: string | null }>,
): Promise<CoachTournamentAvailability[]> {
  return request(`/coaches/${coachId}/tournaments/${tournamentId}/availability`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ days }),
  });
}

/** GET /coaches/:coachId/configured-tournaments — CoachTournamentSearchScreen: píldora
 * "Disponibilidad lista" + filtro "Con disponibilidad". */
export function listConfiguredCoachTournamentIds(authToken: string, coachId: string): Promise<{ tournamentIds: string[] }> {
  return request(`/coaches/${coachId}/configured-tournaments`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** PUT /coaches/:coachId/tournaments/:tournamentId/rate — CoachAvailabilityScreen. */
export function setCoachTournamentRate(
  authToken: string,
  coachId: string,
  tournamentId: string,
  params: { rateMode: RateMode; amount: number; approachDescription?: string },
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

/** Espeja server/src/types.ts#CoachPayout. */
export interface CoachPayout {
  id: string;
  coachId: string;
  tournamentId: string;
  periodStart: string;
  periodEnd: string;
  totalNetAmount: string;
  status: 'pending' | 'paid';
  createdAt: string;
  paidAt: string | null;
}

/** Espeja server/src/types.ts#CoachPayoutWithNames — lo que devuelve GET /coaches/payouts. */
export interface CoachPayoutWithNames extends CoachPayout {
  coachName: string;
  tournamentName: string;
}

/** GET /coaches/payouts — PlatformAdminPayoutsScreen (platform_admin). */
export function listCoachPayouts(authToken: string): Promise<CoachPayoutWithNames[]> {
  return request('/coaches/payouts', { headers: { Authorization: `Bearer ${authToken}` } });
}

/** Espeja server/src/types.ts#Club. */
export interface Club {
  id: string;
  name: string;
  type: 'club' | 'federation';
  city: string;
  country: CountryCode | null;
  contactEmail: string | null;
  contactPhone: string | null;
  defaultCommissionRate: string;
  verificationStatus: VerificationStatus;
  verificationReviewedBy: string | null;
  verificationReviewedAt: string | null;
  identityDocumentUrl: string | null;
  createdAt: string;
}

/** GET /clubs/:id — ClubHomeScreen. */
export function getClub(clubId: string): Promise<Club> {
  return request(`/clubs/${clubId}`);
}

/** POST /clubs — ClubRegistrationScreen: onboarding de un club_admin recién registrado,
 * crea el club y lo vincula al usuario de la sesión. */
export function registerClub(
  authToken: string,
  params: {
    name: string;
    type: 'club' | 'federation';
    city: string;
    country: CountryCode;
    contactEmail?: string;
    contactPhone?: string;
    identityDocumentUrl: string;
  },
): Promise<Club> {
  return request('/clubs', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(params),
  });
}

/** POST /clubs/identity-document/upload — ClubRegistrationScreen: sube el archivo real de
 * identidad de quien registra el club, antes de enviar el registro (todavía no existe el club) —
 * mismo patrón multipart que uploadCoachPhoto. */
export function uploadClubIdentityDocument(
  authToken: string,
  file: { uri: string; name: string; type: string; file?: File },
): Promise<{ fileUrl: string }> {
  const formData = new FormData();
  if (file.file) {
    formData.append('file', file.file, file.name);
  } else {
    formData.append('file', { uri: file.uri, name: file.name, type: file.type } as any);
  }
  return request('/clubs/identity-document/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: formData,
  });
}

/** PUT /clubs/:id — ClubRegistrationScreen "Editar perfil". */
export function updateClub(
  authToken: string,
  clubId: string,
  params: {
    name: string;
    type: 'club' | 'federation';
    city: string;
    country: CountryCode;
    contactEmail?: string;
    contactPhone?: string;
  },
): Promise<Club> {
  return request(`/clubs/${clubId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(params),
  });
}

/** GET /club-admins/:userId/club — ClubFlow, para resolver el club del club_admin logueado. */
export function getClubForAdmin(userId: string): Promise<Club> {
  return request(`/club-admins/${userId}/club`);
}

/** GET /clubs/pending-verification — PlatformAdminClubVerificationScreen: cola de clubes
 * autoregistrados sin revisar (ver decisión #41 en db/schema.sql), solo platform_admin. */
export function listPendingClubVerifications(authToken: string): Promise<Club[]> {
  return request('/clubs/pending-verification', {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** PUT /clubs/:id/review — PlatformAdminClubVerificationScreen: aprobar o rechazar un club. */
export function reviewClubVerification(
  authToken: string,
  clubId: string,
  status: Extract<VerificationStatus, 'approved' | 'rejected'>,
): Promise<Club> {
  return request(`/clubs/${clubId}/review`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ status }),
  });
}

/** Espeja server/src/types.ts#ClubAdminInvitation. */
export interface ClubAdminInvitation {
  id: string;
  clubId: string;
  email: string;
  invitedBy: string;
  status: ClubInvitationStatus;
  invitedAt: string;
  respondedAt: string | null;
}

/** Espeja server/src/types.ts#ClubAdminInvitationWithClubName. */
export interface ClubAdminInvitationWithClubName extends ClubAdminInvitation {
  clubName: string;
}

/** Espeja server/src/types.ts#ClubAdminJoinRequest. */
export interface ClubAdminJoinRequest {
  id: string;
  clubId: string;
  userId: string;
  status: ClubInvitationStatus;
  requestedAt: string;
  respondedAt: string | null;
}

/** Espeja server/src/types.ts#ClubAdminJoinRequestWithUserName. */
export interface ClubAdminJoinRequestWithUserName extends ClubAdminJoinRequest {
  userName: string;
  userEmail: string;
}

/** Espeja server/src/types.ts#ClubAdminJoinRequestWithClubName. */
export interface ClubAdminJoinRequestWithClubName extends ClubAdminJoinRequest {
  clubName: string;
}

/** Espeja server/src/types.ts#ClubSearchResult. */
export interface ClubSearchResult {
  id: string;
  name: string;
  type: 'club' | 'federation';
  city: string;
  country: CountryCode | null;
}

/** POST /clubs/:id/admin-invitations — ClubHomeScreen "Invitar administrador de respaldo". */
export function inviteClubAdmin(authToken: string, clubId: string, email: string): Promise<ClubAdminInvitation> {
  return request(`/clubs/${clubId}/admin-invitations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ email }),
  });
}

/** GET /clubs/:id/admin-invitations — ClubHomeScreen: invitaciones ya enviadas por este club. */
export function listClubAdminInvitations(authToken: string, clubId: string): Promise<ClubAdminInvitation[]> {
  return request(`/clubs/${clubId}/admin-invitations`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** GET /club-admin-invitations/mine — ClubJoinScreen: invitaciones pendientes para mi email. */
export function listMyClubAdminInvitations(authToken: string): Promise<ClubAdminInvitationWithClubName[]> {
  return request('/club-admin-invitations/mine', {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** PUT /club-admin-invitations/:id/respond — ClubJoinScreen: aceptar o rechazar una invitación. */
export function respondToClubAdminInvitation(
  authToken: string,
  invitationId: string,
  decision: Extract<ClubInvitationStatus, 'accepted' | 'declined'>,
): Promise<ClubAdminInvitation> {
  return request(`/club-admin-invitations/${invitationId}/respond`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ decision }),
  });
}

/** GET /clubs/search?q= — ClubJoinScreen "Buscar mi club". */
export function searchClubs(authToken: string, query: string): Promise<ClubSearchResult[]> {
  return request(`/clubs/search?q=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** POST /clubs/:id/admin-join-requests — ClubJoinScreen "Solicitar acceso". */
export function requestToJoinClub(authToken: string, clubId: string): Promise<ClubAdminJoinRequest> {
  return request(`/clubs/${clubId}/admin-join-requests`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** GET /club-admin-join-requests/mine — ClubJoinScreen: mi solicitud pendiente, si hay una. */
export function listMyClubAdminJoinRequests(authToken: string): Promise<ClubAdminJoinRequestWithClubName[]> {
  return request('/club-admin-join-requests/mine', {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** GET /clubs/:id/admin-join-requests — ClubHomeScreen "Solicitudes de acceso". */
export function listClubAdminJoinRequests(authToken: string, clubId: string): Promise<ClubAdminJoinRequestWithUserName[]> {
  return request(`/clubs/${clubId}/admin-join-requests`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** PUT /club-admin-join-requests/:id/respond — ClubHomeScreen: aprobar o rechazar una solicitud. */
export function respondToClubAdminJoinRequest(
  authToken: string,
  requestId: string,
  decision: Extract<ClubInvitationStatus, 'accepted' | 'declined'>,
): Promise<ClubAdminJoinRequest> {
  return request(`/club-admin-join-requests/${requestId}/respond`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ decision }),
  });
}

/** GET /clubs/:id/settlements — ClubSettlementsScreen. Datos financieros del club, solo para su
 * propio administrador. */
export function listClubSettlements(authToken: string, clubId: string): Promise<ClubSettlementWithTournamentName[]> {
  return request(`/clubs/${clubId}/settlements`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

export type TournamentStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

/** Espeja server/src/types.ts#TournamentSummary — lo que devuelve el listado por club. */
export interface TournamentSummary {
  id: string;
  clubId: string;
  name: string;
  venue: string;
  city: string;
  ageCategories: AgeCategory[];
  startDate: string;
  endDate: string;
  status: TournamentStatus;
  officialCoachCount: number;
  pendingCommissionAmount: string;
  /** Al menos una reserva no descartada (ver decisión #47) — ClubCreateTournamentScreen (editar)
   * bloquea los date pickers cuando esto es true; el server lo vuelve a chequear de verdad. */
  hasActiveBookings: boolean;
}

/** GET /clubs/:id/tournaments — ClubTournamentListScreen. Incluye pendingCommissionAmount (dato
 * financiero del club), solo para su propio administrador. */
export function listClubTournaments(authToken: string, clubId: string): Promise<TournamentSummary[]> {
  return request(`/clubs/${clubId}/tournaments`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** POST /clubs/:id/tournaments — ClubCreateTournamentScreen. Solo un admin del club (derivado de
 * la sesión en el server) puede crear torneos para ese club. city es la sede real del torneo, no
 * necesariamente la ciudad registrada del club/federación (ver decisión #45). */
export function createTournament(
  authToken: string,
  clubId: string,
  params: { name: string; venue: string; city: string; ageCategories: AgeCategory[]; startDate: string; endDate: string },
): Promise<TournamentSummary> {
  return request(`/clubs/${clubId}/tournaments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(params),
  });
}

/** PUT /clubs/:id/tournaments/:tournamentId — ClubCreateTournamentScreen (editar). Mismo body que
 * crear; el server responde 409 (código 'tournament_dates_locked') si intentás cambiar las fechas
 * de un torneo que ya tiene reservas activas (ver decisión #47). */
export function updateTournament(
  authToken: string,
  clubId: string,
  tournamentId: string,
  params: { name: string; venue: string; city: string; ageCategories: AgeCategory[]; startDate: string; endDate: string },
): Promise<TournamentSummary> {
  return request(`/clubs/${clubId}/tournaments/${tournamentId}`, {
    method: 'PUT',
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
  country: CountryCode | null;
  ageCategories: AgeCategory[];
  startDate: string;
  endDate: string;
}

/** GET /tournaments?search=&country=&ageCategory= — CoachTournamentSearchScreen/ParentHomeScreen. */
export function searchTournaments(
  query?: string,
  country?: CountryCode,
  ageCategory?: AgeCategory,
): Promise<TournamentSearchResult[]> {
  const qs = new URLSearchParams();
  if (query) qs.set('search', query);
  if (country) qs.set('country', country);
  if (ageCategory) qs.set('ageCategory', ageCategory);
  const suffix = qs.toString();
  return request(`/tournaments${suffix ? `?${suffix}` : ''}`);
}

/** Espeja server/src/types.ts#UnclaimedTournament — torneo sembrado por platform_admin sin
 * club todavía. */
export interface UnclaimedTournament {
  id: string;
  name: string;
  venue: string;
  city: string;
  country: CountryCode;
  startDate: string;
  endDate: string;
}

/** POST /tournaments — PlatformAdminTournamentScreen: solo platform_admin puede sembrar un
 * torneo sin club (ver decisión #36 en db/schema.sql). */
export function createUnclaimedTournament(
  authToken: string,
  params: { name: string; venue: string; city: string; country: CountryCode; startDate: string; endDate: string },
): Promise<UnclaimedTournament> {
  return request('/tournaments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(params),
  });
}

/** GET /clubs/:id/unclaimed-tournaments — ClubTournamentListScreen, sección "Torneos
 * disponibles para reclamar" (mismo país que este club). */
export function listUnclaimedTournaments(clubId: string): Promise<UnclaimedTournament[]> {
  return request(`/clubs/${clubId}/unclaimed-tournaments`);
}

/** POST /clubs/:id/tournaments/:tournamentId/claim — asigna este club como dueño de un torneo
 * sin reclamar. 409 si otro club lo reclamó primero. */
export function claimTournament(authToken: string, clubId: string, tournamentId: string): Promise<{ claimed: true }> {
  return request(`/clubs/${clubId}/tournaments/${tournamentId}/claim`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** Espeja server/src/types.ts#TournamentReport — un padre o entrenador avisa de un posible error
 * en los datos de un torneo (decisión #46). No modifica el torneo. */
export interface TournamentReport {
  id: string;
  tournamentId: string;
  tournamentName: string;
  clubId: string | null;
  clubName: string | null;
  reportedBy: string;
  reporterName: string;
  message: string;
  createdAt: string;
}

/** POST /tournaments/:id/reports — ParentHomeScreen/CoachTournamentSearchScreen "Reportar un
 * posible error". Solo padre o entrenador; 409 si ya tenés un reporte abierto sobre este torneo. */
export function reportTournament(authToken: string, tournamentId: string, message: string): Promise<TournamentReport> {
  return request(`/tournaments/${tournamentId}/reports`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ message }),
  });
}

/** GET /clubs/:id/tournament-reports — ClubTournamentListScreen: reportes abiertos sobre torneos
 * de este club, solo para su propio admin. */
export function listClubTournamentReports(authToken: string, clubId: string): Promise<TournamentReport[]> {
  return request(`/clubs/${clubId}/tournament-reports`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** GET /tournament-reports/pending — PlatformAdminTournamentScreen: todos los reportes abiertos,
 * de cualquier club, de respaldo si el club no reacciona. */
export function listPendingTournamentReports(authToken: string): Promise<TournamentReport[]> {
  return request('/tournament-reports/pending', {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** PUT /tournament-reports/:id/resolve — marcarlo resuelto, desde ClubTournamentListScreen (su
 * propio club) o PlatformAdminTournamentScreen (cualquiera). */
export function resolveTournamentReport(authToken: string, reportId: string): Promise<TournamentReport> {
  return request(`/tournament-reports/${reportId}/resolve`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${authToken}` },
  });
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

/** Espeja server/src/types.ts#TournamentReadyForCoachPayout. */
export interface TournamentReadyForCoachPayout {
  id: string;
  name: string;
  endDate: string;
}

/** GET /tournaments/ready-for-coach-payout — PlatformAdminPayoutsScreen: torneos ya finalizados
 * con pagos a entrenadores sin liquidar. */
export function listTournamentsReadyForCoachPayout(authToken: string): Promise<TournamentReadyForCoachPayout[]> {
  return request('/tournaments/ready-for-coach-payout', { headers: { Authorization: `Bearer ${authToken}` } });
}

/** POST /tournaments/:id/settle-coach-payouts — PlatformAdminPayoutsScreen "Liquidar". Solo un
 * administrador de la plataforma puede liquidar pagos a entrenadores (verificado en el server). */
export function settleTournamentCoachPayouts(
  authToken: string,
  tournamentId: string,
): Promise<{ message?: string; payouts: CoachPayout[] }> {
  return request(`/tournaments/${tournamentId}/settle-coach-payouts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

export type MatchPlayerSlot = 'player1' | 'player2';
export type MatchStatus = 'in_progress' | 'completed' | 'suspended';
export type CaptureMode = 'rapida' | 'detallada';
export type PointDetail =
  | 'winner_derecha'
  | 'winner_reves'
  | 'winner_volea'
  | 'winner'
  | 'ace'
  | 'doble_falta'
  | 'error_forzado'
  | 'error_no_forzado'
  | 'error_no_forzado_derecha'
  | 'error_no_forzado_reves'
  | 'error_no_forzado_volea'
  | 'dato_no_capturado';
export type ServeDirection = 'T' | 'cuerpo' | 'abierto';
export type ErrorDirection = 'red' | 'larga' | 'ancha';
export type RallyLength = 'corto' | 'medio' | 'largo';
/** Espeja server/src/types.ts#Lado — solo modo 'detallada'. */
export type Lado = 'derecha' | 'reves';

/** Espeja server/src/types.ts#Match. */
export interface Match {
  id: string;
  bookingId: string;
  player1Id: string;
  player2Label: string;
  format: MatchFormatId;
  noAd: boolean;
  initialServer: MatchPlayerSlot;
  captureMode: CaptureMode;
  status: MatchStatus;
  coachObservations: string | null;
  startedAt: string;
  completedAt: string | null;
  pausedAt: string | null;
  totalPausedSeconds: number;
  retiredBy: MatchPlayerSlot | null;
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
  serveDirection: ServeDirection | null;
  errorDirection: ErrorDirection | null;
  rallyLength: RallyLength | null;
  netApproach: boolean;
  isReturnError: boolean;
  lado: Lado | null;
  shotType: ShotType | null;
}

export interface MatchPointInput {
  sequenceNumber: number;
  wonBy: MatchPlayerSlot;
  detail: PointDetail | null;
  firstServeIn: boolean;
  serveDirection: ServeDirection | null;
  errorDirection: ErrorDirection | null;
  rallyLength: RallyLength | null;
  netApproach: boolean;
  isReturnError: boolean;
  lado: Lado | null;
  shotType: ShotType | null;
}

/** Espeja server/src/types.ts#MatchScoreAdjustment. */
export interface MatchScoreAdjustment {
  id: string;
  matchId: string;
  sequenceNumber: number;
  occurredAt: string;
  gamesPlayer1: number;
  gamesPlayer2: number;
  pointsPlayer1: number;
  pointsPlayer2: number;
  server: MatchPlayerSlot;
}

export interface MatchScoreAdjustmentInput {
  sequenceNumber: number;
  gamesPlayer1: number;
  gamesPlayer2: number;
  pointsPlayer1: number;
  pointsPlayer2: number;
  server: MatchPlayerSlot;
}

export interface PlayerMatchStats {
  winners: number;
  unforcedErrors: number;
  firstServePct: number | null;
  breaksConverted: number;
  returnGamesPlayed: number;
}

export type ErrorZoneKey = 'red_derecha' | 'red_reves' | 'larga_derecha' | 'larga_reves' | 'ancha_derecha' | 'ancha_reves';
export type ErrorZoneCounts = Record<ErrorZoneKey, number>;

export interface PressureServeBucket {
  attempts: number;
  firstServeIn: number;
  pct: number | null;
}

export interface PressureEfficiency {
  normal: PressureServeBucket;
  breakPoint: PressureServeBucket;
}

export interface RallyErrorBucket {
  rallyLength: RallyLength;
  pointsPlayed: number;
  pointsWon: number;
  pointsLost: number;
  winPct: number | null;
  unforcedErrors: number;
}

export interface SetOutcome {
  setIndex: number;
  won: boolean;
  score: string;
  unforcedErrors: number;
}

/** Dónde cayó el saque — solo cuenta puntos con serveDirection capturado. 1er/2do saque
 * separados por conteo dentro de cada zona, no por zona aparte. */
export interface ServeZoneCounts {
  T: { first: number; second: number };
  cuerpo: { first: number; second: number };
  abierto: { first: number; second: number };
}

export interface ServeEfficiency {
  firstServeWon: number;
  firstServeTotal: number;
  firstServeWonPct: number | null;
  secondServeWon: number;
  secondServeTotal: number;
  secondServeWonPct: number | null;
}

export type SemaforoTone = 'green' | 'amber' | 'red';

export interface SemaforoItem {
  tone: SemaforoTone;
  label: string;
  text: string;
}

/** Espeja server/src/types.ts#MatchReportView. */
export interface MatchReportView {
  player1: PlayerMatchStats;
  pressureEfficiency: PressureEfficiency;
  errorZones: ErrorZoneCounts;
  rallyErrorBuckets: RallyErrorBucket[];
  sets: SetOutcome[];
  totalUnforcedErrors: number;
  winnerSlot: MatchPlayerSlot | null;
  semaforo: SemaforoItem[];
  tacticalDiagnosis: string | null;
  player1ServeZones: ServeZoneCounts;
  player1ServeEfficiency: ServeEfficiency;
  /** errores de player1 devolviendo el saque de la rival (atajo "error de devolución"). */
  player1ReturnErrorZones: ErrorZoneCounts;
  player2ServeZones: ServeZoneCounts;
  player2ServeEfficiency: ServeEfficiency;
  /** errores de la rival devolviendo el saque de player1 (atajo "error de devolución"). */
  player2ReturnErrorZones: ErrorZoneCounts;
}

export type TranscriptStatus = 'pending' | 'completed' | 'failed';

/** Espeja server/src/types.ts#VoiceNoteWithDatoDuro — nota de voz ya subida/persistida (distinto
 * de lib/types.ts#VoiceNote, que es el clip local recién grabado en el dispositivo). datoDuro es
 * null mientras el partido sigue en curso (el servidor solo lo arma para partidos completed). */
export interface MatchVoiceNote {
  id: string;
  matchId: string;
  sequenceNumber: number;
  occurredAt: string;
  audioUrl: string | null;
  durationMs: number;
  scoreLabel: string;
  setIndex: number;
  gameIndex: number;
  isTiebreak: boolean;
  transcript: string | null;
  transcriptStatus: TranscriptStatus;
  transcriptionAttempts: number;
  transcribedAt: string | null;
  datoDuro: string | null;
}

export interface MatchReport {
  match: Match;
  points: MatchPointEvent[];
  adjustments: MatchScoreAdjustment[];
  voiceNotes: MatchVoiceNote[];
  report?: MatchReportView;
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
    format: MatchFormatId;
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

/** POST /matches/:id/adjustments — LiveCaptureView, Contingencias → Ajuste manual del marcador. */
export function createMatchScoreAdjustment(
  authToken: string,
  matchId: string,
  adjustment: MatchScoreAdjustmentInput,
): Promise<MatchScoreAdjustment> {
  return request(`/matches/${matchId}/adjustments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(adjustment),
  });
}

/** POST /matches/:id/pause — LiveCaptureView, Contingencias → Pausa temporal / tiempo médico. */
export function pauseMatch(authToken: string, matchId: string): Promise<Match> {
  return request(`/matches/${matchId}/pause`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** POST /matches/:id/resume — reanuda una pausa temporal (misma fila que pauseMatch). */
export function resumeMatch(authToken: string, matchId: string): Promise<Match> {
  return request(`/matches/${matchId}/resume`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** POST /matches/:id/suspend — LiveCaptureView, Contingencias → Suspender partido. */
export function suspendMatch(authToken: string, matchId: string): Promise<Match> {
  return request(`/matches/${matchId}/suspend`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** POST /matches/:id/resume-suspension — banner del dashboard del coach: reanudar un partido suspendido. */
export function resumeSuspendedMatch(authToken: string, matchId: string): Promise<Match> {
  return request(`/matches/${matchId}/resume-suspension`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** POST /matches/:id/retire — LiveCaptureView, Contingencias → Terminar por retiro. */
export function retireMatch(authToken: string, matchId: string, retiredBy: MatchPlayerSlot): Promise<Match> {
  return request(`/matches/${matchId}/retire`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ retiredBy }),
  });
}

/** DELETE /matches/:id/points/:sequenceNumber — LiveCaptureView, deshacer último punto. */
export function deleteMatchPoint(authToken: string, matchId: string, sequenceNumber: number): Promise<void> {
  return request(`/matches/${matchId}/points/${sequenceNumber}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/** POST /matches/:id/voice-notes — VoiceNoteRecorder, cada nota grabada en vivo. `name`/`type`
 * vienen de lib/useVoiceRecorder.ts#getRecordingFileInfo (el propio grabador es quien sabe qué
 * formato produjo) — mismo patrón multipart que uploadCoachPhoto, `uri` es un archivo local. */
export function uploadVoiceNote(
  authToken: string,
  matchId: string,
  note: {
    uri: string;
    name: string;
    type: string;
    sequenceNumber: number;
    durationMs: number;
    scoreLabel: string;
    setIndex: number;
    gameIndex: number;
    isTiebreak: boolean;
  },
): Promise<MatchVoiceNote> {
  const formData = new FormData();
  // Mismo shape {uri, name, type} que uploadCoachPhoto usa en nativo — RN's FormData lo acepta
  // como archivo a streamear (no está tipado así en lib.dom.d.ts, de ahí el `as any`).
  formData.append('file', { uri: note.uri, name: note.name, type: note.type } as any);
  formData.append('sequenceNumber', String(note.sequenceNumber));
  formData.append('durationMs', String(note.durationMs));
  formData.append('scoreLabel', note.scoreLabel);
  formData.append('setIndex', String(note.setIndex));
  formData.append('gameIndex', String(note.gameIndex));
  formData.append('isTiebreak', String(note.isTiebreak));
  return request(`/matches/${matchId}/voice-notes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: formData,
  });
}

/** DELETE /matches/:id/voice-notes/:sequenceNumber — VoiceNoteRecorder, borrar una nota. */
export function deleteMatchVoiceNote(authToken: string, matchId: string, sequenceNumber: number): Promise<void> {
  return request(`/matches/${matchId}/voice-notes/${sequenceNumber}`, {
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
