// Cuántos días antes de start_date se ofrecen además de los días oficiales del torneo, para
// entrenamientos previos (1 día antes es lo habitual, 2 es la excepción) — ver
// db/schema.sql#33 y el trigger fn_coach_tournament_availability_before_write, que acepta el
// mismo rango. Compartido entre CoachAvailabilityScreen y TrainerProfileScreen para que ambos
// lados (coach y padre) vean exactamente los mismos días.
export const PRE_TOURNAMENT_DAYS = 2;

export interface DateSlot {
  dayLabel: string;
  isoDate: string;
  /** true para los días previos al torneo (ver daysBefore) — el coach puede declararse
   * disponible ahí para entrenar antes de que arranque, pero no es un día oficial del torneo. */
  isPreTournament: boolean;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Un DateSlot por cada día calendario entre start y end (inclusive), con su fecha ISO real y una
 * etiqueta corta en español para mostrar (p. ej. "Vie 5"). Todo en UTC a propósito: start/end llegan
 * como columnas DATE serializadas por pg como datetime ISO (p. ej. "2026-08-22T05:00:00.000Z", no
 * "2026-08-22" plano), así que hacer aritmética de fechas en hora local podría correr el día según
 * la zona horaria del navegador. Compartido entre CoachAvailabilityScreen y el flujo de reserva del
 * padre (TrainerProfileScreen/BookingConfirmScreen) — ambos generan slots reales a partir del rango
 * de un torneo en vez de un checklist de fechas fijo.
 *
 * daysBefore agrega esa cantidad de días previos a startDate, marcados isPreTournament — refleja
 * la ventana que acepta el trigger de coach_tournament_availability (hasta 2 días antes, ver
 * db/schema.sql#33) para entrenamientos previos al torneo.
 */
export function buildDaySlotsFromRange(startDate: string, endDate: string, daysBefore = 0): DateSlot[] {
  const days: DateSlot[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const startUtc = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endUtc = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  const cursor = new Date(startUtc);
  cursor.setUTCDate(cursor.getUTCDate() - daysBefore);
  while (cursor <= endUtc) {
    const isoDate = cursor.toISOString().slice(0, 10);
    const dayLabel = capitalize(
      cursor.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }),
    );
    days.push({ dayLabel, isoDate, isPreTournament: cursor < startUtc });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function dateRangeLabel(startIso: string, endIso: string): string {
  const start = new Date(startIso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  const end = new Date(endIso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${start} – ${end}`;
}

const DATE_STRING_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Formularios con fecha en texto libre (AAAA-MM-DD, ej. PlayerRegistrationScreen,
 * ClubCreateTournamentScreen, PlatformAdminTournamentScreen) validan con esto antes de mandar
 * al backend — si no, el error crudo de Zod (z.string().date()) se le mostraba tal cual al
 * usuario. Chequea también que sea una fecha real: new Date("2026-02-30") no lanza, "corrige"
 * silenciosamente al 2 de marzo, así que hay que comparar los componentes de vuelta. */
export function isValidDateString(value: string): boolean {
  if (!DATE_STRING_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

const TIME_STRING_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Formulario "Reprogramar horario" (CoachPreMatchReminderScreen y su equivalente del padre) —
 * HH:MM 24 horas. */
export function isValidTimeString(value: string): boolean {
  return TIME_STRING_PATTERN.test(value);
}

/** Descompone un matchDatetime ISO en fecha/hora LOCAL editables (AAAA-MM-DD, HH:MM) — el
 * dispositivo del coach/padre está donde se juega el partido, así que su hora local es la hora
 * real del partido. Inverso de localDateAndTimeToIso. */
export function isoToLocalDateAndTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { date, time };
}

/** Combina fecha/hora LOCAL (ya validadas con isValidDateString/isValidTimeString) en un
 * matchDatetime ISO — new Date(...) interpreta el string sin "Z" en la zona horaria local del
 * dispositivo, que es exactamente lo que queremos acá. */
export function localDateAndTimeToIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

/** Fecha de HOY (AAAA-MM-DD) en el huso horario LOCAL del dispositivo — a propósito no usa
 * toISOString() (convierte a UTC primero y puede correr el día). Usado por DatePickerField como
 * mes/día por defecto y como maxDate en campos que no aceptan fechas futuras (ej. nacimiento). */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
