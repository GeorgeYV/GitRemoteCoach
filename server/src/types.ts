import type { MatchFormatId } from './lib/matchFormats.js';
import type { ShotType } from './lib/shotTypes.js';
import type {
  ErrorZoneCounts,
  PlayerMatchStats,
  PressureEfficiency,
  RallyErrorBucket,
  ServeEfficiency,
  ServeZoneCounts,
  SetOutcome,
} from './lib/matchStatsEngine.js';
import type { SemaforoItem } from './lib/matchReportNarratives.js';

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

/** Apps de pago P2P + transferencia bancaria tradicional, soportados para el cobro manual (ver
 * decisión: Stripe despriorizado para esta fase). No confundir con el country del torneo — cada
 * país habilita un subconjunto. */
export type PaymentProvider = 'deuna' | 'yape' | 'plin' | 'bank_transfer';

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
  /** NULL = correo sin verificar (ver decisión #48). ISO string, no Date — mismo criterio que el
   * resto de PublicUser, que viaja tal cual al cliente. */
  emailVerifiedAt: string | null;
  /** NULL = cuenta habilitada. Ver decisión #51 — AuthenticatedHome bloquea el acceso completo
   * mientras esto no sea NULL. */
  disabledAt: string | null;
  disabledReason: string | null;
}

/** PlatformAdminAccountsScreen: fila liviana de la lista de coaches/padres/admins de club — no el
 * perfil completo, solo lo necesario para reconocer la cuenta y decidir si deshabilitarla. */
export interface AdminAccountSummary {
  id: string;
  fullName: string;
  email: string;
  createdAt: string;
  disabledAt: string | null;
  disabledReason: string | null;
  /** Solo presente para coaches (ver adminAccountService.listCoachesForAdmin) — un padre no tiene
   * verification_status propio. */
  coachVerificationStatus?: VerificationStatus;
  /** Solo presente para admins de club (ver adminAccountService.listClubAdminsForAdmin) — club_admins
   * es N:M en el schema, aunque en la práctica casi siempre es un solo club. */
  clubNames?: string[];
}

export interface Booking {
  id: string;
  playerId: string;
  coachId: string;
  tournamentId: string;
  matchDatetime: string;
  /** Decisión #53 — false hasta que alguien reprograme con una hora real elegida a mano. */
  scheduleConfirmed: boolean;
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
  // Cuánto se le debe al entrenador se agrega al cerrar el torneo (settlementService.
  // settleTournamentCoachPayouts), no al completar cada reserva — nulo == todavía no incluido en
  // un pago agregado a este entrenador.
  coachPayoutId: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  refundAmount: string | null;
  coachCompensationAmount: string | null;
  flaggedForCoachPenalty: boolean;
  // Fase 1 sin Stripe: paymentProvider no-nulo marca esta reserva como pagada manualmente
  // (Deuna/Yape/Plin, ver PaymentProvider) — completeBooking/cancelBooking lo usan para no
  // intentar un cargo/transfer/reembolso real de Stripe sobre ella. paymentReference (ya
  // existía) se reutiliza para el código de operación que escribe el padre.
  paymentProvider: PaymentProvider | null;
  paymentSubmittedAt: string | null;
  paymentVerifiedBy: string | null;
  paymentReminderSentAt: string | null;
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
  /** Solo poblado por listBookingsForCoach (CoachHomeScreen) — las colas de admin que comparten
   * este mismo tipo (verificación de pagos, reembolsos) no necesitan la ciudad todavía. */
  tournamentCity?: string;
  hasUnreadMessages: boolean;
  /** Solo poblado por listBookingsForCoach — null si el entrenador nunca inició la captura en
   * vivo. Le permite a CoachBookingDetailScreen distinguir "iniciar partido" de "ya hay un
   * partido en curso/terminado para esta reserva", en vez de guiarse solo por booking.status
   * (que no cambia hasta que se verifica el pago). */
  matchStatus?: MatchStatus | null;
}

/** Lo que devuelve el listado por padre (BookingHistoryScreen) — nombre del entrenador y del
 * torneo vienen de JOINs; reviewed sale de un EXISTS contra reviews. */
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
  /** null si el entrenador nunca inició la captura en vivo. ParentReportsScreen: una vez
   * 'completed', muestra la sesión en "Reportes" aunque booking.status todavía no llegue a
   * 'completed' (pago sin verificar) — con un aviso de pendiente en vez del reporte. */
  matchStatus: MatchStatus | null;
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

/** Fila cruda de payment_collection_accounts (decisión #54) — PlatformAdminPaymentAccountsScreen.
 * A diferencia de PaymentInstructions (el shape público, discriminado por provider), acá se
 * exponen todos los campos siempre (null para los que no aplican al provider de esa fila), así el
 * admin edita cualquiera de las 5 filas con un solo formulario genérico. */
export interface PaymentCollectionAccountAdmin {
  id: string;
  country: string;
  provider: PaymentProvider;
  label: string;
  handle: string | null;
  bankName: string | null;
  accountType: string | null;
  accountNumber: string | null;
  accountHolderName: string | null;
  interbankAccountNumber: string | null;
  updatedAt: string;
}

/** Cuenta de cobro por app P2P — GET /payment-instructions (BookingPaymentScreen). */
export interface PhonePaymentAccount {
  provider: 'deuna' | 'yape' | 'plin';
  label: string;
  handle: string;
}

/** Cuenta de cobro por transferencia bancaria — interbankAccountNumber (CCI en Perú) es opcional,
 * no todos los bancos/países lo piden. */
export interface BankTransferPaymentAccount {
  provider: 'bank_transfer';
  label: string;
  bankName: string;
  accountType: string;
  accountNumber: string;
  accountHolderName: string;
  interbankAccountNumber?: string;
}

export type PublicPaymentAccount = PhonePaymentAccount | BankTransferPaymentAccount;

/** GET /payment-instructions — a qué cuenta pagar según el país del torneo (decisión #54: antes
 * hardcodeado en config.ts, ahora leído de payment_collection_accounts). */
export type PaymentInstructions = Record<'EC' | 'PE', PublicPaymentAccount[]>;

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

/** Espejo de ClubSettlement pero por entrenador — ver settlementService.settleTournamentCoachPayouts. */
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

/** Lo que devuelve la cola del admin (PlatformAdminPayoutsScreen) — todos los entrenadores, así
 * que hace falta el nombre del entrenador además del torneo (ClubSettlementWithTournamentName
 * solo necesita el torneo porque ya está scoped a un club). */
export interface CoachPayoutWithNames extends CoachPayout {
  coachName: string;
  tournamentName: string;
}

/** Lo que devuelve la búsqueda de entrenadores (ClubInviteCoachScreen/TrainerListScreen) — solo lo
 * necesario para elegir a quién invitar o reservar. rateAmount/rateMode solo vienen presentes
 * cuando la búsqueda pasó configuredForTournamentId (ver coachRepository.search). */
export interface CoachSearchResult {
  id: string;
  name: string;
  city: string;
  ratingAvg: string;
  yearsExperience: number;
  specialty: string | null;
  photoUrl: string | null;
  rateAmount?: string;
  rateMode?: RateMode;
}

/** ClubJoinScreen: resultado liviano de "buscar mi club" — no expone contactEmail/Phone (a
 * diferencia de Club completo), lo mínimo para reconocer el club antes de pedir acceso. */
export interface ClubSearchResult {
  id: string;
  name: string;
  type: 'club' | 'federation';
  city: string;
  country: CountryCode | null;
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
  verificationStatus: VerificationStatus;
  verificationReviewedBy: string | null;
  verificationReviewedAt: string | null;
  /** Identidad de quien registró el club (ver decisión #43 en db/schema.sql) — placeholder, sin
   * almacenamiento real todavía (mismo criterio que CoachVerificationDocument.fileUrl). Nullable
   * solo por los clubes que ya existían antes de esta columna; obligatorio para clubes nuevos. */
  identityDocumentUrl: string | null;
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
  /** Ver decisión #44 en db/schema.sql — false lo saca del selector de reservas y de los
   * conteos de ParentHomeScreen, pero conserva su historial. Reversible. */
  active: boolean;
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
  city: string;
  ageCategories: AgeCategory[];
  startDate: string;
  endDate: string;
  status: TournamentStatus;
  officialCoachCount: number;
  pendingCommissionAmount: string;
  /** Al menos una reserva no descartada (ver decisión #47) — el cliente usa esto para bloquear la
   * edición de fechas; el server lo vuelve a chequear de verdad en clubService.updateTournamentForClub. */
  hasActiveBookings: boolean;
}

/** Lo que devuelve GET /tournaments/ready-for-coach-payout (PlatformAdminPayoutsScreen) — torneos
 * ya finalizados con reservas 'completed' que todavía no entraron a un coach_payout (ver
 * settlementService.settleTournamentCoachPayouts). Lista propia, no reutiliza TournamentSummary
 * (esa está scoped a un club vía clubId, esta cruza todos los torneos). */
export interface TournamentReadyForCoachPayout {
  id: string;
  name: string;
  endDate: string;
}

/** Descubrimiento público de torneos activos (CoachTournamentSearchScreen) — ciudad viene de un
 * JOIN con clubs, a diferencia de TournamentSummary que ya trae clubId directo. */
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

/** tournament_reports (decisión #46) — un padre o entrenador avisa de un posible error en los
 * datos de un torneo. tournamentName/clubName vienen de un JOIN — se usa tanto en la cola del
 * propio club (ClubTournamentListScreen) como en la de platform_admin (todos los clubes, de
 * respaldo), y clubName solo aporta algo en esta última. */
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

/** Admin invita por email a un administrador de respaldo (ver decisión #42 en db/schema.sql) —
 * espeja club_admin_invitations. email en vez de userId: la persona invitada puede no tener
 * cuenta todavía. */
export interface ClubAdminInvitation {
  id: string;
  clubId: string;
  email: string;
  invitedBy: string;
  status: ClubInvitationStatus;
  invitedAt: string;
  respondedAt: string | null;
}

/** ClubJoinScreen: "/club-admin-invitations/mine" necesita mostrar a qué club invitaron a esta
 * persona antes de que decida aceptar — nombre viene de un JOIN. */
export interface ClubAdminInvitationWithClubName extends ClubAdminInvitation {
  clubName: string;
}

/** Alguien ya registrado pide unirse a un club existente en vez de crear uno nuevo (dirección
 * inversa de ClubAdminInvitation, ver decisión #42) — espeja club_admin_join_requests. */
export interface ClubAdminJoinRequest {
  id: string;
  clubId: string;
  userId: string;
  status: ClubInvitationStatus;
  requestedAt: string;
  respondedAt: string | null;
}

/** ClubHomeScreen "Solicitudes de acceso": nombre/email del solicitante vienen de un JOIN. */
export interface ClubAdminJoinRequestWithUserName extends ClubAdminJoinRequest {
  userName: string;
  userEmail: string;
}

/** ClubJoinScreen: "/club-admin-join-requests/mine" necesita mostrar a qué club le pidió acceso
 * esta persona — nombre viene de un JOIN. */
export interface ClubAdminJoinRequestWithClubName extends ClubAdminJoinRequest {
  clubName: string;
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
  /** Cómo va a ser el entrenamiento/seguimiento/activación del coach durante ESTE torneo — texto
   * libre que el padre lee en TrainerProfileScreen antes de reservar (ver decisión #38). */
  approachDescription: string | null;
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
/** Lado del golpe — solo modo de captura 'detallada', independiente de PointDetail (ver
 * lib/shotTypes.ts del frontend, espejado en server/src/lib/shotTypes.ts). */
export type Lado = 'derecha' | 'reves';

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

export type TranscriptStatus = 'pending' | 'completed' | 'failed';

export interface VoiceNote {
  id: string;
  matchId: string;
  sequenceNumber: number;
  occurredAt: string;
  /** null una vez que la transcripción termina (éxito o reintentos agotados) — el archivo en R2
   * ya no existe, ver decisión #39 en db/schema.sql. */
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
}

/** ParentReportsScreen: una nota de voz con su "dato duro" ya armado — derivado de los puntos del
 * juego que la nota etiqueta (matchStatsEngine#computeGamePointHistory +
 * matchReportNarratives#buildDatoDuro), no una columna de voice_notes. null solo mientras el
 * partido sigue en curso (VoiceNoteCard.tsx no lo necesita hasta que hay report). */
export interface VoiceNoteWithDatoDuro extends VoiceNote {
  datoDuro: string | null;
}

/** ParentReportsScreen: reporte enriquecido de un partido completado — matchService.getMatchReport
 * lo calcula solo cuando el partido ya terminó (null mientras está en curso, ver MatchReport). */
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
  player1ReturnErrorZones: ErrorZoneCounts;
  player2ServeZones: ServeZoneCounts;
  player2ServeEfficiency: ServeEfficiency;
  player2ReturnErrorZones: ErrorZoneCounts;
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
