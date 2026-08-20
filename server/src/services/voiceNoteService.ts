import { AppError, ValidationError } from '../lib/errors.js';
import { deleteObject, isR2Configured, keyFromPublicUrl, uploadObject } from '../lib/r2.js';
import * as voiceNoteRepository from '../repositories/voiceNoteRepository.js';
import type { VoiceNote } from '../types.js';

const ALLOWED_AUDIO_MIME_TYPES: Record<string, string> = {
  'audio/m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/webm': 'webm',
};
/** Generoso para un clip de voz de unos pocos minutos a 128kbps — no es una foto de perfil. */
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

export interface VoiceNoteFields {
  sequenceNumber: number;
  durationMs: number;
  scoreLabel: string;
  setIndex: number;
  gameIndex: number;
  isTiebreak: boolean;
}

/** LiveCaptureView: nota de voz grabada durante la captura — misma key determinística por
 * (match, secuencia) que la foto de perfil del coach usa por coach, así un reintento de subida
 * (mismo sequenceNumber) sobreescribe en vez de acumular huérfanos. */
export async function addVoiceNote(
  matchId: string,
  buffer: Buffer,
  mimeType: string,
  fields: VoiceNoteFields,
): Promise<VoiceNote> {
  if (!isR2Configured()) {
    throw new AppError(
      'La subida de notas de voz todavía no está configurada en el servidor.',
      503,
      'voice_note_upload_unavailable',
    );
  }
  const ext = ALLOWED_AUDIO_MIME_TYPES[mimeType];
  if (!ext) throw new ValidationError('Formato de audio no soportado');
  if (buffer.byteLength > MAX_AUDIO_BYTES) throw new ValidationError('La nota de voz no puede pesar más de 15MB');

  const audioUrl = await uploadObject(`voice-notes/${matchId}/${fields.sequenceNumber}.${ext}`, buffer, mimeType);
  return voiceNoteRepository.create(matchId, { ...fields, audioUrl });
}

/** LiveCaptureView: borrar una nota de voz. Borra también su audio en R2 (best-effort — si R2
 * falla, la nota igual queda borrada en la base; no vale la pena bloquear al entrenador por un
 * archivo huérfano, ver decisión #39). No es un error si la nota nunca llegó a sincronizarse. */
export async function deleteVoiceNote(matchId: string, sequenceNumber: number): Promise<void> {
  const deleted = await voiceNoteRepository.deleteBySequence(matchId, sequenceNumber);
  if (deleted?.audioUrl) await deleteAudioObjects([deleted.audioUrl]);
}

/** "Nuevo partido": limpia en R2 todo lo que voiceNoteRepository.deleteAllForMatch acaba de
 * borrar en la base. Fuera de cualquier transacción a propósito (ver esa función) y best-effort —
 * un R2 caído no debe impedir reiniciar el partido. */
export async function deleteAudioObjects(audioUrls: string[]): Promise<void> {
  if (!isR2Configured()) return;
  for (const url of audioUrls) {
    await deleteObject(keyFromPublicUrl(url)).catch((err) => {
      console.error(`No se pudo borrar el audio de R2 (${url}):`, err);
    });
  }
}
