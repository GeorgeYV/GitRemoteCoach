/**
 * Tema claro "Cancha dura" (ver diseno-a-cancha-dura.svg) — antes era un tema oscuro
 * (fondo casi negro, texto blanco). Dos roles cambiaron de sentido al pasar a fondo claro:
 * - courtBlueDeep ya no es fondo de barras (ScoreHeader, LiveStatsBar, ParentTabBar, footers)
 *   — esas ahora usan `panel` (superficie clara). Quedó solo como "tinta oscura" para texto
 *   sobre fondos claros o de acento (ballLime), su otro uso original.
 * - courtBlue (antes casi sin uso) ahora es el "azul de marca" para texto/íconos de énfasis
 *   (rótulos, chips) — reemplaza a ballLime en ese rol, porque lima sobre blanco no tiene
 *   contraste suficiente para texto; ballLime queda para fondos de botón/píldora y acentos.
 */
export const colors = {
  bg: '#FFFFFF',
  courtBlue: '#1F4E8C',
  courtBlueDeep: '#123259',
  lineWhite: '#0E2038',
  ballLime: '#C6E23A',
  ballLimeDim: '#A9BC2F',
  errorCoral: '#E5573F',
  errorCoralDeep: '#B8412D',
  /** Estado "esperando" (ej. solicitud de reserva sin responder aún) — distinto de errorCoral,
   * que es para resultados negativos definitivos (rechazada, cancelada). */
  amber: '#D9822B',
  panel: '#F7F9FB',
  panelLight: '#FFFFFF',
  textDim: '#8494A6',
  textSoft: '#5B6B7C',
  border: 'rgba(18,50,89,0.14)',
  borderSoft: 'rgba(18,50,89,0.08)',
};

export const radius = 18;

/** Derives a translucent rgba() variant of an existing theme hex color — use this
 * instead of introducing a brand-new color literal when a tinted background is needed. */
export function withOpacity(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.substring(0, 2), 16);
  const g = parseInt(value.substring(2, 4), 16);
  const b = parseInt(value.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
