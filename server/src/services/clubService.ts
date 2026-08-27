import type { PoolClient } from 'pg';
import { withTransaction } from '../lib/db.js';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import { isR2Configured, uploadObject } from '../lib/r2.js';
import * as clubRepository from '../repositories/clubRepository.js';
import * as settlementRepository from '../repositories/settlementRepository.js';
import * as tournamentRepository from '../repositories/tournamentRepository.js';
import type { AgeCategory, Club, ClubSearchResult, ClubSettlementWithTournamentName, CountryCode, TournamentSummary } from '../types.js';

// GET /clubs/:id y GET /club-admins/:userId/club son públicas, sin sesión (ver comentario en
// routes/clubs.ts) — identityDocumentUrl es la identidad de la persona que registró el club (ver
// decisión #43 en db/schema.sql), nunca debería quedar visible ahí. La cola de verificación del
// platform_admin (listPendingClubVerifications, ruta protegida por rol) sí lo necesita para saber
// si ya se recibió, así que esta función NO se usa en ese camino.
function withoutIdentityDocument(club: Club): Club {
  return { ...club, identityDocumentUrl: null };
}

export async function getClub(clubId: string): Promise<Club> {
  return withoutIdentityDocument(await clubRepository.getById(clubId));
}

/** ClubFlow: resuelve el club del club_admin logueado antes de montar sus pantallas. */
export async function getClubForAdmin(userId: string): Promise<Club> {
  const clubId = await clubRepository.getClubIdForAdminUser(userId);
  return withoutIdentityDocument(await clubRepository.getById(clubId));
}

/** Un usuario solo puede administrar un club a la vez (ver decisión #42) — reusado por
 * registerClub, y por aceptar una invitación o aprobar una solicitud de acceso (Etapa
 * club_admin_invitations/club_admin_join_requests). `client` opcional para correr dentro de la
 * misma transacción que marca la invitación/solicitud respondida. */
async function assertUserHasNoClub(userId: string, client?: PoolClient): Promise<void> {
  try {
    await clubRepository.getClubIdForAdminUser(userId, client);
    throw new ConflictError('Ya administras un club', 'already_club_admin');
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
  }
}

/** ClubRegistrationScreen: onboarding de un usuario club_admin recién registrado — antes de
 * esto, club_admins no tenía ninguna fila para él y ClubFlow se quedaba atascado para siempre
 * en "No se pudo cargar tu club". Crea el club y lo vincula al usuario en una transacción. */
export async function registerClub(
  adminUserId: string,
  input: {
    name: string;
    type: 'club' | 'federation';
    city: string;
    country: CountryCode;
    contactEmail?: string;
    contactPhone?: string;
    identityDocumentUrl: string;
  },
): Promise<Club> {
  await assertUserHasNoClub(adminUserId);
  return withTransaction(async (client) => {
    const club = await clubRepository.create(
      {
        name: input.name,
        type: input.type,
        city: input.city,
        country: input.country,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
        identityDocumentUrl: input.identityDocumentUrl,
      },
      client,
    );
    await clubRepository.addAdmin(club.id, adminUserId, client);
    return club;
  });
}

const ALLOWED_IDENTITY_DOCUMENT_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};
const MAX_IDENTITY_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** ClubRegistrationScreen: sube el archivo real de identidad de quien registra el club. Se llama
 * ANTES de "Registrar club" (todavía no existe el club), así que se guarda bajo el propio userId
 * autenticado — mismo criterio de key determinística que coachProfileService.uploadVerificationDocumentFile
 * (un usuario solo administra un club a la vez, ver assertUserHasNoClub, así que no hay riesgo de
 * pisar el documento de un club distinto). Solo devuelve la URL: la fila real se crea recién al
 * enviar el registro completo (POST /clubs). */
export async function uploadIdentityDocumentFile(
  userId: string,
  buffer: Buffer,
  mimeType: string,
): Promise<{ fileUrl: string }> {
  if (!isR2Configured()) {
    throw new AppError(
      'La subida de documentos todavía no está configurada en el servidor.',
      503,
      'document_upload_unavailable',
    );
  }
  const ext = ALLOWED_IDENTITY_DOCUMENT_MIME_TYPES[mimeType];
  if (!ext) throw new ValidationError('Formato no soportado (usa JPG, PNG o PDF)');
  if (buffer.byteLength > MAX_IDENTITY_DOCUMENT_BYTES) throw new ValidationError('El archivo no puede pesar más de 10MB');

  const fileUrl = await uploadObject(`club-identity-docs/${userId}.${ext}`, buffer, mimeType);
  return { fileUrl };
}

/** ClubJoinScreen "Buscar mi club" — para pedir acceso a uno ya existente en vez de crear uno
 * nuevo (ver decisión #42). Sin filtrar por verificación, ver clubRepository.search. */
export async function searchClubs(query: string): Promise<ClubSearchResult[]> {
  return clubRepository.search(query);
}

/** Aplicado tanto al aceptar una invitación (club_admin_invitations) como al aprobar una
 * solicitud de acceso (club_admin_join_requests) — mismo chequeo de "un club por admin" que
 * registerClub. `client` debe ser el mismo de la transacción que marca la fila respondida, para
 * que el chequeo y el insert sean atómicos con esa transición de status. */
export async function linkAdminToClub(userId: string, clubId: string, client: PoolClient): Promise<void> {
  await assertUserHasNoClub(userId, client);
  await clubRepository.addAdmin(clubId, userId, client);
}

/** ClubHomeScreen "Editar perfil" — el chequeo de que quien llama de verdad administra este
 * club vive en la ruta (mismo patrón que POST /clubs/:id/tournaments). */
export async function updateClub(
  clubId: string,
  input: {
    name: string;
    type: 'club' | 'federation';
    city: string;
    country: CountryCode;
    contactEmail?: string;
    contactPhone?: string;
  },
): Promise<Club> {
  return clubRepository.update(clubId, {
    name: input.name,
    type: input.type,
    city: input.city,
    country: input.country,
    contactEmail: input.contactEmail ?? null,
    contactPhone: input.contactPhone ?? null,
  });
}

/** PlatformAdminClubVerificationScreen: cola de clubes pendientes de revisión. */
export async function listPendingClubVerifications(): Promise<Club[]> {
  return clubRepository.listPendingVerification();
}

/** PlatformAdminClubVerificationScreen: aprobar o rechazar un club — el chequeo de rol
 * (platform_admin) vive en la ruta, mismo patrón que el resto de las colas de revisión. */
export async function reviewClubVerification(
  clubId: string,
  input: { status: 'approved' | 'rejected'; reviewedBy: string },
): Promise<Club> {
  return clubRepository.reviewVerification(clubId, input);
}

export async function listSettlementsForClub(clubId: string): Promise<ClubSettlementWithTournamentName[]> {
  return settlementRepository.listByClub(clubId);
}

export async function listTournamentsForClub(clubId: string): Promise<TournamentSummary[]> {
  return tournamentRepository.listByClub(clubId);
}

/** ClubCreateTournamentScreen: el club registra un torneo nuevo — a partir de acá ya puede
 * invitar coaches y (una vez 'scheduled') aparece en el descubrimiento público (GET /tournaments). */
export async function createTournamentForClub(
  clubId: string,
  input: { name: string; venue: string; city: string; ageCategories: AgeCategory[]; startDate: string; endDate: string },
): Promise<TournamentSummary> {
  // Transacción: el INSERT del torneo y el de tournament_age_categories no deben quedar a medias
  // (mismo criterio que registerCoachProfile con coach_age_categories).
  return withTransaction((client) => tournamentRepository.create({ clubId, ...input }, client));
}

/** ClubCreateTournamentScreen (editar) — decisión #47: nombre/sede/ciudad/categorías se pueden
 * corregir siempre, pero las fechas NO si el torneo ya tiene una reserva no descartada — bookings
 * trae las fechas del torneo con un JOIN en vivo (no una copia propia), así que cambiarlas acá le
 * movería la fecha a un padre que ya reservó/pagó sin avisarle. El chequeo se hace acá (no en el
 * repositorio) porque es una regla de negocio, no de integridad de datos — y se repite del lado
 * del server aunque el cliente ya deshabilite las fechas en la UI cuando hasActiveBookings es
 * true, para no confiar solo en eso. */
export async function updateTournamentForClub(
  clubId: string,
  tournamentId: string,
  input: { name: string; venue: string; city: string; ageCategories: AgeCategory[]; startDate: string; endDate: string },
): Promise<TournamentSummary> {
  return withTransaction(async (client) => {
    const current = await tournamentRepository.getSummaryById(tournamentId, client);
    if (!current || current.clubId !== clubId) throw new NotFoundError('Tournament', tournamentId);

    const datesChanged = current.startDate !== input.startDate || current.endDate !== input.endDate;
    if (datesChanged && current.hasActiveBookings) {
      throw new ConflictError(
        'Este torneo ya tiene reservas activas — no se pueden cambiar sus fechas. Si hay un error real en la fecha, contacta a soporte.',
        'tournament_dates_locked',
      );
    }

    return tournamentRepository.update(tournamentId, input, client);
  });
}
