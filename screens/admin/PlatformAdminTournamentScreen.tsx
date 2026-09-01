import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DatePickerField from '../../components/shared/DatePickerField';
import IconTextInput from '../../components/shared/IconTextInput';
import { useAuth } from '../../context/AuthContext';
import {
  ApiError,
  ClubSearchResult,
  CountryCode,
  createUnclaimedTournament,
  dismissTournamentCreationRequest,
  listPendingTournamentCreationRequests,
  listPendingTournamentReports,
  resolveTournamentReport,
  searchClubs,
  TournamentCreationRequest,
  TournamentReport,
} from '../../lib/api';
import { CLUB_TYPE_LABELS } from '../../lib/clubType';
import { colors, radius, withOpacity } from '../../lib/theme';
import { COUNTRY_LABELS, COUNTRY_OPTIONS } from '../../mock/coachFlow';

/** Siembra un torneo sin club para que cualquier club de ese país lo pueda reclamar después
 * (ClubTournamentListScreen, sección "Torneos disponibles para reclamar" — ver decisión #36 en
 * db/schema.sql). También puede asignarlo directo a un club/federación (decisión #55) y/o
 * resolver una solicitud de "Solicitar que agreguen este torneo" (decisión #55). */
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

  // Cola de solicitudes "Solicitar que agreguen este torneo" (decisión #55) — el padre/entrenador
  // buscó y no encontró nada, así que no hay club/federación al que avisarle; llega directo acá.
  const [requests, setRequests] = useState<TournamentCreationRequest[]>([]);
  const [dismissingRequestId, setDismissingRequestId] = useState<string | null>(null);
  const [requestActionError, setRequestActionError] = useState<string | null>(null);
  // Si viene de "Crear este torneo" en una solicitud, esta creación la resuelve (fulfillsRequestId).
  const [fulfillingRequest, setFulfillingRequest] = useState<TournamentCreationRequest | null>(null);

  // Asignar directo a un club/federación en vez de dejarlo sin reclamar (decisión #55) — opcional,
  // búsqueda manual (mismo patrón que ClubJoinScreen "Buscar mi club") en vez de autocompletar en
  // cada tecla, para no pegarle al backend por cada letra en una pantalla que ya tiene bastante.
  const [clubQuery, setClubQuery] = useState('');
  const [clubSearching, setClubSearching] = useState(false);
  const [clubResults, setClubResults] = useState<ClubSearchResult[] | null>(null);
  const [assignedClub, setAssignedClub] = useState<ClubSearchResult | null>(null);

  // Cola de respaldo (decisión #46) — todos los reportes abiertos de cualquier club, en caso de
  // que el club dueño del torneo no reaccione.
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

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listPendingTournamentCreationRequests(token)
      .then((result) => {
        if (!cancelled) setRequests(result);
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

  async function handleDismissRequest(requestId: string) {
    if (!token) return;
    setDismissingRequestId(requestId);
    setRequestActionError(null);
    try {
      await dismissTournamentCreationRequest(token, requestId);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      if (fulfillingRequest?.id === requestId) setFulfillingRequest(null);
    } catch (err) {
      setRequestActionError(err instanceof ApiError ? err.message : 'No se pudo descartar la solicitud. Intenta de nuevo.');
    } finally {
      setDismissingRequestId(null);
    }
  }

  /** Precarga el formulario de abajo con los datos de la solicitud — el admin completa sede y
   * fechas (la solicitud no las tiene, ver decisión #55) y decide si asignarla a un club o no. */
  function handleFulfillRequest(req: TournamentCreationRequest) {
    setFulfillingRequest(req);
    setName(req.tournamentName);
    setCity(req.city);
    setCountry(req.country);
    setSuccessMessage(null);
    setError(null);
  }

  async function runClubSearch() {
    if (!token || clubQuery.trim().length === 0) return;
    setClubSearching(true);
    try {
      setClubResults(await searchClubs(token, clubQuery.trim()));
    } catch {
      setClubResults([]);
    } finally {
      setClubSearching(false);
    }
  }

  function selectClub(club: ClubSearchResult) {
    setAssignedClub(club);
    setClubQuery('');
    setClubResults(null);
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
        clubId: assignedClub?.id,
        fulfillsRequestId: fulfillingRequest?.id,
      });
      setSuccessMessage(
        assignedClub
          ? `"${tournament.name}" creado y asignado a ${assignedClub.name} — le avisamos por push y correo.`
          : `"${tournament.name}" creado — visible para clubes y federaciones de ${COUNTRY_LABELS[country]} para reclamar.`,
      );
      setName('');
      setVenue('');
      setCity('');
      setStartDate('');
      setEndDate('');
      setAssignedClub(null);
      if (fulfillingRequest) {
        setRequests((prev) => prev.filter((r) => r.id !== fulfillingRequest.id));
        setFulfillingRequest(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el torneo. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Crear torneo sin club/federación</Text>
        <Text style={styles.headerSubtitle}>
          Para torneos con demanda conocida que ningún club o federación creó todavía — cualquiera de ese país podrá reclamarlo después, o lo asignas tú mismo abajo.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {requests.length > 0 && (
          <Section label={requests.length === 1 ? 'Solicitud de torneo' : `${requests.length} solicitudes de torneo`}>
            <Text style={styles.reportsHint}>
              Un padre o entrenador buscó este torneo y no lo encontró — no hay club/federación identificado todavía.
            </Text>
            {requestActionError && <Text style={styles.errorText}>{requestActionError}</Text>}
            {requests.map((req) => (
              <RequestCard
                key={req.id}
                request={req}
                fulfilling={fulfillingRequest?.id === req.id}
                dismissing={dismissingRequestId === req.id}
                onFulfill={() => handleFulfillRequest(req)}
                onDismiss={() => handleDismissRequest(req.id)}
              />
            ))}
          </Section>
        )}

        {reports.length > 0 && (
          <Section label={reports.length === 1 ? 'Reporte abierto (respaldo)' : `${reports.length} reportes abiertos (respaldo)`}>
            <Text style={styles.reportsHint}>
              De cualquier club o federación — visible acá por si el dueño del torneo no reacciona.
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

        {fulfillingRequest && (
          <View style={styles.fulfillingBanner}>
            <Ionicons name="link-outline" size={14} color={colors.courtBlue} />
            <Text style={styles.fulfillingBannerText}>
              Completando la solicitud de {fulfillingRequest.requesterName}
            </Text>
            <Pressable onPress={() => setFulfillingRequest(null)} hitSlop={8}>
              <Text style={styles.fulfillingBannerClear}>Quitar</Text>
            </Pressable>
          </View>
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

        <Section label="Club o federación (opcional)">
          {assignedClub ? (
            <View style={styles.assignedClubCard}>
              <View style={styles.assignedClubInfo}>
                <Text style={styles.assignedClubName}>{assignedClub.name}</Text>
                <Text style={styles.assignedClubMeta}>
                  {CLUB_TYPE_LABELS[assignedClub.type]} · {assignedClub.city}
                </Text>
              </View>
              <Pressable onPress={() => setAssignedClub(null)} hitSlop={8}>
                <Ionicons name="close-circle" size={20} color={colors.textDim} />
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.assignHint}>
                Sin elegir uno, el torneo queda sin reclamar (cualquier club/federación del país puede tomarlo después).
              </Text>
              <View style={styles.clubSearchRow}>
                <TextInput
                  style={styles.clubSearchInput}
                  placeholder="Buscar club o federación por nombre"
                  placeholderTextColor={colors.textDim}
                  value={clubQuery}
                  onChangeText={setClubQuery}
                  onSubmitEditing={runClubSearch}
                  returnKeyType="search"
                />
                <Pressable
                  style={styles.clubSearchButton}
                  onPress={runClubSearch}
                  disabled={clubSearching || clubQuery.trim().length === 0}
                >
                  {clubSearching ? (
                    <ActivityIndicator color={colors.courtBlueDeep} size="small" />
                  ) : (
                    <Ionicons name="search" size={16} color={colors.courtBlueDeep} />
                  )}
                </Pressable>
              </View>
              {clubResults !== null && (
                <View style={styles.clubResultsList}>
                  {clubResults.length === 0 ? (
                    <Text style={styles.reportsHint}>No encontramos ningún club o federación con ese nombre.</Text>
                  ) : (
                    clubResults.map((club) => (
                      <Pressable key={club.id} style={styles.clubResultRow} onPress={() => selectClub(club)}>
                        <View>
                          <Text style={styles.assignedClubName}>{club.name}</Text>
                          <Text style={styles.assignedClubMeta}>
                            {CLUB_TYPE_LABELS[club.type]} · {club.city}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
                      </Pressable>
                    ))
                  )}
                </View>
              )}
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
              <Ionicons name="add-circle-outline" size={18} color={colors.courtBlueDeep} />
              <Text style={styles.submitLabel}>Crear torneo</Text>
            </View>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function RequestCard({
  request,
  fulfilling,
  dismissing,
  onFulfill,
  onDismiss,
}: {
  request: TournamentCreationRequest;
  fulfilling: boolean;
  dismissing: boolean;
  onFulfill: () => void;
  onDismiss: () => void;
}) {
  return (
    <View style={[styles.reportCard, fulfilling && styles.requestCardActive]}>
      <View style={styles.reportTopRow}>
        <Ionicons name="add-circle-outline" size={16} color={colors.courtBlue} />
        <Text style={styles.reportTournamentName}>{request.tournamentName}</Text>
      </View>
      <Text style={styles.reportMeta}>
        {request.city}, {request.country} · pedido por {request.requesterName}
      </Text>
      {request.note && <Text style={styles.reportMessage}>{request.note}</Text>}
      <View style={styles.requestActionsRow}>
        <Pressable style={styles.requestDismissButton} onPress={onDismiss} disabled={dismissing}>
          {dismissing ? (
            <ActivityIndicator color={colors.errorCoral} size="small" />
          ) : (
            <Text style={styles.requestDismissLabel}>Descartar</Text>
          )}
        </Pressable>
        <Pressable style={styles.resolveButton} onPress={onFulfill} disabled={dismissing}>
          <View style={styles.resolveButtonContent}>
            <Ionicons name="create-outline" size={14} color={colors.courtBlueDeep} />
            <Text style={styles.resolveButtonLabel}>{fulfilling ? 'Editando abajo' : 'Crear este torneo'}</Text>
          </View>
        </Pressable>
      </View>
    </View>
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
        {report.clubName ?? 'Sin club/federación'} · reportado por {report.reporterName}
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
  requestCardActive: {
    borderColor: colors.ballLime,
    backgroundColor: withOpacity(colors.ballLime, 0.06),
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
  requestActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  requestDismissButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: withOpacity(colors.errorCoral, 0.4),
  },
  requestDismissLabel: {
    color: colors.errorCoral,
    fontSize: 12,
    fontWeight: '700',
  },
  resolveButton: {
    flex: 1,
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
  fulfillingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: withOpacity(colors.courtBlue, 0.1),
    borderRadius: 14,
    borderWidth: 1,
    borderColor: withOpacity(colors.courtBlue, 0.35),
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  fulfillingBannerText: {
    flex: 1,
    color: colors.courtBlue,
    fontSize: 12,
    fontWeight: '700',
  },
  fulfillingBannerClear: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline',
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
  assignHint: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  clubSearchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  clubSearchInput: {
    flex: 1,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.lineWhite,
    fontSize: 14,
  },
  clubSearchButton: {
    width: 44,
    borderRadius: 14,
    backgroundColor: colors.ballLime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubResultsList: {
    gap: 8,
    marginTop: 10,
  },
  clubResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    padding: 12,
  },
  assignedClubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: withOpacity(colors.ballLime, 0.1),
    borderWidth: 1,
    borderColor: withOpacity(colors.ballLime, 0.35),
    borderRadius: radius,
    padding: 14,
  },
  assignedClubInfo: {
    flex: 1,
    marginRight: 10,
  },
  assignedClubName: {
    color: colors.lineWhite,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  assignedClubMeta: {
    color: colors.textDim,
    fontSize: 12,
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
