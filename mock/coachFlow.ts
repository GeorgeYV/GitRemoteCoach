import { REAL_TOURNAMENT_ID } from './parentFlow';

export interface DocumentItem {
  id: string;
  title: string;
  subtitle: string;
  status: 'pending' | 'uploaded';
  optional?: boolean;
}

export const AGE_CATEGORY_OPTIONS = ['U10', 'U12', 'U14', 'U16', 'U18'];
export const LEVEL_OPTIONS = ['Recreativo', 'Competitivo', 'Alto rendimiento'];

export const mockDocumentChecklist: DocumentItem[] = [
  {
    id: 'identity',
    title: 'Identificación oficial',
    subtitle: 'INE, pasaporte o cédula profesional',
    status: 'uploaded',
  },
  {
    id: 'background',
    title: 'Certificado de antecedentes penales',
    subtitle: 'Vigencia no mayor a 6 meses',
    status: 'uploaded',
  },
  {
    id: 'federation',
    title: 'Certificación federativa',
    subtitle: 'Aumenta tu visibilidad ante los padres',
    status: 'pending',
    optional: true,
  },
  {
    id: 'references',
    title: 'Referencias de club o academia',
    subtitle: 'Al menos un contacto que confirme tu experiencia',
    status: 'pending',
  },
];

export type RateMode = 'partido' | 'dia' | 'torneo';

export const RATE_MODE_LABELS: Record<RateMode, string> = {
  partido: 'Por partido',
  dia: 'Por día',
  torneo: 'Torneo completo',
};

/** Matches the availability already shown on Carlos Medina's public profile in the parent flow —
 * keyed by REAL_TOURNAMENT_ID (mock/parentFlow.ts) since CoachAvailabilityScreen now always gets a
 * real tournament UUID from search, not a mock slug. Indexed by day position within the range. */
export const PRESET_AVAILABILITY: Record<string, { morning: boolean; afternoon: boolean }[]> = {
  [REAL_TOURNAMENT_ID]: [
    { morning: true, afternoon: false },
    { morning: true, afternoon: true },
    { morning: false, afternoon: true },
    { morning: true, afternoon: true },
    { morning: true, afternoon: false },
  ],
};

export const DEFAULT_RATE_AMOUNT: Record<string, number> = {
  [REAL_TOURNAMENT_ID]: 35,
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

export interface PreMatchReminder {
  bookingId: string;
  playerName: string;
  playerInitial: string;
  category: string;
  parentName: string;
  date: string;
  time: string;
  minutesUntilMatch: number;
  venue: string;
  courtLabel: string;
  meetingPointDetail: string;
  playerNote?: string;
}

export const mockPreMatchReminder: PreMatchReminder = {
  bookingId: 'req-1',
  playerName: 'Valentina Torres',
  playerInitial: 'V',
  category: 'U14 · Individual femenil',
  parentName: 'María Torres',
  date: 'Vie 5 Ago',
  time: '10:00 AM',
  minutesUntilMatch: 45,
  venue: 'Club Deportivo Bosques',
  courtLabel: 'Cancha 3',
  meetingPointDetail: 'Entrada principal → pasillo de canchas 1–4 → gradas junto a la Cancha 3',
  playerNote:
    'Valentina se pone nerviosa con el saque, si puedes darle ánimo entre juegos se lo agradecería.',
};

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

/** A club tagging the coach as its official trainer for one specific tournament — never global. */
export interface ClubTagging {
  clubName: string;
  tournamentName: string;
  tournamentId: string;
}

/** Already-accepted taggings, the ones that show up as badges everywhere without further action. */
export const mockOfficialClubTaggings: ClubTagging[] = [
  { clubName: 'Club Deportivo Bosques', tournamentName: 'Copa Nacional Juvenil', tournamentId: 'copa-nacional-juvenil' },
];

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
  date: string;
  time: string;
  venue: string;
  agreedRate: number;
  /** Monto real ya calculado por el servidor. Ausente si la reserva aún no llega a 'paid'. */
  coachNetAmount?: number;
  status: CoachBookingStatus;
}
