import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApiError, CountryCode, requestTournamentCreation } from '../../lib/api';
import { COUNTRY_LABELS, COUNTRY_OPTIONS } from '../../mock/coachFlow';
import { colors, radius, withOpacity } from '../../lib/theme';
import IconTextInput from './IconTextInput';

/**
 * "Solicitar que agreguen este torneo" (decisión #55) — usado desde ParentHomeScreen y
 * CoachTournamentSearchScreen cuando la búsqueda da 0 resultados. A diferencia de
 * ReportTournamentModal (que avisa sobre un torneo que YA existe), acá el torneo todavía no
 * existe: le llega directo a platform_admin, no hay club/federación identificado todavía.
 */
export default function RequestTournamentModal({
  visible,
  initialName,
  defaultCountry,
  authToken,
  onClose,
}: {
  visible: boolean;
  /** Precarga con lo que el padre/entrenador ya había escrito en el buscador. */
  initialName?: string;
  defaultCountry?: CountryCode | null;
  authToken: string;
  onClose: () => void;
}) {
  const [tournamentName, setTournamentName] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState<CountryCode | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Se precarga cada vez que se abre (no solo al montar) — el modal queda montado entre una
  // apertura y la siguiente, mismo criterio que EditPaymentAccountModal.
  useEffect(() => {
    if (!visible) return;
    setTournamentName(initialName?.trim() ?? '');
    setCity('');
    setCountry(defaultCountry ?? null);
    setNote('');
    setError(null);
    setSent(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function handleClose() {
    // Reset diferido al próximo open, no acá — así el mensaje de éxito no parpadea a blanco
    // mientras el modal todavía está cerrándose (animationType="fade").
    onClose();
  }

  const canSubmit = tournamentName.trim().length > 0 && city.trim().length > 0 && !!country && !submitting;

  async function handleSubmit() {
    if (!canSubmit || !country) return;
    setSubmitting(true);
    setError(null);
    try {
      await requestTournamentCreation(authToken, {
        tournamentName: tournamentName.trim(),
        city: city.trim(),
        country,
        note: note.trim() || undefined,
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar la solicitud. Intenta de nuevo.');
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
              <Text style={styles.subtitle}>Le llegó a nuestro equipo — lo revisamos y lo agregamos si corresponde.</Text>
              <Pressable style={styles.primaryButton} onPress={handleClose}>
                <Text style={styles.primaryButtonLabel}>Listo</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={styles.titleRow}>
                <Text style={styles.title}>Solicitar torneo</Text>
                <Pressable onPress={handleClose} hitSlop={8}>
                  <Text style={styles.closeLabel}>Cerrar</Text>
                </Pressable>
              </View>
              <Text style={styles.subtitle}>¿No encontraste el torneo que buscabas? Contanos cuál y lo revisamos.</Text>

              <IconTextInput
                icon="trophy-outline"
                placeholder="Nombre del torneo"
                value={tournamentName}
                onChangeText={setTournamentName}
              />
              <IconTextInput icon="business-outline" placeholder="Ciudad" value={city} onChangeText={setCity} />

              <Text style={styles.fieldLabel}>País</Text>
              <View style={styles.countryRow}>
                {COUNTRY_OPTIONS.map((option) => {
                  const active = country === option;
                  return (
                    <Pressable
                      key={option}
                      onPress={() => setCountry(option)}
                      style={[styles.countryChip, active && styles.countryChipActive]}
                    >
                      <Text style={[styles.countryChipLabel, active && styles.countryChipLabelActive]}>
                        {COUNTRY_LABELS[option]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <IconTextInput
                icon="chatbubble-ellipses-outline"
                style={styles.noteInput}
                placeholder="Nota opcional — fechas aproximadas, quién lo organiza…"
                value={note}
                onChangeText={setNote}
                multiline
              />

              {error && <Text style={styles.errorText}>{error}</Text>}
              <Pressable
                style={[styles.primaryButton, !canSubmit && styles.primaryButtonDisabled]}
                onPress={handleSubmit}
                disabled={!canSubmit}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.courtBlueDeep} />
                ) : (
                  <Text style={styles.primaryButtonLabel}>Enviar solicitud</Text>
                )}
              </Pressable>
            </ScrollView>
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
    maxHeight: '85%',
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
    lineHeight: 17,
  },
  fieldLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
  },
  countryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  countryChip: {
    backgroundColor: colors.panel,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  countryChipActive: {
    backgroundColor: withOpacity(colors.ballLime, 0.16),
    borderColor: colors.ballLime,
  },
  countryChipLabel: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
  },
  countryChipLabelActive: {
    color: colors.courtBlue,
  },
  noteInput: {
    minHeight: 70,
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
