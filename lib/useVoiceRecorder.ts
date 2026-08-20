import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';

/** Lo que el hook conoce del clip recién grabado — no sabe nada de marcador/puntaje, eso lo
 * agrega quien lo llama (VoiceNoteRecorder, MatchSummaryView) antes de armar el VoiceNote completo. */
export interface RecordedClip {
  uri: string;
  durationMs: number;
}

/** Debajo de esto se descarta la grabación — protege contra un tap accidental en vez de un
 * "mantén presionado" real. */
const MIN_DURATION_MS = 700;

const RECORDER_OPTIONS = { ...RecordingPresets.HIGH_QUALITY, directory: 'document' as const };

/** Extensión/mimetype real que produce RECORDER_OPTIONS (RecordingPresets.HIGH_QUALITY: .m4a en
 * nativo vía MPEG4/AAC, .webm en web vía MediaRecorder) — quien sube el clip (lib/api.ts#
 * uploadVoiceNote) lo necesita para armar el FormData sin adivinar a partir del uri. */
export function getRecordingFileInfo(): { name: string; type: string } {
  return Platform.OS === 'web' ? { name: 'voice-note.webm', type: 'audio/webm' } : { name: 'voice-note.m4a', type: 'audio/m4a' };
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Hold-to-record: mantén presionado un Pressable para grabar, suelta para guardar el clip.
 * Compartido entre la nota de voz de captura en vivo y el dictado de observaciones — misma
 * mecánica de grabación, solo cambia dónde termina el clip. */
export function useVoiceRecorder(onRecorded: (clip: RecordedClip) => void) {
  const recorder = useAudioRecorder(RECORDER_OPTIONS);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const startingRef = useRef<Promise<void> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  async function beginRecording() {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert('Permiso denegado', 'Activa el acceso al micrófono para grabar notas de voz.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startTimeRef.current = Date.now();
      setElapsedMs(0);
      tickRef.current = setInterval(() => {
        setElapsedMs(Date.now() - (startTimeRef.current ?? Date.now()));
      }, 200);
    } catch {
      // getUserMedia (web) y las APIs nativas de permisos pueden rechazar la promesa en vez de
      // resolver { granted: false } — sin este catch el coach se queda sin feedback alguno.
      Alert.alert('No se pudo grabar', 'Revisa el permiso de micrófono e intenta de nuevo.');
    }
  }

  function handlePressIn() {
    setIsRecording(true);
    startingRef.current = beginRecording().catch(() => {
      startTimeRef.current = null;
      setIsRecording(false);
    });
  }

  async function handlePressOut() {
    if (startingRef.current) await startingRef.current;
    startingRef.current = null;
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setIsRecording(false);
    // startTimeRef null means beginRecording never actually started the recorder (permiso
    // denegado o falló antes de record()) — no hay nada que detener.
    if (!startTimeRef.current) return;
    const durationMs = Date.now() - startTimeRef.current;
    startTimeRef.current = null;
    await recorder.stop();
    const uri = recorder.uri;
    if (durationMs >= MIN_DURATION_MS && uri) {
      onRecorded({ uri, durationMs });
    }
  }

  // react-native-web (0.21) implementa Pressable.onPressIn/onPressOut sobre el "Responder
  // System" clásico de React, que no funciona con React 19 (el click normal sí, por eso onPress
  // en otros botones anda bien) — en la práctica, onPressIn/onPressOut nunca disparan en web.
  // Ahí usamos pointerdown/pointerup nativos con pointer capture en su lugar; en nativo (el
  // target real) se usan onPressIn/onPressOut de RN, que sí funcionan.
  const webPressHandlers: Record<string, (event: any) => void> =
    Platform.OS === 'web'
      ? {
          onPointerDown: (event) => {
            // El navegador puede rechazar la captura (id de puntero ya no activo, etc.) — sin
            // este try/catch esa excepción aborta el handler antes de llegar a handlePressIn.
            try {
              event.currentTarget?.setPointerCapture?.(event.pointerId);
            } catch {
              // no-op: seguimos igual, solo perdemos la garantía de que el pointerup llegue acá.
            }
            handlePressIn();
          },
          onPointerUp: (event) => {
            try {
              event.currentTarget?.releasePointerCapture?.(event.pointerId);
            } catch {
              // no-op
            }
            handlePressOut();
          },
          onPointerCancel: () => handlePressOut(),
        }
      : {};

  const pressHandlers = { onPressIn: handlePressIn, onPressOut: handlePressOut, ...webPressHandlers };

  return { isRecording, elapsedMs, pressHandlers };
}
