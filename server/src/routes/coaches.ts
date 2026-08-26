import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as coachProfileService from '../services/coachProfileService.js';
import * as bookingService from '../services/bookingService.js';
import * as matchService from '../services/matchService.js';
import * as tournamentService from '../services/tournamentService.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';

const AGE_CATEGORIES = ['U10', 'U12', 'U14', 'U16', 'U18'] as const;
const PLAYING_LEVELS = ['recreativo', 'competitivo', 'alto_rendimiento'] as const;
const VERIFICATION_DOC_TYPES = ['identity', 'background_check', 'certification', 'club_reference'] as const;
const COUNTRY_CODES = ['EC', 'PE', 'CO', 'CL', 'BO', 'AR', 'VE', 'BR', 'PY', 'UY'] as const;

const updateTrainingSchema = z.object({
  ageCategories: z.array(z.enum(AGE_CATEGORIES)),
  levels: z.array(z.enum(PLAYING_LEVELS)),
});

const registerCoachSchema = z.object({
  city: z.string().min(1),
  region: z.string().min(1).optional(),
  country: z.enum(COUNTRY_CODES),
  yearsExperience: z.number().int().min(0),
  specialty: z.string().min(1).optional(),
  hourlyRate: z.number().min(0),
  ageCategories: z.array(z.enum(AGE_CATEGORIES)),
  levels: z.array(z.enum(PLAYING_LEVELS)),
  // fileUrl viene de POST /coaches/:id/verification-documents/upload, ya subido a R2.
  documents: z.array(z.object({ docType: z.enum(VERIFICATION_DOC_TYPES), fileUrl: z.string().min(1) })).default([]),
});

export async function coachRoutes(app: FastifyInstance): Promise<void> {
  // ClubInviteCoachScreen: búsqueda por nombre/ciudad, excluyendo coaches ya oficiales o ya invitados.
  app.get('/coaches', async (req) => {
    const { search, excludeTournamentId } = req.query as { search?: string; excludeTournamentId?: string };
    return coachProfileService.searchCoaches({ query: search, excludeTournamentId });
  });

  // CoachRegistrationScreen "Enviar para verificación": crea el perfil del coach logueado — el
  // user_id sale de la sesión, no del body, para que nadie pueda crear/pisar el perfil de otro.
  app.post('/coaches', { preHandler: app.authenticate }, async (req, reply) => {
    const parsed = registerCoachSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);

    const { sub } = req.user as { sub: string };
    const profile = await coachProfileService.registerCoachProfile(sub, {
      city: parsed.data.city,
      region: parsed.data.region ?? null,
      country: parsed.data.country,
      yearsExperience: parsed.data.yearsExperience,
      specialty: parsed.data.specialty ?? null,
      hourlyRate: parsed.data.hourlyRate,
      ageCategories: parsed.data.ageCategories,
      levels: parsed.data.levels,
      documents: parsed.data.documents,
    });
    reply.code(201);
    return profile;
  });

  app.get('/coaches/:id', async (req) => {
    const { id } = req.params as { id: string };
    return coachProfileService.getCoachProfile(id);
  });

  // TrainerProfileScreen "Estadísticas de partidos": público como el resto del perfil — solo
  // devuelve sumas/promedios agregados, nunca el detalle de un partido individual.
  app.get('/coaches/:id/report-summary', async (req) => {
    const { id } = req.params as { id: string };
    return matchService.getCoachReportSummary(id);
  });

  // CoachHomeScreen: banner prioritario de un partido suspendido pendiente de retomar —
  // privado, a diferencia de report-summary (revela con qué jugador quedó a mitad de captura).
  app.get('/coaches/:id/suspended-match', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };
    if (sub !== id) throw new ForbiddenError('Solo el propio entrenador puede ver esto');
    return matchService.getSuspendedMatchForCoach(id);
  });

  // CoachSessionHistoryScreen: insignia roja "Partido Finalizado por Retiro" en la lista —
  // privado, igual criterio que suspended-match.
  app.get('/coaches/:id/retired-bookings', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };
    if (sub !== id) throw new ForbiddenError('Solo el propio entrenador puede ver esto');
    return matchService.getRetiredBookingIds(id);
  });

  // CoachAvailabilityScreen, CoachTournamentSearchScreen, CoachReputationScreen: insignias de
  // "entrenador oficial" — público, igual que /coaches/:id/reviews.
  app.get('/coaches/:id/club-tags', async (req) => {
    const { id } = req.params as { id: string };
    return tournamentService.listClubTagsForCoach(id);
  });

  // CoachRegistrationScreen "Editar perfil" — datos personales/tarifa del propio entrenador
  // logueado. No toca ageCategories/levels (ver /training) ni documentos/verificación.
  app.put('/coaches/:id/profile', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };
    if (sub !== id) throw new ForbiddenError('No puedes modificar el perfil de otro entrenador');
    const parsed = registerCoachSchema
      .omit({ ageCategories: true, levels: true, documents: true })
      .safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    return coachProfileService.updateCoachProfileDetails(id, {
      city: parsed.data.city,
      region: parsed.data.region ?? null,
      country: parsed.data.country,
      yearsExperience: parsed.data.yearsExperience,
      specialty: parsed.data.specialty ?? null,
      hourlyRate: parsed.data.hourlyRate,
    });
  });

  // Guarda categorías de edad + niveles de juego del propio entrenador logueado.
  app.put('/coaches/:id/training', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };
    if (sub !== id) throw new ForbiddenError('No puedes modificar el perfil de otro entrenador');
    const parsed = updateTrainingSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    return coachProfileService.updateCoachTraining(id, parsed.data);
  });

  // CoachHomeScreen, CoachRequestInboxScreen, CoachSessionHistoryScreen, CoachEarningsScreen.
  app.get('/coaches/:id/bookings', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };
    if (sub !== id) throw new ForbiddenError('No puedes ver las reservas de otro entrenador');
    return bookingService.listBookingsForCoach(id);
  });

  // CoachRegistrationScreen "Agregar foto de perfil" — multipart de un solo archivo (límite de
  // tamaño ya aplicado por el plugin @fastify/multipart, ver app.ts).
  app.post('/coaches/:id/photo', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };
    if (sub !== id) throw new ForbiddenError('No puedes cambiar la foto de otro entrenador');

    const data = await req.file();
    if (!data) throw new ValidationError('Falta el archivo de la foto');
    const buffer = await data.toBuffer();
    return coachProfileService.updateCoachPhoto(id, buffer, data.mimetype);
  });

  // CoachVerificationPendingScreen: checklist real, documentos de identidad — no público.
  app.get('/coaches/:id/verification-documents', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };
    if (sub !== id) throw new ForbiddenError('No puedes ver los documentos de otro entrenador');
    return coachProfileService.listVerificationDocuments(id);
  });

  // CoachRegistrationScreen: sube el archivo real de un documento del checklist — multipart
  // (archivo + campo de texto docType), mismo patrón que POST /matches/:id/voice-notes ya que
  // acá tampoco hay attachFieldsToBody global (ver app.ts). Se llama antes de existir la fila en
  // coach_profiles, así que `id` es simplemente el propio userId autenticado (sub === id).
  app.post('/coaches/:id/verification-documents/upload', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub } = req.user as { sub: string };
    if (sub !== id) throw new ForbiddenError('No puedes subir documentos de otro entrenador');

    let fileBuffer: Buffer | null = null;
    let mimetype = '';
    let docType = '';
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer();
        mimetype = part.mimetype;
      } else if (part.fieldname === 'docType') {
        docType = String(part.value);
      }
    }
    if (!fileBuffer) throw new ValidationError('Falta el archivo');
    const parsedDocType = z.enum(VERIFICATION_DOC_TYPES).safeParse(docType);
    if (!parsedDocType.success) throw new ValidationError('Tipo de documento inválido');

    return coachProfileService.uploadVerificationDocumentFile(id, parsedDocType.data, fileBuffer, mimetype);
  });
}
