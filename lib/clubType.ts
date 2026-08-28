import type { Club } from './api';

/**
 * Etiquetas para clubs.type (db/schema.sql: club_type). Antes vivía duplicado como TYPE_LABELS
 * suelto en un par de pantallas (PlatformAdminClubVerificationScreen, ClubJoinScreen) — se
 * centraliza acá para extenderlo al resto de la app en vez de triplicarlo de nuevo. George va a
 * empezar a registrar solo federaciones, así que en la práctica esto va a mostrar "Federación" en
 * casi todos lados — pero sigue distinguiendo si algún día vuelve a haber un club real.
 */
export const CLUB_TYPE_LABELS: Record<Club['type'], string> = {
  club: 'Club',
  federation: 'Federación',
};

/** Misma etiqueta en minúscula, para usar en medio de una oración ("tu club no pasó..."). */
export const CLUB_TYPE_LABELS_LOWER: Record<Club['type'], string> = {
  club: 'club',
  federation: 'federación',
};

/** "el"/"la" — club es masculino, federación es femenino. Para frases tipo "identidad de quien
 * registra {artículo} {tipo}" que CLUB_TYPE_LABELS_LOWER solo no alcanza a armar bien. */
export const CLUB_TYPE_ARTICLE: Record<Club['type'], string> = {
  club: 'el',
  federation: 'la',
};
