import { Ionicons } from '@expo/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from 'expo-audio';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMatch } from '../context/MatchContext';
import { colors, radius, withOpacity } from '../lib/theme';
import { VoiceNote } from '../lib/types';

/** Debajo de esto se descarta la grabación — protege contra un tap accidental en vez de un
 * "mantené presionado" real. */
const MIN_DURATION_MS = 700;

const RECORDER_OPTIONS = { ...RecordingPresets.HIGH_QUALITY, directory: 'document' as const };

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function VoiceNoteRecorder({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { reducerState, addVoiceNote, deleteVoiceNote } = useMatch();
  const recorder = useAudioRecorder(RECORDER_OPTIONS);
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const startingRef = useRef<Promise<void> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (playerStatus.didJustFinish) setPlayingId(null);
  }, [playerStatus.didJustFinish]);

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  async function beginRecording() {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert('Permiso denegado', 'Activá el acceso al micrófono para grabar notas de voz.');
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
      Alert.alert('No se pudo grabar', 'Revisá el permiso de micrófono e intentá de nuevo.');
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
      addVoiceNote({ uri, durationMs });
    }
  }

  // react-native-web (0.21) implementa Pressable.onPressIn/onPressOut sobre el "Responder
  // System" clásico de React, que no funciona con React 19 (el click normal sí, por eso
  // "onPress" en otros botones anda bien) — en la práctica, onPressIn/onPressOut nunca disparan
  // en web. Ahí usamos pointerdown/pointerup nativos con pointer capture en su lugar; en nativo
  // (el target real) se usan onPressIn/onPressOut de RN, que sí funcionan.
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

  function togglePlay(note: VoiceNote) {
    if (playingId === note.id) {
      player.pause();
      setPlayingId(null);
      return;
    }
    player.replace(note.uri);
    player.play();
    setPlayingId(note.id);
  }

  function handleDelete(note: VoiceNote) {
    if (playingId === note.id) {
      player.pause();
      setPlayingId(null);
    }
    deleteVoiceNote(note.id);
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Pressable
          style={[styles.voiceButton, isRecording && styles.voiceButtonActive]}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          {...(webPressHandlers as object)}
        >
          <View style={[styles.recordDot, isRecording && styles.recordDotActive]} />
          <Text style={[styles.voiceLabel, isRecording && styles.voiceLabelActive]}>
            {isRecording ? `Grabando… ${formatDuration(elapsedMs)}` : 'Mantené presionado para nota de voz'}
          </Text>
        </Pressable>
        <Pressable style={styles.sosButton} onPress={onOpenMenu}>
          <Text style={styles.sosLabel}>SOS</Text>
        </Pressable>
      </View>

      {reducerState.voiceNotes.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.notesRow}>
          {reducerState.voiceNotes.map((note) => (
            <View key={note.id} style={styles.noteChip}>
              <Pressable style={styles.notePlayButton} onPress={() => togglePlay(note)} hitSlop={6}>
                <Ionicons
                  name={playingId === note.id ? 'pause' : 'play'}
                  size={13}
                  color={colors.courtBlueDeep}
                />
              </Pressable>
              <Text style={styles.noteDuration}>{formatDuration(note.durationMs)}</Text>
              <Pressable onPress={() => handleDelete(note)} hitSlop={6}>
                <Ionicons name="close" size={13} color={colors.textDim} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  voiceButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  voiceButtonActive: {
    backgroundColor: withOpacity(colors.errorCoral, 0.1),
    borderColor: colors.errorCoral,
  },
  recordDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textDim,
  },
  recordDotActive: {
    backgroundColor: colors.errorCoral,
  },
  voiceLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textDim,
  },
  voiceLabelActive: {
    color: colors.errorCoralDeep,
  },
  sosButton: {
    width: 64,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.errorCoral,
  },
  notesRow: {
    flexGrow: 0,
  },
  noteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 8,
  },
  notePlayButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.ballLime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteDuration: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSoft,
  },
});
