import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DatePickerField from '../../components/shared/DatePickerField';
import IconTextInput from '../../components/shared/IconTextInput';
import { useAuth } from '../../context/AuthContext';
import { ApiError, CountryCode, createUnclaimedTournament } from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';
import { COUNTRY_LABELS, COUNTRY_OPTIONS } from '../../mock/coachFlow';

/** Siembra un torneo sin club para que cualquier club de ese país lo pueda reclamar después
 * (ClubTournamentListScreen, sección "Torneos disponibles para reclamar" — ver decisión #36 en
 * db/schema.sql). No queda ligado a ningún club_admin; solo platform_admin puede crearlos. */
export default function PlatformAdminTournamentScreen() {
  const { token } = useAuth();
  const [name, setName] = useState('');
  const [venue, setVenue] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState<CountryCode | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canSubmit =
    name.trim().length > 0 &&
    venue.trim().length > 0 &&
    city.trim().length > 0 &&
    !!country &&
    startDate.trim().length > 0 &&
    endDate.trim().length > 0 &&
    !submitting;

  async function handleSubmit() {
    if (!canSubmit || !country) return;
    if (!token) {
      setError('No hay una sesión activa.');
      return;
    }
    // El picker ya no deja elegir un fin anterior al inicio (minDate={startDate}), pero se
    // mantiene como respaldo por si startDate cambia después de haber elegido endDate.
    if (endDate < startDate) {
      setError('La fecha de fin no puede ser anterior a la de inicio.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const tournament = await createUnclaimedTournament(token, {
        name: name.trim(),
        venue: venue.trim(),
        city: city.trim(),
        country,
        startDate,
        endDate,
      });
      setSuccessMessage(`"${tournament.name}" creado — visible para clubes de ${COUNTRY_LABELS[country]} para reclamar.`);
      setName('');
      setVenue('');
      setCity('');
      setStartDate('');
      setEndDate('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el torneo. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Crear torneo sin club</Text>
        <Text style={styles.headerSubtitle}>
          Para torneos con demanda conocida que ningún club creó todavía — cualquier club de ese país podrá reclamarlo después.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {successMessage && <Text style={styles.successText}>{successMessage}</Text>}

        <Section label="Datos del torneo">
          <IconTextInput icon="trophy-outline" placeholder="Nombre del torneo" value={name} onChangeText={setName} />
          <IconTextInput icon="location-outline" placeholder="Sede" value={venue} onChangeText={setVenue} />
          <IconTextInput icon="business-outline" placeholder="Ciudad" value={city} onChangeText={setCity} />
        </Section>

        <Section label="País">
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
        </Section>

        <Section label="Fechas">
          <DatePickerField
            icon="calendar-outline"
            placeholder="Fecha de inicio"
            value={startDate}
            onChange={(iso) => {
              setStartDate(iso);
              if (endDate && endDate < iso) setEndDate('');
            }}
          />
          <DatePickerField
            icon="calendar-outline"
            placeholder="Fecha de fin"
            value={endDate}
            onChange={setEndDate}
            minDate={startDate || undefined}
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  headerTitle: {
    color: colors.lineWhite,
    fontSize: 20,
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
  successText: {
    color: colors.ballLime,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 16,
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
  countryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  countryChip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  countryChipActive: {
    backgroundColor: colors.ballLime,
  },
  countryChipLabel: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
  },
  countryChipLabelActive: {
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
