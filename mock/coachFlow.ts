import type { VerificationDocType } from '../lib/api';

export interface DocumentItem {
  id: VerificationDocType;
  title: string;
  subtitle: string;
  status: 'pending' | 'uploaded';
  optional?: boolean;
}

export const AGE_CATEGORY_OPTIONS = ['U10', 'U12', 'U14', 'U16', 'U18'];
export const LEVEL_OPTIONS = ['Recreativo', 'Competitivo', 'Alto rendimiento'];

/** Checklist de registro del entrenador — id coincide 1:1 con VerificationDocType para poder
 * enviarse directo al backend real en CoachRegistrationScreen (ver server/db/schema.sql#verification_doc_type). */
export const VERIFICATION_DOC_CHECKLIST: DocumentItem[] = [
  {
    id: 'identity',
    title: 'Identificación oficial',
    subtitle: 'INE, pasaporte o cédula profesional',
    status: 'uploaded',
  },
  {
    id: 'background_check',
    title: 'Certificado de antecedentes penales',
    subtitle: 'Vigencia no mayor a 6 meses',
    status: 'uploaded',
  },
  {
    id: 'certification',
    title: 'Certificación federativa',
    subtitle: 'Aumenta tu visibilidad ante los padres',
    status: 'pending',
    optional: true,
  },
  {
    id: 'club_reference',
    title: 'Referencias de club o academia',
    subtitle: 'Al menos un contacto que confirme tu experiencia',
    status: 'pending',
  },
];

/** Metadatos de despliegue (título/subtítulo) por tipo de documento — usado por
 * CoachVerificationPendingScreen para etiquetar los documentos reales que trae el backend
 * (que solo guarda doc_type, no copy de UI). */
export const VERIFICATION_DOC_LABELS: Record<VerificationDocType, { title: string; subtitle: string; optional?: boolean }> = {
  identity: VERIFICATION_DOC_CHECKLIST[0],
  background_check: VERIFICATION_DOC_CHECKLIST[1],
  certification: VERIFICATION_DOC_CHECKLIST[2],
  club_reference: VERIFICATION_DOC_CHECKLIST[3],
};

export type RateMode = 'partido' | 'dia' | 'torneo';

export const RATE_MODE_LABELS: Record<RateMode, string> = {
  partido: 'Por partido',
  dia: 'Por día',
  torneo: 'Torneo completo',
};

export interface BookingRequest {
  id: string;
  parentName: string;
  playerName: string;
  playerInitial: string;
  category: string;
  date: string;
  time: string;
  venue: string;
  note?: string;
  expiresInSeconds: number;
}

export interface ChatMessage {
  id: string;
  sender: 'coach' | 'parent' | 'system';
  text: string;
  time: string;
}

export const QUICK_REPLIES = [
  'Ya llegué a la cancha',
  '¿Punto de encuentro?',
  'Llego en 10 minutos',
  'Todo listo para el partido',
];

export type PayoutStatus = 'pendiente' | 'liberado';

/** Matches config.businessRules.platformCommissionRate on the server (server/src/config.ts). */
export const PLATFORM_COMMISSION_RATE = 0.15;

export interface EarningsEntry {
  id: string;
  playerName: string;
  category: string;
  tournamentName: string;
  date: string;
  agreedRate: number;
  /** Monto real ya calculado por el servidor (agreedRate menos comisión de plataforma y de club). Ausente si la reserva aún no llega a 'paid'. */
  coachNetAmount?: number;
  payoutStatus: PayoutStatus;
}

export interface ActivityStats {
  matchesPlayed: number;
  acceptanceRate: number;
  averageResponseMinutes: number;
  tournamentsCount: number;
}

export interface CoachReview {
  id: string;
  parentInitial: string;
  parentName: string;
  stars: number;
  quote: string;
  date: string;
}

export type CoachBookingStatus = 'confirmed' | 'completed' | 'cancelled';

export const COACH_BOOKING_STATUS_LABELS: Record<CoachBookingStatus, string> = {
  confirmed: 'Confirmada',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

export interface CoachBooking {
  id: string;
  parentName: string;
  parentInitial: string;
  playerName: string;
  playerInitial: string;
  category: string;
  tournamentName: string;
  /** ISO datetime crudo del partido — para ordenar/agrupar por fecha. `date`/`time` son solo para mostrar. */
  matchDatetime: string;
  date: string;
  time: string;
  venue: string;
  agreedRate: number;
  /** Monto real ya calculado por el servidor. Ausente si la reserva aún no llega a 'paid'. */
  coachNetAmount?: number;
  status: CoachBookingStatus;
  /** true solo cuando el estado real (no el colapsado) es 'paid' — el único momento en que
   * POST /bookings/:id/complete puede liberar el pago. */
  readyToComplete: boolean;
  hasUnreadMessages?: boolean;
}
