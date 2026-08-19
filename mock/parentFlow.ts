import type { CountryCode } from '../lib/api';

export interface Trainer {
  id: string;
  name: string;
  rating: number;
  reviews: number;
  price: number;
  category: string;
  badges: string[];
}

export interface VerificationDetail {
  title: string;
  subtitle: string;
}

export interface ReportStat {
  value: string;
  label: string;
}

export interface AvailabilityDay {
  dayLabel: string;
  /** Fecha ISO real del día (ver lib/dateSlots.ts#buildDaySlotsFromRange) — necesaria para
   * construir el matchDatetime real al reservar, ya no se busca por dayLabel en una tabla fija. */
  isoDate: string;
  available: boolean;
  /** true para los días previos al torneo que el coach también puede ofrecer (ver
   * lib/dateSlots.ts#buildDaySlotsFromRange) — no es un día oficial del torneo. */
  isPreTournament: boolean;
  /** Bloque horario en que el coach NO está disponible ese día (HH:MM), ej. clases en su
   * academia de 15:00 a 17:00 — null cuando no declaró ninguna excepción. Debe mostrarse
   * explícito al padre, no solo quedar como dato interno del coach. */
  unavailableFrom: string | null;
  unavailableTo: string | null;
}

export interface BookingSlotSelection {
  dayLabel: string;
  isoDate: string;
}

/** UUID real de una reserva completada con Carlos — usada para probar reseñas y chat
 * (GET/POST /bookings/:id/messages, POST /bookings/:id/review) contra el backend real. */
export const REAL_COMPLETED_BOOKING_ID = '44444444-4444-4444-8444-444444444444';

/** Hora fija de la sesión — el coach ya no elige mañana/tarde, solo el día; la hora/punto de
 * encuentro real se coordina por chat una vez aceptada la reserva (igual que ya pasa con el
 * lugar exacto). Un valor fijo aquí es lo que le da sentido a matchDatetime como campo de
 * unicidad de la reserva sin reintroducir una franja horaria que ya se decidió simplificar. */
const DEFAULT_MATCH_TIME = '09:00:00';

/** Traduce el día elegido a un ISO datetime real para POST /bookings. */
export function buildMatchDatetime(selection: BookingSlotSelection): string {
  return `${selection.isoDate}T${DEFAULT_MATCH_TIME}.000Z`;
}

export interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
}

export const mockPaymentMethods: PaymentMethod[] = [
  { id: 'card-1', brand: 'Visa', last4: '4242' },
  { id: 'card-2', brand: 'Mastercard', last4: '8850' },
];

export const PARENT_QUICK_REPLIES = [
  '¿Punto de encuentro confirmado?',
  'Ya llegamos a la cancha',
  'Vamos en camino',
  '¡Gracias!',
];

/** Mirrors the subset of the server's booking_status enum (db/schema.sql) a parent needs to see.
 * 'accepted' is kept distinct from 'confirmed' (== paid) — collapsing them hid the "still needs
 * payment" signal entirely, leaving accepted-but-unpaid bookings with no visible next action. */
export type BookingHistoryStatus =
  | 'requested'
  | 'accepted'
  | 'paymentSubmitted'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'rejected';

export const BOOKING_HISTORY_STATUS_LABELS: Record<BookingHistoryStatus, string> = {
  requested: 'Por confirmar',
  accepted: 'Por pagar',
  paymentSubmitted: 'Pago por verificar',
  confirmed: 'Confirmada',
  completed: 'Completada',
  cancelled: 'Cancelada',
  rejected: 'Rechazada',
};

export interface BookingHistoryEntry {
  id: string;
  trainerName: string;
  trainerInitial: string;
  playerName: string;
  ageCategory: string;
  tournamentName: string;
  /** ISO — para reprogramar (BookingRescheduleScreen); date/time de abajo son el mismo valor ya
   * formateado para mostrar. */
  matchDatetime: string;
  date: string;
  time: string;
  venue: string;
  price: number;
  status: BookingHistoryStatus;
  /** País del torneo (no del padre/entrenador) — decide qué app de pago mostrar en
   * BookingPaymentScreen (Deuna en Ecuador, Yape/Plin en Perú) y restringe "Pagar todas" a
   * reservas del mismo país en BookingHistoryScreen. */
  tournamentCountry?: CountryCode | null;
  /** Only meaningful once status is 'completed' — whether the parent already left a review. */
  reviewed?: boolean;
  hasUnreadMessages?: boolean;
}

export interface TrainerProfile {
  trainer: Trainer;
  bio: string;
  tags: string[];
  verifications: VerificationDetail[];
  reportStats: ReportStat[];
  availability: AvailabilityDay[];
  officialClub: string;
}

export const mockTrainers: Trainer[] = [
  {
    // UUID real — coincide con coachAUserId en server/test/seed.ts (full_name
    // "Carlos Medina") para poder probar GET /coaches/:id/reviews contra el backend real.
    id: '00000000-0000-0000-0000-000000000004',
    name: 'Carlos Medina',
    rating: 4.9,
    reviews: 32,
    price: 35,
    category: 'U12–U18',
    badges: ['Identidad', 'Antecedentes', 'Fed.'],
  },
  {
    id: 'ana-beltran',
    name: 'Ana Beltrán',
    rating: 4.8,
    reviews: 21,
    price: 28,
    category: 'U10–U14',
    badges: ['Identidad', 'Antecedentes', 'Oficial'],
  },
  {
    id: 'jorge-salas',
    name: 'Jorge Salas',
    rating: 4.7,
    reviews: 15,
    price: 30,
    category: 'U14–U18',
    badges: ['Identidad', 'Antecedentes'],
  },
  {
    id: 'marcela-ruiz',
    name: 'Marcela Ruiz',
    rating: 5.0,
    reviews: 9,
    price: 40,
    category: 'U12–U16',
    badges: ['Identidad', 'Antecedentes', 'Fed.', 'Oficial'],
  },
];

export const mockCarlosMedinaProfile: TrainerProfile = {
  trainer: mockTrainers[0],
  bio:
    '12 años de experiencia entrenando juveniles. Especialista en saque y juego de aproximación a la red. ' +
    'Trabaja con categorías U12 a U18 y ha acompañado a jugadores en más de 40 torneos nacionales.',
  tags: ['Saque y red', 'U12–U18', 'Competitivo'],
  verifications: [
    { title: 'Identidad verificada', subtitle: 'Validado con identificación oficial' },
    { title: 'Antecedentes verificados', subtitle: 'Revisión de antecedentes penales' },
    { title: 'Certificación federativa', subtitle: 'Certificado por la federación de tenis' },
    { title: 'Entrenador oficial', subtitle: 'Club Deportivo Bosques' },
  ],
  reportStats: [
    { value: '18', label: 'Winners' },
    { value: '9', label: 'Errores' },
    { value: '71%', label: '1er saque' },
    { value: '4/6', label: 'Quiebres' },
  ],
  availability: [
    { dayLabel: 'Vie 5', isoDate: '2026-08-05', available: true, isPreTournament: false, unavailableFrom: null, unavailableTo: null },
    { dayLabel: 'Sáb 6', isoDate: '2026-08-06', available: true, isPreTournament: false, unavailableFrom: '15:00', unavailableTo: '17:00' },
    { dayLabel: 'Dom 7', isoDate: '2026-08-07', available: false, isPreTournament: false, unavailableFrom: null, unavailableTo: null },
    { dayLabel: 'Lun 8', isoDate: '2026-08-08', available: true, isPreTournament: false, unavailableFrom: null, unavailableTo: null },
    { dayLabel: 'Mar 9', isoDate: '2026-08-09', available: true, isPreTournament: false, unavailableFrom: null, unavailableTo: null },
  ],
  officialClub: 'Club Deportivo Bosques',
};
