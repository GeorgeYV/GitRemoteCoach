/** Dominio placeholder — la app todavía no está publicada (ni tienda ni web hosteada), así que
 * el enlace generado no resuelve todavía. Reemplazar por el dominio real cuando exista un
 * despliegue público; el resto del feature (QR, texto para copiar) no necesita cambios. */
export const SHARE_BASE_URL = 'https://app.remotecoach.example';

export function buildTournamentShareUrl(tournamentId: string): string {
  return `${SHARE_BASE_URL}/torneos/${tournamentId}`;
}

/** Texto listo para pegar en WhatsApp o correo — invita a un padre nuevo a bajarse la app para
 * ese torneo puntual. */
export function buildTournamentShareMessage(params: {
  tournamentName: string;
  venue: string;
  dateRangeLabel: string;
  shareUrl: string;
}): string {
  return (
    `¡Hola! Te invito a conocer Remote Coach para el torneo "${params.tournamentName}" ` +
    `(${params.venue}, ${params.dateRangeLabel}). Desde ahí podés reservar un entrenador para tu hijo/a:\n\n` +
    `${params.shareUrl}`
  );
}
