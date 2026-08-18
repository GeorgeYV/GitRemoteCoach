import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import IconTextInput from '../../components/shared/IconTextInput';
import { useAuth } from '../../context/AuthContext';
import { AgeCategory, ApiError, CountryCode, Player, registerPlayer, updatePlayer } from '../../lib/api';
import { isValidDateString } from '../../lib/dateSlots';
import { colors, radius, withOpacity } from '../../lib/theme';
import { AGE_CATEGORY_OPTIONS, COUNTRY_LABELS, COUNTRY_OPTIONS } from '../../mock/coachFlow';

export default function PlayerRegistrationScreen({
  player,
  onSubmit,
  onBack,
}: {
  /** Si viene seteado, la pantalla edita este jugador (PUT) en vez de crear uno nuevo (POST). */
  player?: Player;
  onSubmit: (player: Player) => void;
  onBack?: () => void;
}) {
  const { token } = useAuth();
  const [fullName, setFullName] = useState(player?.fullName ?? '');
  const [birthDate, setBirthDate] = useState(player?.birthDate ?? '');
  const [ageCategory, setAgeCategory] = useState<string | null>(player?.ageCategory ?? null);
  const [country, setCountry] = useState<CountryCode | null>(player?.country ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!token) {
      setError('No hay una sesión activa.');
      return;
    }
    if (!ageCategory || !country) return;
    if (!isValidDateString(birthDate.trim())) {
      setError('Fecha de nacimiento inválida. Usa el formato AAAA-MM-DD (ej. 2015-03-15).');
      return;
    }
    setSubmitting(true);
    setError(null);
    const params = {
      fullName: fullName.trim(),
      birthDate: birthDate.trim(),
      ageCategory: ageCategory as AgeCategory,
      country,
    };
    try {
      const result = player ? await updatePlayer(token, player.id, params) : await registerPlayer(token, params);
      onSubmit(result);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : `No se pudo ${player ? 'guardar los cambios' : 'registrar a tu hijo/a'}. Intenta de nuevo.`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    fullName.trim().length > 0 && birthDate.trim().length > 0 && !!ageCategory && !!country && !submitting;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        {onBack && (
          <Pressable style={styles.backButton} onPress={onBack}>
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
        )}
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{player ? 'Editar jugador' : 'Registra a tu hijo/a'}</Text>
          <Text style={styles.headerSubtitle}>
            {player
              ? 'Actualiza los datos de tu hijo/a.'
              : 'Lo necesitamos para poder reservar sesiones a su nombre con los entrenadores.'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Section label="Datos del jugador">
          <IconTextInput icon="person-outline" placeholder="Nombre completo" value={fullName} onChangeText={setFullName} />
          <IconTextInput
            icon="calendar-outline"
            placeholder="Fecha de nacimiento (AAAA-MM-DD)"
            value={birthDate}
            onChangeText={setBirthDate}
          />
        </Section>

        <Section label="Categoría de edad">
          <View style={styles.chipRow}>
            {AGE_CATEGORY_OPTIONS.map((option) => {
              const active = ageCategory === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => setAgeCategory(option)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{option}</Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section label="País donde juega">
          <View style={styles.chipRow}>
            {COUNTRY_OPTIONS.map((option) => {
              const active = country === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => setCountry(option)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{COUNTRY_LABELS[option]}</Text>
                </Pressable>
              );
            })}
          </View>
        </Section>
      </ScrollView>

      <View style={styles.footer}>
        {error && <Text style={styles.errorText}>{error}</Text>}
        <Pressable
          style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
          disabled={!canSubmit}
          onPress={handleSubmit}
        >
          {submitting ? (
            <ActivityIndicator color={colors.courtBlueDeep} />
          ) : (
            <View style={styles.submitContent}>
              <Text style={styles.submitLabel}>{player ? 'Guardar cambios' : 'Continuar'}</Text>
              <Ionicons name={player ? 'checkmark-outline' : 'arrow-forward-outline'} size={18} color={colors.courtBlueDeep} />
            </View>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  backButton: {
    paddingRight: 12,
    paddingTop: 2,
  },
  backIcon: {
    color: colors.lineWhite,
    fontSize: 20,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    color: colors.lineWhite,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 6,
  },
  headerSubtitle: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  chipActive: {
    backgroundColor: colors.ballLime,
  },
  chipLabel: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
  },
  chipLabelActive: {
    color: colors.courtBlueDeep,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.panel,
    padding: 16,
  },
  errorText: {
    color: colors.errorCoral,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
  },
  submitButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: withOpacity(colors.ballLime, 0.3),
  },
  submitContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitLabel: {
    color: colors.courtBlueDeep,
    fontSize: 15,
    fontWeight: '800',
  },
});
