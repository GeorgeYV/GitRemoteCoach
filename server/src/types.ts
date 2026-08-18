export type BookingStatus =
  | 'requested'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'payment_failed'
  | 'paid'
  | 'completed'
  | 'cancelled';

export type ClubCommissionStatus = 'generated' | 'settled';

export type PaymentTransactionType = 'charge' | 'refund' | 'transfer' | 'charge_failed';
export type PaymentTransactionStatus = 'succeeded' | 'failed' | 'pending';

export type TournamentStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export type AgeCategory = 'U10' | 'U12' | 'U14' | 'U16' | 'U18';
export type PlayingLevel = 'recreativo' | 'competitivo' | 'alto_rendimiento';
export type RateMode = 'per_day' | 'per_tournament';
/** Espeja el DOMAIN country_code (db/schema.sql#35). */
export type CountryCode = 'EC' | 'PE' | 'CO' | 'CL' | 'BO' | 'AR' | 'VE' | 'BR' | 'PY' | 'UY';
export type ClubInvitationStatus = 'pending' | 'accepted' | 'declined';
export type MessageSenderType = 'coach' | 'parent' | 'system';
export type VerificationStatus = 'pending' | 'approved' | 'rejected';

export type UserRole = 'parent' | 'coach' | 'club_admin' | 'platform_admin';

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  primaryRole: UserRole;
}

export interface Booking {
  id: string;
  playerId: string;
  coachId: string;
  tournamentId: string;
  matchDatetime: string;
  agreedRate: string;
  status: BookingStatus;
  // Capturados al solicitar / confirmar la reserva (CoachRequestInboxScreen,
  // CoachPreMatchReminderScreen). Ver db/schema.sql.
  parentNote: string | null;
  courtLabel: string | null;
  meetingPointDetail: string | null;
  responseDeadline: string;
  paymentDeadline: string | null;
  totalAmountPaid: string | null;
  coachNetAmount: string | null;
  platformCommissionAmount: string | null;
  clubCommissionAmount: string | null;
  clubCommissionStatus: ClubCommissionStatus;
  settlementId: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  refundAmount: string | null;
  coachCompensationAmount: string | null;
  flaggedForCoachPenalty: boolean;
  paymentReference: string | null;
  requestedAt: string;
  decidedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
}

/** Lo que devuelve el listado por coach (CoachHomeScreen, CoachRequestInboxScreen, CoachSessionHistoryScreen,
 * CoachEarningsScreen) — nombre de jugador/padre y datos del torneo vienen de JOINs. */
export interface BookingWithParticipants extends Booking {
  playerName: string;
  ageCategory: AgeCategory;
  parentName: string;
  tournamentName: string;
  tournamentVenue: string;
  hasUnreadMessages: boolean;
}

/** Lo que devuelve el listado por padre (BookingHistoryScreen) — nombre del entrenador y del
 * torneo vienen de JOINs; reviewed sale de un EXISTS contra reviews. */
export interface BookingForParent extends Booking {
  coachName: string;
  playerName: string;
  ageCategory: AgeCategory;
  tournamentName: string;
  tournamentVenue: string;
  reviewed: boolean;
  hasUnreadMessages: boolean;
}

export interface PaymentTransaction {
  id: string;
  bookingId: string;
  type: PaymentTransactionType;
  status: PaymentTransactionStatus;
  amount: string;
  stripeObjectId: string | null;
  rawResponse: unknown;
  createdAt: string;
}

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

/** Lo que devuelve el listado por club (ClubSettlementsScreen) — nombre de torneo viene de un JOIN. */
export interface ClubSettlementWithTournamentName extends ClubSettlement {
  tournamentName: string;
}

/** Lo que devuelve la búsqueda de entrenadores (ClubInviteCoachScreen) — solo lo necesario para elegir a quién invitar. */
export interface CoachSearchResult {
  id: string;
  name: string;
  city: string;
  ratingAvg: string;
  yearsExperience: number;
  specialty: string | null;
}

export interface Club {
  id: string;
  name: string;
  type: 'club' | 'federation';
  city: string;
  country: CountryCode | null;
  contactEmail: string | null;
  contactPhone: string | null;
  defaultCommissionRate: string;
  createdAt: string;
}

export type CancelActor = 'parent' | 'coach';

export interface Player {
  id: string;
  guardianUserId: string;
  fullName: string;
  /** DATE column normalizado a YYYY-MM-DD en el repositorio — ver playerRepository.mapPlayerRow. */
  birthDate: string;
  ageCategory: AgeCategory;
  /** País donde juega — default del filtro "mi país" en ParentHomeScreen. */
  country: CountryCode | null;
  createdAt: string;
}

export interface CoachProfile {
  userId: string;
  fullName: string;
  city: string;
  region: string | null;
  /** País donde entrena — default del filtro "mi país" en CoachTournamentSearchScreen. */
  country: CountryCode | null;
  photoUrl: string | null;
  yearsExperience: number;
  specialty: string | null;
  hourlyRate: string;
  verificationStatus: VerificationStatus;
  ratingAvg: string;
  ratingCount: number;
  bio: string | null;
  stripeConnectedAccountId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 'club_reference' cubre el checklist de registro del entrenador ("referencias de club o
 * academia"), distinto de 'certification' (certificación federativa). Espeja verification_doc_type. */
export type VerificationDocType = 'identity' | 'background_check' | 'certification' | 'club_reference';

/** CoachRegistrationScreen (envío), CoachVerificationPendingScreen (lectura). 'identity' y
 * 'background_check' son obligatorios para que verification_status llegue a 'approved'
 * (ver recalculateVerificationStatus en coachVerificationDocumentRepository). */
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

/** Lo que devuelve la cola de revisión del admin de plataforma (PlatformAdminReviewScreen) —
 * nombre del entrenador viene de un JOIN, para no obligar a la pantalla a resolverlo aparte. */
export interface CoachVerificationDocumentWithCoachName extends CoachVerificationDocument {
  coachName: string;
}

export interface CoachAgeCategory {
  coachId: string;
  ageCategory: AgeCategory;
}

export interface CoachLevel {
  coachId: string;
  level: PlayingLevel;
}

export interface TournamentCoachTag {
  tournamentId: string;
  coachId: string;
  taggedBy: string;
  taggedAt: string;
}

/** Lo que devuelve el listado por club (ClubTournamentListScreen) — conteo de entrenadores
 * etiquetados y comisión pendiente de liquidar vienen de subqueries. */
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

/** Descubrimiento público de torneos activos (CoachTournamentSearchScreen) — ciudad viene de un
 * JOIN con clubs, a diferencia de TournamentSummary que ya trae clubId directo. */
export interface TournamentSearchResult {
  id: string;
  name: string;
  venue: string;
  city: string;
  country: CountryCode | null;
  startDate: string;
  endDate: string;
}

/** Torneo sembrado por platform_admin sin club todavía (PlatformAdminTournamentScreen,
 * ClubTournamentListScreen — sección "Torneos disponibles para reclamar"). */
export interface UnclaimedTournament {
  id: string;
  name: string;
  venue: string;
  city: string;
  country: CountryCode;
  startDate: string;
  endDate: string;
}

/** Entrenador etiquetado como oficial en un torneo (ClubTournamentDetailScreen) — nombre/ciudad/rating vienen de un JOIN. */
export interface TournamentCoachTagWithProfile {
  coachId: string;
  name: string;
  city: string;
  ratingAvg: string;
  taggedAt: string;
}

/** Insignia de "oficial" vista desde el propio entrenador (CoachAvailabilityScreen,
 * CoachTournamentSearchScreen, CoachReputationScreen) — inverso de TournamentCoachTagWithProfile:
 * nombre del torneo y del club vienen de un JOIN en vez de nombre/ciudad/rating del coach. */
export interface CoachClubTag {
  tournamentId: string;
  tournamentName: string;
  clubName: string;
  taggedAt: string;
}

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

/** Lo que devuelve el listado por coach (CoachClubInvitationScreen) — nombre de club y torneo vienen de JOINs. */
export interface ClubCoachInvitationWithNames extends ClubCoachInvitation {
  clubName: string;
  tournamentName: string;
}

/** Lo que devuelve el listado por torneo (ClubTournamentDetailScreen) — nombre del entrenador viene de un JOIN. */
export interface ClubCoachInvitationWithCoachName extends ClubCoachInvitation {
  coachName: string;
}

export interface CoachTournamentAvailability {
  id: string;
  coachId: string;
  tournamentId: string;
  /** Fecha del día del torneo (o hasta 2 días previos) al que aplica esta disponibilidad (YYYY-MM-DD). */
  slotDate: string;
  available: boolean;
  /** Bloque horario de excepción dentro de un día disponible (HH:MM), ej. "15:00"/"17:00" —
   * ambos null o ambos seteados (ver chk_coach_tournament_availability_exception_range). */
  unavailableFrom: string | null;
  unavailableTo: string | null;
  updatedAt: string;
}

export interface CoachTournamentRate {
  coachId: string;
  tournamentId: string;
  rateMode: RateMode;
  amount: string;
  updatedAt: string;
}

export interface BookingMessage {
  id: string;
  bookingId: string;
  senderType: MessageSenderType;
  /** Nulo cuando senderType = 'system'. */
  senderId: string | null;
  body: string;
  createdAt: string;
}

export interface Review {
  id: string;
  bookingId: string;
  parentId: string;
  coachId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

/** Lo que devuelve el listado por coach (TrainerProfileScreen) — el nombre del padre viene de un JOIN con users. */
export interface ReviewWithParent extends Review {
  parentName: string;
}

/** El enum de DB usa strings ('1'/'3'), no números — ver CREATE TYPE match_best_of en db/schema.sql. */
export type MatchBestOf = '1' | '3';
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
  | 'dato_no_capturado';
export type ServeDirection = 'T' | 'cuerpo' | 'abierto';
export type ErrorDirection = 'red' | 'larga' | 'ancha';
export type RallyLength = 'corto' | 'medio' | 'largo';

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
  pausedAt: string | null;
  totalPausedSeconds: number;
  retiredBy: MatchPlayerSlot | null;
}

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
}

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

/** TrainerProfileScreen: stats agregadas de todos los partidos completados de un coach —
 * nunca datos de un partido individual, solo sumas/promedios (ver matchService.getCoachReportSummary). */
export interface CoachReportSummary {
  matchesCount: number;
  winners: number;
  unforcedErrors: number;
  firstServePct: number | null;
  breaksConverted: number;
  returnGamesPlayed: number;
}
