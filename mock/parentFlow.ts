export interface ParentUser {
  name: string;
  initial: string;
  childName: string;
}

export interface Tournament {
  id: string;
  name: string;
  venue: string;
  city: string;
  dates: string;
}

export interface FeaturedTournament extends Tournament {
  badgeLabel: string;
}

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

export interface ParentReview {
  initial: string;
  name: string;
  stars: number;
  quote: string;
}

export interface ReportStat {
  value: string;
  label: string;
}

export interface AvailabilityDay {
  dayLabel: string;
  morningAvailable: boolean;
  afternoonAvailable: boolean;
}

export type BookingPeriod = 'morning' | 'afternoon';

export const BOOKING_PERIOD_LABELS: Record<BookingPeriod, string> = {
  morning: 'Mañana',
  afternoon: 'Tarde',
};

export interface BookingSlotSelection {
  dayLabel: string;
  period: BookingPeriod;
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

/** Mirrors the subset of the server's booking_status enum (db/schema.sql) a parent needs to see. */
export type BookingHistoryStatus = 'requested' | 'confirmed' | 'completed' | 'cancelled' | 'rejected';

export const BOOKING_HISTORY_STATUS_LABELS: Record<BookingHistoryStatus, string> = {
  requested: 'Esperando confirmación',
  confirmed: 'Confirmada',
  completed: 'Completada',
  cancelled: 'Cancelada',
  rejected: 'Rechazada',
};

export interface BookingHistoryEntry {
  id: string;
  trainerName: string;
  trainerInitial: string;
  tournamentName: string;
  date: string;
  time: string;
  venue: string;
  price: number;
  status: BookingHistoryStatus;
  /** Only meaningful once status is 'completed' — whether the parent already left a review. */
  reviewed?: boolean;
}

export const mockBookingHistory: BookingHistoryEntry[] = [
  {
    id: 'book-1',
    trainerName: 'Carlos Medina',
    trainerInitial: 'C',
    tournamentName: 'Copa Nacional Juvenil',
    date: 'Vie 5 Ago',
    time: '10:00 AM',
    venue: 'Club Deportivo Bosques · Cancha 3',
    price: 35,
    status: 'confirmed',
  },
  {
    id: 'book-2',
    trainerName: 'Ana Beltrán',
    trainerInitial: 'A',
    tournamentName: 'Abierto Regional Sub-16',
    date: 'Jue 20 Ago',
    time: '9:00 AM',
    venue: 'Club Guadalajara Tenis',
    price: 28,
    status: 'requested',
  },
  {
    id: 'book-3',
    trainerName: 'Marcela Ruiz',
    trainerInitial: 'M',
    tournamentName: 'Copa Nacional Juvenil',
    date: 'Dom 7 Ago',
    time: '4:00 PM',
    venue: 'Club Deportivo Bosques · Cancha 2',
    price: 40,
    status: 'cancelled',
  },
  {
    id: 'book-4',
    trainerName: 'Jorge Salas',
    trainerInitial: 'J',
    tournamentName: 'Copa de Verano U14',
    date: '3 Sep 2025',
    time: '11:00 AM',
    venue: 'Club Puebla Racquet',
    price: 30,
    status: 'completed',
    reviewed: false,
  },
  {
    id: 'book-5',
    trainerName: 'Ana Beltrán',
    trainerInitial: 'A',
    tournamentName: 'Copa Nacional Juvenil',
    date: '8 Ago 2025',
    time: '5:30 PM',
    venue: 'Club Deportivo Bosques · Cancha 1',
    price: 28,
    status: 'completed',
    reviewed: true,
  },
];

export interface TrainerProfile {
  trainer: Trainer;
  bio: string;
  tags: string[];
  verifications: VerificationDetail[];
  review: ParentReview;
  reportStats: ReportStat[];
  availability: AvailabilityDay[];
  officialClub: string;
}

export const mockParentUser: ParentUser = {
  name: 'María',
  initial: 'M',
  childName: 'Valentina',
};

export const mockFeaturedTournament: FeaturedTournament = {
  id: 'copa-nacional-juvenil',
  name: 'Copa Nacional Juvenil',
  venue: 'Club Deportivo Bosques',
  city: 'CDMX',
  dates: '5 – 9 Ago 2026',
  badgeLabel: 'Empieza en 5 días',
};

export const mockActiveTournaments: Tournament[] = [
  {
    id: 'copa-nacional-juvenil',
    name: 'Copa Nacional Juvenil',
    venue: 'Club Deportivo Bosques',
    city: 'CDMX',
    dates: '5 – 9 Ago 2026',
  },
  {
    id: 'abierto-regional-sub16',
    name: 'Abierto Regional Sub-16',
    venue: 'Club Guadalajara Tenis',
    city: 'Guadalajara',
    dates: '20 – 24 Ago 2026',
  },
  {
    id: 'copa-verano-u14',
    name: 'Copa de Verano U14',
    venue: 'Club Puebla Racquet',
    city: 'Puebla',
    dates: '2 – 5 Sep 2026',
  },
];

export const mockTrainers: Trainer[] = [
  {
    id: 'carlos-medina',
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

export const FILTER_CHIPS = ['Fecha', 'Horario', 'Tarifa', 'Calificación', 'Categoría'];

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
  review: {
    initial: 'L',
    name: 'Laura P.',
    stars: 5,
    quote: 'Carlos fue puntual, profesional, y el reporte que nos mandó fue súper claro.',
  },
  reportStats: [
    { value: '18', label: 'Winners' },
    { value: '9', label: 'Errores' },
    { value: '71%', label: '1er saque' },
    { value: '4/6', label: 'Quiebres' },
  ],
  availability: [
    { dayLabel: 'Vie 5', morningAvailable: true, afternoonAvailable: false },
    { dayLabel: 'Sáb 6', morningAvailable: true, afternoonAvailable: true },
    { dayLabel: 'Dom 7', morningAvailable: false, afternoonAvailable: true },
    { dayLabel: 'Lun 8', morningAvailable: true, afternoonAvailable: true },
    { dayLabel: 'Mar 9', morningAvailable: true, afternoonAvailable: false },
  ],
  officialClub: 'Club Deportivo Bosques',
};
