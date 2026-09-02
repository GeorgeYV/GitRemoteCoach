import { useEffect, useState } from 'react';

/** Segundos restantes hasta `deadlineIso` (null si no hay ninguna fecha), 0 si ya venció —
 * se recalcula cada `tickMs` (default 30s, no hace falta el tick de 1s de CountdownPill: estas
 * ventanas son de horas, no de minutos, ver components/coach/CountdownPill.tsx). */
export function useCountdown(deadlineIso: string | null, tickMs = 30_000): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadlineIso) return;
    const interval = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(interval);
  }, [deadlineIso, tickMs]);

  if (!deadlineIso) return null;
  return Math.max(0, Math.round((new Date(deadlineIso).getTime() - now) / 1000));
}

/** "3h 42min" / "42 min" / "Vencido" — formato legible para ventanas de horas (respuesta del
 * entrenador, pago del padre), a diferencia del mm:ss de CountdownPill (pensado para el detalle
 * de una sola solicitud, no para un resumen en Inicio). */
export function formatHoursCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return 'Vencido';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}min`;
  if (minutes > 0) return `${minutes} min`;
  return 'menos de 1 min';
}
