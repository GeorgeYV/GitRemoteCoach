/** Espejado en server/src/lib/shotTypes.ts (mismo contenido, sin dependencias de React) — árbol
 * de "tipo de golpe" del modo de captura 'detallada' (ver PointFlow.tsx). Solo aplica a los 5
 * desenlaces de un rally en juego (no a ace/doble falta/error de devolución, que se cierran
 * antes de llegar acá) — la categoría ES el PointDetail resultante, 1:1, así que no hace falta
 * una tabla de mapeo aparte. */
export type PointOutcomeCategory = 'error_no_forzado' | 'error_no_forzado_volea' | 'error_forzado' | 'winner' | 'winner_volea';

export type ShotType =
  | 'paralelo'
  | 'cruzado'
  | 'angulo_corto'
  | 'contrapie'
  | 'de_fondo_invertido'
  | 'de_aproximacion'
  | 'drop_shot_fondo'
  | 'drop_shot_cancha'
  | 'passing_shot'
  | 'globo'
  | 'volea'
  | 'dejada_volea'
  | 'remate'
  | 'de_fondo'
  | 'volea_baja'
  | 'volea_alta'
  | 'swing_volley'
  | 'bote_pronto'
  | 'tiro_aceleracion'
  | 'volea_bloqueo'
  | 'tiro_angular_corto'
  | 'tiro_profundo_linea'
  | 'topspin_alto'
  | 'slice';

export interface ShotTypeOption {
  value: ShotType;
  label: string;
  /** true si ese golpe implica que quien lo pegó estaba en la red — se guarda en netApproach
   * automáticamente, ya no es un toggle manual en modo 'detallada' (ver PointFlow.tsx). */
  netApproach: boolean;
}

export const POINT_OUTCOME_CATEGORY_LABELS: Record<PointOutcomeCategory, string> = {
  error_no_forzado: 'Error no forzado',
  error_no_forzado_volea: 'Error no forzado de volea',
  error_forzado: 'Error forzado',
  winner: 'Winner',
  winner_volea: 'Winner de volea',
};

/** Categorías que además preguntan "Dirección del error" (Red/Larga/Ancha) en el Paso 4 —
 * mismo campo errorDirection que ya usaba el flujo 'rapida', ahora también opcional acá. */
export const CATEGORY_NEEDS_ERROR_DIRECTION: Record<PointOutcomeCategory, boolean> = {
  error_no_forzado: true,
  error_no_forzado_volea: true,
  error_forzado: false,
  winner: false,
  winner_volea: false,
};

export const SHOT_TYPE_OPTIONS: Record<PointOutcomeCategory, ShotTypeOption[]> = {
  winner: [
    { value: 'paralelo', label: 'Paralelo', netApproach: false },
    { value: 'cruzado', label: 'Cruzado', netApproach: false },
    { value: 'angulo_corto', label: 'Ángulo corto', netApproach: false },
    { value: 'contrapie', label: 'Contrapié', netApproach: false },
    { value: 'de_fondo_invertido', label: 'De fondo invertido', netApproach: false },
    { value: 'de_aproximacion', label: 'De aproximación', netApproach: false },
    { value: 'drop_shot_fondo', label: 'Drop shot de fondo', netApproach: false },
    { value: 'drop_shot_cancha', label: 'Drop shot dentro de cancha', netApproach: false },
    { value: 'passing_shot', label: 'Passing shot', netApproach: true },
    { value: 'globo', label: 'Globo', netApproach: true },
  ],
  winner_volea: [
    { value: 'volea', label: 'Volea', netApproach: false },
    { value: 'dejada_volea', label: 'Dejada de volea', netApproach: false },
    { value: 'remate', label: 'Remate', netApproach: false },
  ],
  error_no_forzado: [
    { value: 'de_fondo', label: 'De fondo', netApproach: false },
    { value: 'de_fondo_invertido', label: 'De fondo invertido', netApproach: false },
    { value: 'de_aproximacion', label: 'De aproximación', netApproach: false },
    { value: 'passing_shot', label: 'Passing shot', netApproach: true },
    { value: 'drop_shot_fondo', label: 'Drop shot de fondo', netApproach: false },
    { value: 'drop_shot_cancha', label: 'Drop shot dentro de cancha', netApproach: false },
    { value: 'globo', label: 'Globo', netApproach: false },
    { value: 'bote_pronto', label: 'Bote pronto', netApproach: false },
  ],
  error_no_forzado_volea: [
    { value: 'volea_baja', label: 'Volea baja (debajo de la red)', netApproach: true },
    { value: 'volea_alta', label: 'Volea alta (encima de la red)', netApproach: true },
    { value: 'swing_volley', label: 'Swing volley', netApproach: true },
    { value: 'remate', label: 'Remate', netApproach: true },
  ],
  error_forzado: [
    { value: 'tiro_aceleracion', label: 'Tiro de aceleración', netApproach: false },
    { value: 'volea_bloqueo', label: 'Volea de bloqueo', netApproach: true },
    { value: 'tiro_angular_corto', label: 'Tiro angular corto', netApproach: false },
    { value: 'passing_shot', label: 'Passing shot', netApproach: true },
    { value: 'contrapie', label: 'Contrapié', netApproach: false },
    { value: 'tiro_profundo_linea', label: 'Tiro profundo a la línea', netApproach: false },
    { value: 'topspin_alto', label: 'Bola pesada con topspin alto', netApproach: false },
    { value: 'slice', label: 'Slice', netApproach: false },
    { value: 'drop_shot_fondo', label: 'Drop shot de fondo', netApproach: false },
    { value: 'drop_shot_cancha', label: 'Drop shot dentro de cancha', netApproach: false },
  ],
};
