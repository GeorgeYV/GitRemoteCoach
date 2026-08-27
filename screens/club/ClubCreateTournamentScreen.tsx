import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DatePickerField from '../../components/shared/DatePickerField';
import IconTextInput from '../../components/shared/IconTextInput';
import { useAuth } from '../../context/AuthContext';
import { AgeCategory, ApiError, createTournament, TournamentSummary, updateTournament } from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';
import { AGE_CATEGORY_OPTIONS } from '../../mock/coachFlow';

function dateRangeLabel(startIso: string, endIso: string): string {
  const start = new Date(startIso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  const end = new Date(endIso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${start} – ${end}`;
}

export default function ClubCreateTournamentScreen({
  clubId,
  tournament,
  onBack,
  onSaved,
}: {
  clubId: string;
  /** Si viene seteado, la pantalla edita este torneo (PUT) en vez de crear uno nuevo (POST) —
   * las fechas quedan de solo lectura si tournament.hasActiveBookings (ver decisión #47). */
  tournament?: TournamentSummary;
  onBack: () => void;
  onSaved: (tournament: TournamentSummary) => void;
}) {
  const { token } = useAuth();
  const [name, setName] = useState(tournament?.name ?? '');
  const [venue, setVenue] = useState(tournament?.venue ?? '');
  // Sede real del torneo — no se hereda de la ciudad registrada del club/federación, porque un
  // club puede organizar en una ciudad distinta a la suya (ver decisión #45).
  const [city, setCity] = useState(tournament?.city ?? '');
  const [ageCategories, setAgeCategories] = useState<AgeCategory[]>(tournament?.ageCategories ?? []);
  const [startDate, setStartDate] = useState(tournament?.startDate ?? '');
  const [endDate, setEndDate] = useState(tournament?.endDate ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const datesLocked = tournament?.hasActiveBookings ?? false;

  function toggleAgeCategory(category: AgeCategory) {
    setAgeCategories((prev) => (prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]));
  }

  const canSubmit =
    name.trim().length > 0 &&
    venue.trim().length > 0 &&
    city.trim().length > 0 &&
    ageCategories.length > 0 &&
    startDate.trim().length > 0 &&
    endDate.trim().length > 0 &&
    !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
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
    const params = {
      name: name.trim(),
      venue: venue.trim(),
      city: city.trim(),
      ageCategories,
      startDate,
      endDate,
    };
    try {
      const saved = tournament
        ? await updateTournament(token, clubId, tournament.id, params)
        : await createTournament(token, clubId, params);
      onSaved(saved);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : `No se pudo ${tournament ? 'guardar los cambios' : 'crear el torneo'}. Intenta de nuevo.`,
      );
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
          <Text style={styles.headerTitle}>{tournament ? 'Editar torneo' : 'Crear torneo'}</Text>
          <Text style={styles.headerSubtitle}>
            {tournament
              ? 'Corrige nombre, sede, ciudad o categorías cuando haga falta.'
              : 'Regístralo para poder invitar entrenadores oficiales y liquidar comisiones.'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Section label="Datos del torneo">
          <IconTextInput icon="trophy-outline" placeholder="Nombre del torneo" value={name} onChangeText={setName} />
          <IconTextInput icon="location-outline" placeholder="Sede" value={venue} onChangeText={setVenue} />
          <IconTextInput
            icon="business-outline"
            placeholder="Ciudad donde se juega"
            value={city}
            onChangeText={setCity}
          />
        </Section>

        <Section label="Categorías de edad">
          <Text style={styles.categoriesHint}>
            Si en el torneo se juegan varias categorías y alguna de ellas empieza en una fecha distinta, crea un
            torneo aparte para ella.
          </Text>
          <View style={styles.chipRow}>
            {AGE_CATEGORY_OPTIONS.map((option) => {
              const active = ageCategories.includes(option as AgeCategory);
              return (
                <Pressable
                  key={option}
                  onPress={() => toggleAgeCategory(option as AgeCategory)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{option}</Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section label="Fechas">
          {datesLocked ? (
            <View style={styles.lockedDates}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.textDim} />
              <View style={styles.lockedDatesTextWrap}>
                <Text style={styles.lockedDatesValue}>{dateRangeLabel(startDate, endDate)}</Text>
                <Text style={styles.lockedDatesHint}>
                  Este torneo ya tiene reservas — las fechas no se pueden cambiar. Si hay un error real, contacta a
                  soporte.
                </Text>
              </View>
            </View>
          ) : (
            <>
              <DatePickerField
                icon="calendar-outline"
                placeholder="Fecha de inicio"
                value={startDate}
                onChange={(iso) => {
                  setStartDate(iso);
                  // Si ya había un fin elegido y quedó antes del nuevo inicio, se limpia — el
                  // picker de fin usa minDate={startDate} así que no lo iba a dejar elegido así.
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
            </>
          )}
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
              <Ionicons name={tournament ? 'checkmark-circle-outline' : 'add-circle-outline'} size={18} color={colors.courtBlueDeep} />
              <Text style={styles.submitLabel}>{tournament ? 'Guardar cambios' : 'Crear torneo'}</Text>
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
  categoriesHint: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
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
  lockedDates: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lockedDatesTextWrap: {
    flex: 1,
  },
  lockedDatesValue: {
    color: colors.lineWhite,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  lockedDatesHint: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 17,
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
