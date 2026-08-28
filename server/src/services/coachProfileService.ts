import { withTransaction } from '../lib/db.js';
import { AppError, ValidationError } from '../lib/errors.js';
import { isR2Configured, uploadObject } from '../lib/r2.js';
import * as coachRepository from '../repositories/coachRepository.js';
import * as coachVerificationDocumentRepository from '../repositories/coachVerificationDocumentRepository.js';
import * as notificationService from './notificationService.js';
import type { CoachVerificationBadges } from '../repositories/coachVerificationDocumentRepository.js';
import type {
  AgeCategory,
  CoachProfile,
  CoachSearchResult,
  CoachVerificationDocument,
  CoachVerificationDocumentWithCoachName,
  CountryCode,
  PlayingLevel,
  VerificationDocType,
} from '../types.js';

export interface CoachProfileWithTraining {
  profile: CoachProfile;
  ageCategories: AgeCategory[];
  levels: PlayingLevel[];
}

/** Lo que devuelve el perfil público (getCoachProfile) — a diferencia del resto de funciones de
 * este archivo, que devuelven CoachProfileWithTraining tal cual, esta suma verifiedBadges: solo
 * tiene sentido calcularlo (y pagar el costo de la consulta) para la vista que ve el padre, no
 * para cada guardado del propio coach editando su perfil. */
export interface CoachProfileWithTrainingAndBadges extends CoachProfileWithTraining {
  verifiedBadges: CoachVerificationBadges;
}

export async function searchCoaches(params: {
  query?: string;
  excludeTournamentId?: string;
}): Promise<CoachSearchResult[]> {
  return coachRepository.search(params);
}

/** GET /coaches/:id — perfil público (TrainerProfileScreen), sin sesión. stripeConnectedAccountId
 * se anula acá: es un identificador interno de la pasarela de pago (solo lo necesita el propio
 * coach al editar su perfil, o el server al pagarle — ver coachProfileService.updateCoachProfile
 * y paymentService), nunca debería ser visible en el perfil que ve un padre. */
export async function getCoachProfile(coachId: string): Promise<CoachProfileWithTrainingAndBadges> {
  const [profile, ageCategories, levels, verifiedBadges] = await Promise.all([
    coachRepository.getCoachProfile(coachId),
    coachRepository.getCoachAgeCategories(coachId),
    coachRepository.getCoachLevels(coachId),
    coachVerificationDocumentRepository.getVerifiedBadges(coachId),
  ]);
  return { profile: { ...profile, stripeConnectedAccountId: null }, ageCategories, levels, verifiedBadges };
}

/**
 * CoachRegistrationScreen "Enviar para verificación": crea coach_profiles + categorías de edad +
 * niveles en una sola transacción — un registro a medias (perfil sin training o viceversa) dejaría
 * al coach en un estado que ninguna pantalla sabe interpretar.
 */
export async function registerCoachProfile(
  userId: string,
  params: {
    city: string;
    region: string | null;
    country: CountryCode;
    yearsExperience: number;
    specialty: string | null;
    hourlyRate: number;
    ageCategories: AgeCategory[];
    levels: PlayingLevel[];
    documents: { docType: VerificationDocType; fileUrl: string }[];
  },
): Promise<CoachProfileWithTraining> {
  const result = await withTransaction(async (client) => {
    await coachRepository.create(
      userId,
      {
        city: params.city,
        region: params.region,
        country: params.country,
        yearsExperience: params.yearsExperience,
        specialty: params.specialty,
        hourlyRate: params.hourlyRate,
      },
      client,
    );
    await coachRepository.setCoachAgeCategories(userId, params.ageCategories, client);
    await coachRepository.setCoachLevels(userId, params.levels, client);
    for (const doc of params.documents) {
      await coachVerificationDocumentRepository.create({ coachId: userId, docType: doc.docType, fileUrl: doc.fileUrl }, client);
    }
    if (params.documents.length > 0) {
      await coachVerificationDocumentRepository.recalculateVerificationStatus(userId, client);
    }
    const profile = await coachRepository.getCoachProfile(userId, client);
    return { profile, ageCategories: params.ageCategories, levels: params.levels };
  });

  if (params.documents.length > 0) {
    await notificationService.notifyRoleByEmail('platform_admin', {
      subject: 'Nuevo entrenador para verificar — Remote Coach',
      html: `<p><strong>${result.profile.city}</strong> tiene un entrenador nuevo con documentos pendientes de revisión.</p>`,
    });
  }

  return result;
}

/** CoachRegistrationScreen "Editar perfil" — datos personales/tarifa, sin tocar
 * ageCategories/levels (eso lo cubre updateCoachTraining aparte) ni documentos/verificación. */
export async function updateCoachProfileDetails(
  coachId: string,
  params: {
    city: string;
    region: string | null;
    country: CountryCode;
    yearsExperience: number;
    specialty: string | null;
    hourlyRate: number;
  },
): Promise<CoachProfile> {
  return coachRepository.update(coachId, params);
}

const ALLOWED_PHOTO_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** CoachRegistrationScreen "Agregar foto de perfil" — misma key por coach (coach-photos/<id>.<ext>)
 * a propósito: una foto nueva reemplaza a la anterior en R2 en vez de acumular huérfanas. Si el
 * tipo cambia (ej. png → jpg) queda un archivo viejo huérfano con extensión distinta; aceptable
 * para esta primera versión, no vale la pena trackear/limpiar la extensión anterior todavía. */
export async function updateCoachPhoto(coachId: string, buffer: Buffer, mimeType: string): Promise<CoachProfile> {
  if (!isR2Configured()) {
    throw new AppError(
      'La subida de fotos todavía no está configurada en el servidor.',
      503,
      'photo_upload_unavailable',
    );
  }
  const ext = ALLOWED_PHOTO_MIME_TYPES[mimeType];
  if (!ext) throw new ValidationError('Formato de imagen no soportado (usa JPG, PNG o WEBP)');
  if (buffer.byteLength > MAX_PHOTO_BYTES) throw new ValidationError('La imagen no puede pesar más de 5MB');

  const photoUrl = await uploadObject(`coach-photos/${coachId}.${ext}`, buffer, mimeType);
  return coachRepository.updatePhotoUrl(coachId, photoUrl);
}

const ALLOWED_DOCUMENT_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** CoachRegistrationScreen: sube el archivo real de un documento del checklist de verificación.
 * Se llama ANTES de "Enviar para verificación" (todavía no existe la fila en coach_profiles), así
 * que se guarda bajo el propio userId autenticado — mismo criterio de key determinística por
 * (coach, tipo de doc) que la foto de perfil usa por coach, para que volver a elegir el archivo
 * sobreescriba en R2 en vez de acumular huérfanos. Solo devuelve la URL: la fila real en
 * coach_verification_documents se crea recién al enviar el registro completo (POST /coaches). */
export async function uploadVerificationDocumentFile(
  coachId: string,
  docType: VerificationDocType,
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
  const ext = ALLOWED_DOCUMENT_MIME_TYPES[mimeType];
  if (!ext) throw new ValidationError('Formato no soportado (usa JPG, PNG o PDF)');
  if (buffer.byteLength > MAX_DOCUMENT_BYTES) throw new ValidationError('El archivo no puede pesar más de 10MB');

  const fileUrl = await uploadObject(`coach-verification-docs/${coachId}/${docType}.${ext}`, buffer, mimeType);
  return { fileUrl };
}

/**
 * CoachRegistrationScreen guarda categorías de edad y niveles de juego
 * juntos (un solo botón "Enviar para verificación"); se hacen atómicos para
 * no dejar uno sin el otro si algo falla a la mitad.
 */
export async function updateCoachTraining(
  coachId: string,
  params: { ageCategories: AgeCategory[]; levels: PlayingLevel[] },
): Promise<CoachProfileWithTraining> {
  return withTransaction(async (client) => {
    await coachRepository.setCoachAgeCategories(coachId, params.ageCategories, client);
    await coachRepository.setCoachLevels(coachId, params.levels, client);
    const profile = await coachRepository.getCoachProfile(coachId, client);
    return { profile, ageCategories: params.ageCategories, levels: params.levels };
  });
}

/** CoachVerificationPendingScreen: checklist real del propio entrenador. */
export async function listVerificationDocuments(coachId: string): Promise<CoachVerificationDocument[]> {
  return coachVerificationDocumentRepository.listForCoach(coachId);
}

/** PlatformAdminReviewScreen: cola de documentos pendientes de todos los coaches. */
export async function listPendingVerificationDocuments(): Promise<CoachVerificationDocumentWithCoachName[]> {
  return coachVerificationDocumentRepository.listPending();
}

/**
 * Cola de revisión del admin de plataforma (PlatformAdminReviewScreen). Recalcula
 * coach_profiles.verification_status en la misma transacción para que quede consistente con el
 * documento recién revisado.
 */
export async function reviewVerificationDocument(
  documentId: string,
  params: { status: 'approved' | 'rejected'; reviewedBy: string },
): Promise<CoachVerificationDocument> {
  return withTransaction(async (client) => {
    const document = await coachVerificationDocumentRepository.review(documentId, params, client);
    await coachVerificationDocumentRepository.recalculateVerificationStatus(document.coachId, client);
    return document;
  });
}
