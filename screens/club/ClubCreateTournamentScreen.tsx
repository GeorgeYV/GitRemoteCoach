import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import IconTextInput from '../../components/shared/IconTextInput';
import { useAuth } from '../../context/AuthContext';
import { ApiError, createTournament, TournamentSummary } from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';

export default function ClubCreateTournamentScreen({
  clubId,
  onBack,
  onCreated,
}: {
  clubId: string;
  onBack: () => void;
  onCreated: (tournament: TournamentSummary) => void;
}) {
  const { token } = useAuth();
  const [name, setName] = useState('');
  const [venue, setVenue] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    name.trim().length > 0 && venue.trim().length > 0 && startDate.trim().length > 0 && endDate.trim().length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    if (!token) {
      setError('No hay una sesión activa.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const tournament = await createTournament(token, clubId, {
        name: name.trim(),
        venue: venue.trim(),
        startDate: startDate.trim(),
        endDate: endDate.trim(),
      });
      onCreated(tournament);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el torneo. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Crear torneo</Text>
          <Text style={styles.headerSubtitle}>Regístralo para poder invitar entrenadores oficiales y liquidar comisiones.</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Section label="Datos del torneo">
          <IconTextInput icon="trophy-outline" placeholder="Nombre del torneo" value={name} onChangeText={setName} />
          <IconTextInput icon="location-outline" placeholder="Sede" value={venue} onChangeText={setVenue} />
        </Section>

        <Section label="Fechas">
          <IconTextInput
            icon="calendar-outline"
            placeholder="Fecha de inicio (AAAA-MM-DD)"
            value={startDate}
            onChangeText={setStartDate}
          />
          <IconTextInput
            icon="calendar-outline"
            placeholder="Fecha de fin (AAAA-MM-DD)"
            value={endDate}
            onChangeText={setEndDate}
          />
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
              <Ionicons name="add-circle-outline" size={18} color={colors.courtBlueDeep} />
              <Text style={styles.submitLabel}>Crear torneo</Text>
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
