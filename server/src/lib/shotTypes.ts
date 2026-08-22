/** Espejo de lib/shotTypes.ts (frontend) — mismo contenido, sin dependencias de React. Fuente de
 * verdad de los ids válidos de "tipo de golpe" del modo de captura 'detallada', para validar el
 * payload en routes/matches.ts. */
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

export const SHOT_TYPE_IDS: ShotType[] = [
  'paralelo',
  'cruzado',
  'angulo_corto',
  'contrapie',
  'de_fondo_invertido',
  'de_aproximacion',
  'drop_shot_fondo',
  'drop_shot_cancha',
  'passing_shot',
  'globo',
  'volea',
  'dejada_volea',
  'remate',
  'de_fondo',
  'volea_baja',
  'volea_alta',
  'swing_volley',
  'bote_pronto',
  'tiro_aceleracion',
  'volea_bloqueo',
  'tiro_angular_corto',
  'tiro_profundo_linea',
  'topspin_alto',
  'slice',
];
