export const colors = {
  bg: '#05121F',
  courtBlue: '#12314F',
  courtBlueDeep: '#0A2138',
  lineWhite: '#F4F7F5',
  ballLime: '#CFE23A',
  ballLimeDim: '#A9BC2F',
  errorCoral: '#E5573F',
  errorCoralDeep: '#B8412D',
  panel: '#16385A',
  panelLight: '#1D4569',
  textDim: '#8FA6BC',
  textSoft: '#C7D6E3',
  border: 'rgba(255,255,255,0.1)',
  borderSoft: 'rgba(255,255,255,0.06)',
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
