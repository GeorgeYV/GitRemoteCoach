import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DatePickerField from '../../components/shared/DatePickerField';
import IconTextInput from '../../components/shared/IconTextInput';
import { useAuth } from '../../context/AuthContext';
import {
  ApiError,
  CountryCode,
  createUnclaimedTournament,
  listPendingTournamentReports,
  resolveTournamentReport,
  TournamentReport,
} from '../../lib/api';
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
  const [reports, setReports] = useState<TournamentReport[]>([]);
  const [resolvingReportId, setResolvingReportId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Cola de respaldo (decisión #46) — todos los reportes abiertos de cualquier club, no solo del
  // que corresponda, en caso de que el club dueño del torneo no reaccione.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listPendingTournamentReports(token)
      .then((result) => {
        if (!cancelled) setReports(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleResolveReport(reportId: string) {
    if (!token) return;
    setResolvingReportId(reportId);
    setResolveError(null);
    try {
      await resolveTournamentReport(token, reportId);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
    } catch (err) {
      setResolveError(err instanceof ApiError ? err.message : 'No se pudo marcar como resuelto. Intenta de nuevo.');
    } finally {
      setResolvingReportId(null);
    }
  }

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
        {reports.length > 0 && (
          <Section label={reports.length === 1 ? 'Reporte abierto (respaldo)' : `${reports.length} reportes abiertos (respaldo)`}>
            <Text style={styles.reportsHint}>
              De cualquier club — visible acá por si el club dueño del torneo no reacciona.
            </Text>
            {resolveError && <Text style={styles.errorText}>{resolveError}</Text>}
            {reports.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                resolving={resolvingReportId === report.id}
                onResolve={() => handleResolveReport(report.id)}
              />
            ))}
          </Section>
        )}

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

function ReportCard({
  report,
  resolving,
  onResolve,
}: {
  report: TournamentReport;
  resolving: boolean;
  onResolve: () => void;
}) {
  return (
    <View style={styles.reportCard}>
      <View style={styles.reportTopRow}>
        <Ionicons name="alert-circle-outline" size={16} color={colors.amber} />
        <Text style={styles.reportTournamentName}>{report.tournamentName}</Text>
      </View>
      <Text style={styles.reportMeta}>
        {report.clubName ?? 'Sin club'} · reportado por {report.reporterName}
      </Text>
      <Text style={styles.reportMessage}>{report.message}</Text>
      <Pressable style={styles.resolveButton} onPress={onResolve} disabled={resolving}>
        {resolving ? (
          <ActivityIndicator color={colors.courtBlueDeep} size="small" />
        ) : (
          <View style={styles.resolveButtonContent}>
            <Ionicons name="checkmark-outline" size={14} color={colors.courtBlueDeep} />
            <Text style={styles.resolveButtonLabel}>Marcar resuelto</Text>
          </View>
        )}
      </Pressable>
    </View>
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
  reportsHint: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  reportCard: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 16,
    borderWidth: 1,
    borderColor: withOpacity(colors.amber, 0.4),
    marginBottom: 12,
  },
  reportTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  reportTournamentName: {
    color: colors.lineWhite,
    fontSize: 14,
    fontWeight: '800',
    flexShrink: 1,
  },
  reportMeta: {
    color: colors.textDim,
    fontSize: 11,
    marginBottom: 6,
  },
  reportMessage: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  resolveButton: {
    backgroundColor: colors.ballLime,
    borderRadius: 16,
    paddingVertical: 9,
    alignItems: 'center',
  },
  resolveButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resolveButtonLabel: {
    color: colors.courtBlueDeep,
    fontSize: 12,
    fontWeight: '800',
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
