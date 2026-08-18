import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import IconTextInput from '../../components/shared/IconTextInput';
import { useAuth } from '../../context/AuthContext';
import { ApiError, Club, CountryCode, registerClub, updateClub } from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';
import { isValidEmail } from '../../lib/validation';
import { COUNTRY_LABELS, COUNTRY_OPTIONS } from '../../mock/coachFlow';

const TYPE_OPTIONS: { value: 'club' | 'federation'; label: string }[] = [
  { value: 'club', label: 'Club' },
  { value: 'federation', label: 'Federación' },
];

export default function ClubRegistrationScreen({
  club,
  onSuccess,
  onBack,
}: {
  /** Si viene seteado, la pantalla edita este club (PUT) en vez de crear uno nuevo (POST). */
  club?: Club;
  onSuccess?: (club: Club) => void;
  onBack?: () => void;
}) {
  const { token } = useAuth();
  const [name, setName] = useState(club?.name ?? '');
  const [type, setType] = useState<'club' | 'federation' | null>(club?.type ?? null);
  const [city, setCity] = useState(club?.city ?? '');
  const [country, setCountry] = useState<CountryCode | null>(club?.country ?? null);
  const [contactEmail, setContactEmail] = useState(club?.contactEmail ?? '');
  const [contactPhone, setContactPhone] = useState(club?.contactPhone ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    name.trim().length > 0 && type !== null && city.trim().length > 0 && !!country && !submitting;

  async function handleSubmit() {
    if (!token || !type || !country) {
      setError('No hay una sesión activa.');
      return;
    }
    if (contactEmail.trim() && !isValidEmail(contactEmail.trim())) {
      setError('Correo de contacto inválido.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const params = {
      name: name.trim(),
      type,
      city: city.trim(),
      country,
      contactEmail: contactEmail.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
    };
    try {
      const result = club ? await updateClub(token, club.id, params) : await registerClub(token, params);
      onSuccess?.(result);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : `No se pudo ${club ? 'guardar los cambios' : 'registrar tu club'}. Intenta de nuevo.`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        {club && onBack && (
          <Pressable style={styles.backButton} onPress={onBack}>
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
        )}
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{club ? 'Editar club' : 'Registra tu club'}</Text>
          <Text style={styles.headerSubtitle}>
            {club
              ? 'Actualiza los datos de tu club o federación.'
              : 'Crea el perfil de tu club o federación para invitar entrenadores y organizar torneos.'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>Tipo</Text>
        <View style={styles.typeRow}>
          {TYPE_OPTIONS.map((opt) => {
            const active = type === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => setType(opt.value)}
                style={[styles.typeChip, active && styles.typeChipActive]}
              >
                <Text style={[styles.typeChipLabel, active && styles.typeChipLabelActive]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <IconTextInput icon="business-outline" placeholder="Nombre del club o federación" value={name} onChangeText={setName} />
        <IconTextInput icon="location-outline" placeholder="Ciudad" value={city} onChangeText={setCity} />

        <Text style={styles.sectionLabel}>País</Text>
        <View style={styles.typeRow}>
          {COUNTRY_OPTIONS.map((option) => {
            const active = country === option;
            return (
              <Pressable
                key={option}
                onPress={() => setCountry(option)}
                style={[styles.typeChip, active && styles.typeChipActive]}
              >
                <Text style={[styles.typeChipLabel, active && styles.typeChipLabelActive]}>
                  {COUNTRY_LABELS[option]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <IconTextInput
          icon="mail-outline"
          placeholder="Correo de contacto (opcional)"
          value={contactEmail}
          onChangeText={setContactEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <IconTextInput
          icon="call-outline"
          placeholder="Teléfono de contacto (opcional)"
          value={contactPhone}
          onChangeText={setContactPhone}
          keyboardType="phone-pad"
        />

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
              <Ionicons name={club ? 'checkmark-outline' : 'business-outline'} size={18} color={colors.courtBlueDeep} />
              <Text style={styles.submitLabel}>{club ? 'Guardar cambios' : 'Crear club'}</Text>
            </View>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
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
  sectionLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  typeChip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  typeChipActive: {
    backgroundColor: colors.ballLime,
  },
  typeChipLabel: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
  },
  typeChipLabelActive: {
    color: colors.courtBlueDeep,
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
    marginTop: 8,
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
