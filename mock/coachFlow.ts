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

export interface DaySlot {
  dayLabel: string;
  morning: boolean;
  afternoon: boolean;
}

export type RateMode = 'partido' | 'dia' | 'torneo';

export const RATE_MODE_LABELS: Record<RateMode, string> = {
  partido: 'Por partido',
  dia: 'Por día',
  torneo: 'Torneo completo',
};

const TOURNAMENT_DAY_LABELS: Record<string, string[]> = {
  'copa-nacional-juvenil': ['Vie 5', 'Sáb 6', 'Dom 7', 'Lun 8', 'Mar 9'],
  'abierto-regional-sub16': ['Jue 20', 'Vie 21', 'Sáb 22', 'Dom 23', 'Lun 24'],
  'copa-verano-u14': ['Mié 2', 'Jue 3', 'Vie 4', 'Sáb 5'],
};

/** Matches the availability already shown on Carlos Medina's public profile in the parent flow. */
const PRESET_AVAILABILITY: Record<string, { morning: boolean; afternoon: boolean }[]> = {
  'copa-nacional-juvenil': [
    { morning: true, afternoon: false },
    { morning: true, afternoon: true },
    { morning: false, afternoon: true },
    { morning: true, afternoon: true },
    { morning: true, afternoon: false },
  ],
};

export const DEFAULT_RATE_AMOUNT: Record<string, number> = {
  'copa-nacional-juvenil': 35,
};

export function buildInitialDaySlots(tournamentId: string): DaySlot[] {
  const labels = TOURNAMENT_DAY_LABELS[tournamentId] ?? ['Día 1', 'Día 2', 'Día 3'];
  const preset = PRESET_AVAILABILITY[tournamentId];
  return labels.map((dayLabel, i) => ({
    dayLabel,
    morning: preset?.[i]?.morning ?? false,
    afternoon: preset?.[i]?.afternoon ?? false,
  }));
}

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

export interface ChatThread {
  bookingId: string;
  parentName: string;
  parentInitial: string;
  playerName: string;
  category: string;
  date: string;
  time: string;
  venue: string;
  messages: ChatMessage[];
}

export const QUICK_REPLIES = [
  'Ya llegué a la cancha',
  '¿Punto de encuentro?',
  'Llego en 10 minutos',
  'Todo listo para el partido',
];

export const mockChatThread: ChatThread = {
  bookingId: 'req-1',
  parentName: 'María Torres',
  parentInitial: 'M',
  playerName: 'Valentina Torres',
  category: 'U14 · Individual femenil',
  date: 'Vie 5 Ago',
  time: '10:00 AM',
  venue: 'Club Deportivo Bosques · Cancha 3',
  messages: [
    {
      id: 'm0',
      sender: 'system',
      text: 'Reserva confirmada · usa este chat para coordinar el punto de encuentro',
      time: '',
    },
    {
      id: 'm1',
      sender: 'parent',
      text: 'Hola Carlos, gracias por aceptar la solicitud para Valentina.',
      time: '9:12 AM',
    },
    { id: 'm2', sender: 'coach', text: 'Con gusto, María. Ahí estaré antes de las 10.', time: '9:15 AM' },
    {
      id: 'm3',
      sender: 'parent',
      text: '¿Nos vemos directo en la cancha 3 o hay un punto de encuentro?',
      time: '9:20 AM',
    },
    {
      id: 'm4',
      sender: 'coach',
      text: 'Directo en la cancha 3, junto a las gradas. Voy a traer gorra azul para que me reconozcan.',
      time: '9:22 AM',
    },
  ],
};

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
  payoutStatus: PayoutStatus;
}

export const mockEarningsHistory: EarningsEntry[] = [
  {
    id: 'earn-1',
    playerName: 'Valentina Torres',
    category: 'U14 · Individual femenil',
    tournamentName: 'Copa Nacional Juvenil',
    date: 'Vie 5 Ago 2026',
    agreedRate: 35,
    payoutStatus: 'pendiente',
  },
  {
    id: 'earn-2',
    playerName: 'Diego Salinas',
    category: 'U16 · Individual varonil',
    tournamentName: 'Copa Nacional Juvenil',
    date: 'Vie 5 Ago 2026',
    agreedRate: 35,
    payoutStatus: 'pendiente',
  },
  {
    id: 'earn-3',
    playerName: 'Renata Solís',
    category: 'U12 · Individual femenil',
    tournamentName: 'Abierto Regional Sub-16',
    date: '22 Ago 2025',
    agreedRate: 30,
    payoutStatus: 'liberado',
  },
  {
    id: 'earn-4',
    playerName: 'Mateo Vidal',
    category: 'U14 · Individual varonil',
    tournamentName: 'Copa de Verano U14',
    date: '3 Sep 2025',
    agreedRate: 40,
    payoutStatus: 'liberado',
  },
  {
    id: 'earn-5',
    playerName: 'Isabela Cruz',
    category: 'U18 · Individual femenil',
    tournamentName: 'Copa Nacional Juvenil',
    date: '8 Ago 2025',
    agreedRate: 35,
    payoutStatus: 'liberado',
  },
];

export interface ActivityStats {
  matchesPlayed: number;
  acceptanceRate: number;
  averageResponseMinutes: number;
  tournamentsCount: number;
}

export const mockCoachActivityStats: ActivityStats = {
  matchesPlayed: 32,
  acceptanceRate: 0.94,
  averageResponseMinutes: 18,
  tournamentsCount: 9,
};

export interface CoachReview {
  id: string;
  parentInitial: string;
  parentName: string;
  stars: number;
  quote: string;
  date: string;
}

export const mockCoachReviews: CoachReview[] = [
  {
    id: 'rev-1',
    parentInitial: 'L',
    parentName: 'Laura P.',
    stars: 5,
    quote: 'Carlos fue puntual, profesional, y el reporte que nos mandó fue súper claro.',
    date: 'Jul 2026',
  },
  {
    id: 'rev-2',
    parentInitial: 'R',
    parentName: 'Roberto S.',
    stars: 5,
    quote: 'Muy atento con mi hijo, le dio consejos útiles entre sets sin ponerlo nervioso.',
    date: 'Jun 2026',
  },
  {
    id: 'rev-3',
    parentInitial: 'A',
    parentName: 'Ana F.',
    stars: 4,
    quote: 'Buena comunicación antes del partido, hubiera gustado más detalle en el reporte final.',
    date: 'May 2026',
  },
];

export const mockBookingRequests: BookingRequest[] = [
  {
    id: 'req-1',
    parentName: 'María Torres',
    playerName: 'Valentina Torres',
    playerInitial: 'V',
    category: 'U14 · Individual femenil',
    date: 'Vie 5 Ago',
    time: '10:00 AM',
    venue: 'Club Deportivo Bosques · Cancha 3',
    note: 'Valentina se pone nerviosa con el saque, si puedes darle ánimo entre juegos se lo agradecería.',
    expiresInSeconds: 27 * 60 + 15,
  },
  {
    id: 'req-2',
    parentName: 'Roberto Salinas',
    playerName: 'Diego Salinas',
    playerInitial: 'D',
    category: 'U16 · Individual varonil',
    date: 'Vie 5 Ago',
    time: '1:30 PM',
    venue: 'Club Deportivo Bosques · Cancha 1',
    expiresInSeconds: 4 * 60 + 40,
  },
  {
    id: 'req-3',
    parentName: 'Ana Fuentes',
    playerName: 'Camila Fuentes',
    playerInitial: 'C',
    category: 'U12 · Dobles femenil',
    date: 'Sáb 6 Ago',
    time: '9:00 AM',
    venue: 'Club Deportivo Bosques · Cancha 2',
    note: 'Es su primer torneo nacional, cualquier retroalimentación extra ayuda mucho.',
    expiresInSeconds: 55 * 60,
  },
];

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

export interface ClubInvitation {
  id: string;
  clubName: string;
  tournamentName: string;
  tournamentId: string;
  invitedAt: string;
  message: string;
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
  date: string;
  time: string;
  venue: string;
  agreedRate: number;
  status: CoachBookingStatus;
}

/** The confirmed entry mirrors mockChatThread/mockPreMatchReminder (req-1) so it reads as the same booking. */
export const mockCoachBookings: CoachBooking[] = [
  {
    id: 'req-1',
    parentName: 'María Torres',
    parentInitial: 'M',
    playerName: 'Valentina Torres',
    playerInitial: 'V',
    category: 'U14 · Individual femenil',
    tournamentName: 'Copa Nacional Juvenil',
    date: 'Vie 5 Ago',
    time: '10:00 AM',
    venue: 'Club Deportivo Bosques · Cancha 3',
    agreedRate: 35,
    status: 'confirmed',
  },
  {
    id: 'coach-book-2',
    parentName: 'Sofía Solís',
    parentInitial: 'S',
    playerName: 'Renata Solís',
    playerInitial: 'R',
    category: 'U12 · Individual femenil',
    tournamentName: 'Abierto Regional Sub-16',
    date: '22 Ago 2025',
    time: '9:00 AM',
    venue: 'Club Guadalajara Tenis',
    agreedRate: 30,
    status: 'completed',
  },
  {
    id: 'coach-book-3',
    parentName: 'Luis Vidal',
    parentInitial: 'L',
    playerName: 'Mateo Vidal',
    playerInitial: 'M',
    category: 'U14 · Individual varonil',
    tournamentName: 'Copa de Verano U14',
    date: '3 Sep 2025',
    time: '11:00 AM',
    venue: 'Club Puebla Racquet',
    agreedRate: 40,
    status: 'completed',
  },
  {
    id: 'coach-book-4',
    parentName: 'Patricia Ruiz',
    parentInitial: 'P',
    playerName: 'Emilia Ruiz',
    playerInitial: 'E',
    category: 'U16 · Individual femenil',
    tournamentName: 'Copa Nacional Juvenil',
    date: 'Dom 7 Ago',
    time: '4:00 PM',
    venue: 'Club Deportivo Bosques · Cancha 2',
    agreedRate: 35,
    status: 'cancelled',
  },
];

/** A fresh invitation still awaiting the coach's one required action: accept or decline. */
export const mockPendingClubInvitation: ClubInvitation = {
  id: 'invite-1',
  clubName: 'Club Puebla Racquet',
  tournamentName: 'Copa de Verano U14',
  tournamentId: 'copa-verano-u14',
  invitedAt: 'Hace 2 días',
  message: 'Nos gustaría que fueras uno de los entrenadores oficiales de nuestro club para este torneo.',
};
