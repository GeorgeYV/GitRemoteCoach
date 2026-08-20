import { transcriptionConfig } from '../config.js';

export function isTranscriptionConfigured(): boolean {
  return !!transcriptionConfig.apiKey;
}

type TranscribeFn = (audioUrl: string) => Promise<string>;

let testImpl: TranscribeFn | null = null;

/** Solo para pruebas: reemplaza la implementación real (ej. por un fake sin red) — mismo patrón
 * que setStripeClientForTesting/setR2ClientForTesting. `null` restaura la real. */
export function setTranscribeAudioForTesting(fn: TranscribeFn | null): void {
  testImpl = fn;
}

/** La API de Whisper no acepta una URL — hay que bajarle los bytes del audio y subírselos. El
 * archivo ya está en R2 (voice_notes.audio_url es público), así que un simple fetch alcanza. */
async function transcribeWithWhisper(audioUrl: string): Promise<string> {
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) throw new Error(`No se pudo descargar el audio de R2 (${audioRes.status})`);
  const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer]), 'audio.m4a');
  formData.append('model', 'whisper-1');
  // Las notas de voz son siempre de entrenadores hispanohablantes (ver lib/matchReportNarratives.ts,
  // todo el resto de la app está en español) — fijar el idioma evita que Whisper adivine mal con
  // clips cortos o ruidosos.
  formData.append('language', 'es');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${transcriptionConfig.apiKey}` },
    body: formData,
  });
  if (!res.ok) throw new Error(`Whisper API respondió ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { text: string };
  return json.text.trim();
}

/** jobs/transcribeVoiceNotes.ts: transcribe un clip ya subido a R2. Nunca se llama sin antes
 * chequear isTranscriptionConfigured(). */
export async function transcribeAudio(audioUrl: string): Promise<string> {
  return (testImpl ?? transcribeWithWhisper)(audioUrl);
}
