import { withTransaction } from '../lib/db.js';
import * as coachRepository from '../repositories/coachRepository.js';
import * as coachVerificationDocumentRepository from '../repositories/coachVerificationDocumentRepository.js';
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

export async function searchCoaches(params: {
  query?: string;
  excludeTournamentId?: string;
}): Promise<CoachSearchResult[]> {
  return coachRepository.search(params);
}

export async function getCoachProfile(coachId: string): Promise<CoachProfileWithTraining> {
  const [profile, ageCategories, levels] = await Promise.all([
    coachRepository.getCoachProfile(coachId),
    coachRepository.getCoachAgeCategories(coachId),
    coachRepository.getCoachLevels(coachId),
  ]);
  return { profile, ageCategories, levels };
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
  return withTransaction(async (client) => {
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
