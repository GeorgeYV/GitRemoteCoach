export interface DateSlot {
  dayLabel: string;
  isoDate: string;
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
 */
export function buildDaySlotsFromRange(startDate: string, endDate: string): DateSlot[] {
  const days: DateSlot[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endUtc = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cursor <= endUtc) {
    const isoDate = cursor.toISOString().slice(0, 10);
    const dayLabel = capitalize(
      cursor.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }),
    );
    days.push({ dayLabel, isoDate });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function dateRangeLabel(startIso: string, endIso: string): string {
  const start = new Date(startIso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  const end = new Date(endIso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${start} – ${end}`;
}
