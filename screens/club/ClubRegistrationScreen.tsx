import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import IconTextInput from '../../components/shared/IconTextInput';
import { useAuth } from '../../context/AuthContext';
import { ApiError, Club, registerClub } from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';

const TYPE_OPTIONS: { value: 'club' | 'federation'; label: string }[] = [
  { value: 'club', label: 'Club' },
  { value: 'federation', label: 'Federación' },
];

export default function ClubRegistrationScreen({ onSuccess }: { onSuccess?: (club: Club) => void }) {
  const { token } = useAuth();
  const [name, setName] = useState('');
  const [type, setType] = useState<'club' | 'federation' | null>(null);
  const [city, setCity] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && type !== null && city.trim().length > 0 && !submitting;

  async function handleSubmit() {
    if (!token || !type) {
      setError('No hay una sesión activa.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const club = await registerClub(token, {
        name: name.trim(),
        type,
        city: city.trim(),
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
      });
      onSuccess?.(club);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo registrar tu club. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Registra tu club</Text>
        <Text style={styles.headerSubtitle}>
          Crea el perfil de tu club o federación para invitar entrenadores y organizar torneos.
        </Text>
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
              <Ionicons name="business-outline" size={18} color={colors.courtBlueDeep} />
              <Text style={styles.submitLabel}>Crear club</Text>
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
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
