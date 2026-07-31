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
