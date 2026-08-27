import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError, reportTournament } from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';
import IconTextInput from './IconTextInput';

/** "Reportar un posible error" (decisión #46) — usado desde ParentHomeScreen y
 * CoachTournamentSearchScreen sobre cualquier torneo de la lista. No modifica el torneo: solo
 * avisa al club/federación que lo creó (y queda de respaldo para platform_admin). */
export default function ReportTournamentModal({
  visible,
  tournamentId,
  tournamentName,
  authToken,
  onClose,
}: {
  visible: boolean;
  tournamentId: string | null;
  tournamentName: string;
  authToken: string;
  onClose: () => void;
}) {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function handleClose() {
    // Reset diferido al próximo open, no acá — así el mensaje de éxito no parpadea a blanco
    // mientras el modal todavía está cerrándose (animationType="fade").
    onClose();
    setTimeout(() => {
      setMessage('');
      setError(null);
      setSent(false);
    }, 300);
  }

  async function handleSubmit() {
    if (!tournamentId || message.trim().length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await reportTournament(authToken, tournamentId, message.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar el reporte. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {sent ? (
            <View style={styles.successWrap}>
              <Ionicons name="checkmark-circle" size={36} color={colors.ballLime} />
              <Text style={styles.title}>¡Gracias por avisar!</Text>
              <Text style={styles.subtitle}>Le llegó al club o federación que organiza este torneo.</Text>
              <Pressable style={styles.primaryButton} onPress={handleClose}>
                <Text style={styles.primaryButtonLabel}>Listo</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.titleRow}>
                <Text style={styles.title}>Reportar un posible error</Text>
                <Pressable onPress={handleClose} hitSlop={8}>
                  <Text style={styles.closeLabel}>Cerrar</Text>
                </Pressable>
              </View>
              <Text style={styles.subtitle}>{tournamentName}</Text>
              <IconTextInput
                icon="alert-circle-outline"
                style={styles.messageInput}
                placeholder="¿Qué dato te parece que está mal? (fecha, ciudad, sede…)"
                value={message}
                onChangeText={setMessage}
                multiline
              />
              {error && <Text style={styles.errorText}>{error}</Text>}
              <Pressable
                style={[
                  styles.primaryButton,
                  (submitting || message.trim().length === 0) && styles.primaryButtonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={submitting || message.trim().length === 0}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.courtBlueDeep} />
                ) : (
                  <Text style={styles.primaryButtonLabel}>Enviar reporte</Text>
                )}
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(14,32,56,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.panelLight,
    borderTopLeftRadius: radius,
    borderTopRightRadius: radius,
    padding: 20,
    paddingBottom: 32,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.lineWhite,
  },
  closeLabel: {
    fontSize: 13,
    color: colors.courtBlue,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    color: colors.textDim,
    marginTop: 4,
    marginBottom: 16,
  },
  messageInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  errorText: {
    color: colors.errorCoral,
    fontSize: 12,
    marginTop: 10,
  },
  primaryButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  primaryButtonDisabled: {
    backgroundColor: withOpacity(colors.ballLime, 0.3),
  },
  primaryButtonLabel: {
    color: colors.courtBlueDeep,
    fontSize: 14,
    fontWeight: '800',
  },
  successWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
});
