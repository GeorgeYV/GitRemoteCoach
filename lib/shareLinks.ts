/** Dominio real del despliegue web (Render, ver render.yaml). Actualizar acá si el dominio
 * vuelve a cambiar (dominio propio, etc.) — el resto del feature (QR, texto para copiar) no
 * necesita cambios. */
export const SHARE_BASE_URL = 'https://remote-coach-web.onrender.com';

/** Todavía no existe una pantalla pública de detalle por torneo (app/torneos/[id].tsx) — el
 * enlace lleva al inicio de la app en general, no a este torneo puntual. El mensaje que lo
 * acompaña (buildTournamentShareMessage) ya menciona el nombre del torneo, así que un padre
 * nuevo puede registrarse y buscarlo. tournamentId queda sin usar por ahora, a propósito: si más
 * adelante se construye esa pantalla, esta función es el único lugar que hay que tocar. */
export function buildTournamentShareUrl(_tournamentId: string): string {
  return SHARE_BASE_URL;
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
    `(${params.venue}, ${params.dateRangeLabel}). Desde ahí puedes reservar un entrenador para tu hijo/a:\n\n` +
    `${params.shareUrl}`
  );
}
