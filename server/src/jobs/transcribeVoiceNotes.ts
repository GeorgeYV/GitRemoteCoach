import { isTranscriptionConfigured, transcribeAudio } from '../lib/transcription.js';
import * as voiceNoteRepository from '../repositories/voiceNoteRepository.js';
import * as voiceNoteService from '../services/voiceNoteService.js';

/** Cuántas veces reintentar una transcripción antes de darse por vencido — ver decisión #39 en
 * db/schema.sql. Un número chico a propósito: un audio corto que falla 3 veces seguidas casi
 * seguro tiene un problema real (formato corrupto, silencio, proveedor caído para ese archivo
 * puntual), no mala suerte pasajera que un 4to intento fuera a resolver. */
export const MAX_TRANSCRIPTION_ATTEMPTS = 3;

const BATCH_SIZE = 20;

export interface TranscribeVoiceNotesResult {
  completedIds: string[];
  /** Falló pero todavía le quedan reintentos — sigue 'pending' para el próximo corrido. */
  retriedIds: string[];
  /** Agotó MAX_TRANSCRIPTION_ATTEMPTS — pasó a 'failed', ya no se vuelve a intentar. */
  failedIds: string[];
  skipped: boolean;
}

/**
 * Job periódico (ej. cada 5-10 min, ver jobs:transcribe-voice-notes en package.json): toma notas
 * de voz 'pending' en lote y las transcribe una por una — nunca dentro del enqueue en tiempo real
 * de MatchContext.tsx, que comparte la misma cadena de promesas que la sincronización de puntos
 * (ver decisión clave del plan de reporte enriquecido: un round-trip lento al proveedor de voz no
 * debe bloquear la captura en vivo).
 */
export async function runTranscribeVoiceNotesJob(): Promise<TranscribeVoiceNotesResult> {
  if (!isTranscriptionConfigured()) {
    return { completedIds: [], retriedIds: [], failedIds: [], skipped: true };
  }

  const notes = await voiceNoteRepository.listPendingTranscription(BATCH_SIZE);
  const completedIds: string[] = [];
  const retriedIds: string[] = [];
  const failedIds: string[] = [];

  for (const note of notes) {
    // No debería pasar (toda nota 'pending' debería tener audio) — defensivo, no hay nada que
    // transcribir sin el archivo.
    if (!note.audioUrl) continue;

    try {
      const transcript = await transcribeAudio(note.audioUrl);
      await voiceNoteRepository.markTranscriptionCompleted(note.id, transcript);
      await voiceNoteService.deleteAudioObjects([note.audioUrl]);
      completedIds.push(note.id);
    } catch (err) {
      console.error(`No se pudo transcribir la nota de voz ${note.id}:`, err);
      const attempts = await voiceNoteRepository.incrementTranscriptionAttempts(note.id);
      if (attempts >= MAX_TRANSCRIPTION_ATTEMPTS) {
        await voiceNoteRepository.markTranscriptionFailed(note.id);
        await voiceNoteService.deleteAudioObjects([note.audioUrl]);
        failedIds.push(note.id);
      } else {
        retriedIds.push(note.id);
      }
    }
  }

  return { completedIds, retriedIds, failedIds, skipped: false };
}
