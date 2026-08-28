import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TournamentStatusPill from '../../components/club/TournamentStatusPill';
import { useAuth } from '../../context/AuthContext';
import {
  ApiError,
  claimTournament,
  listClubTournamentReports,
  listClubTournaments,
  listUnclaimedTournaments,
  resolveTournamentReport,
  TournamentReport,
  TournamentSummary,
  UnclaimedTournament,
} from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';

function dateRangeLabel(startIso: string, endIso: string): string {
  const start = new Date(startIso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  const end = new Date(endIso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${start} – ${end}`;
}

export default function ClubTournamentListScreen({
  clubId,
  clubName,
  refreshKey,
  onSelect,
  onCreate,
  onBack,
  tabBar,
}: {
  clubId: string;
  clubName: string;
  /** Cambiarlo (p. ej. incrementarlo) fuerza un refetch — usado tras crear un torneo nuevo. */
  refreshKey?: number;
  onSelect: (tournament: TournamentSummary) => void;
  onCreate: () => void;
  onBack?: () => void;
  tabBar?: React.ReactNode;
}) {
  const { token } = useAuth();
  const [tournaments, setTournaments] = useState<TournamentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unclaimed, setUnclaimed] = useState<UnclaimedTournament[] | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [reports, setReports] = useState<TournamentReport[]>([]);
  const [resolvingReportId, setResolvingReportId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  // Se incrementa tras reclamar un torneo con éxito, para refrescar ambas listas — separado del
  // refreshKey del padre (que solo se usa tras crear un torneo nuevo).
  const [localRefreshKey, setLocalRefreshKey] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setError(null);
    listClubTournaments(token, clubId)
      .then((result) => {
        if (!cancelled) setTournaments(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los torneos.');
      });
    return () => {
      cancelled = true;
    };
  }, [token, clubId, refreshKey, localRefreshKey]);

  useEffect(() => {
    let cancelled = false;
    listUnclaimedTournaments(clubId)
      .then((result) => {
        if (!cancelled) setUnclaimed(result);
      })
      .catch(() => {
        if (!cancelled) setUnclaimed([]);
      });
    return () => {
      cancelled = true;
    };
  }, [clubId, localRefreshKey]);

  // Reportes de un padre/entrenador sobre torneos de este club (decisión #46) — sección propia,
  // separada de la lista de torneos, para que salte a la vista antes de que el admin tenga que
  // abrir cada torneo a buscar si algo anda mal.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listClubTournamentReports(token, clubId)
      .then((result) => {
        if (!cancelled) setReports(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, clubId, refreshKey, localRefreshKey]);

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

  async function handleClaim(tournamentId: string) {
    if (!token) {
      setClaimError('No hay una sesión activa.');
      return;
    }
    setClaimingId(tournamentId);
    setClaimError(null);
    try {
      await claimTournament(token, clubId, tournamentId);
      setLocalRefreshKey((k) => k + 1);
    } catch (err) {
      setClaimError(err instanceof ApiError ? err.message : 'No se pudo reclamar el torneo. Intenta de nuevo.');
    } finally {
      setClaimingId(null);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          {onBack && (
            <Pressable style={styles.backButton} onPress={onBack}>
              <Text style={styles.backIcon}>←</Text>
            </Pressable>
          )}
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Torneos</Text>
            <Text style={styles.headerSubtitle}>{clubName}</Text>
          </View>
        </View>
        <Pressable style={styles.createButton} onPress={onCreate}>
          <Ionicons name="add" size={16} color={colors.courtBlueDeep} />
          <Text style={styles.createLabel}>Crear torneo</Text>
        </Pressable>
      </View>

      {error ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      ) : !tournaments ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color={colors.courtBlue} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {reports.length > 0 && (
            <View style={styles.reportsSection}>
              <Text style={styles.reportsLabel}>
                {reports.length === 1 ? 'Reporte abierto' : `${reports.length} reportes abiertos`}
              </Text>
              {resolveError && <Text style={styles.claimErrorText}>{resolveError}</Text>}
              {reports.map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  resolving={resolvingReportId === report.id}
                  onResolve={() => handleResolveReport(report.id)}
                />
              ))}
            </View>
          )}

          {tournaments.map((tournament) => (
            <TournamentCard key={tournament.id} tournament={tournament} onPress={() => onSelect(tournament)} />
          ))}

          {tournaments.length === 0 && (
            <Text style={styles.emptyText}>Todavía no hay torneos organizados por {clubName}.</Text>
          )}

          {unclaimed && unclaimed.length > 0 && (
            <View style={styles.unclaimedSection}>
              <Text style={styles.unclaimedLabel}>Torneos disponibles para reclamar</Text>
              {claimError && <Text style={styles.claimErrorText}>{claimError}</Text>}
              {unclaimed.map((tournament) => (
                <UnclaimedTournamentCard
                  key={tournament.id}
                  tournament={tournament}
                  claiming={claimingId === tournament.id}
                  onClaim={() => handleClaim(tournament.id)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}
      {tabBar}
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
      <Text style={styles.reportMeta}>Reportado por {report.reporterName}</Text>
      <Text style={styles.reportMessage}>{report.message}</Text>
      <Pressable style={styles.resolveButton} onPress={onResolve} disabled={resolving}>
        {resolving ? (
          <ActivityIndicator color={colors.courtBlueDeep} size="small" />
        ) : (
          <View style={styles.buttonContent}>
            <Ionicons name="checkmark-outline" size={14} color={colors.courtBlueDeep} />
            <Text style={styles.resolveButtonLabel}>Marcar resuelto</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

function UnclaimedTournamentCard({
  tournament,
  claiming,
  onClaim,
}: {
  tournament: UnclaimedTournament;
  claiming: boolean;
  onClaim: () => void;
}) {
  return (
    <View style={styles.unclaimedCard}>
      <Text style={styles.tournamentName}>{tournament.name}</Text>
      <Text style={styles.tournamentMeta}>{tournament.venue}</Text>
      <Text style={styles.tournamentMeta}>{tournament.city}</Text>
      <Text style={styles.tournamentMeta}>{dateRangeLabel(tournament.startDate, tournament.endDate)}</Text>
      <Pressable style={styles.claimButton} onPress={onClaim} disabled={claiming}>
        {claiming ? (
          <ActivityIndicator color={colors.courtBlueDeep} size="small" />
        ) : (
          <View style={styles.buttonContent}>
            <Ionicons name="flag-outline" size={14} color={colors.courtBlueDeep} />
            <Text style={styles.claimButtonLabel}>Reclamar</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

function TournamentCard({
  tournament,
  onPress,
}: {
  tournament: TournamentSummary;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardTopRow}>
        <Text style={styles.tournamentName}>{tournament.name}</Text>
        <TournamentStatusPill status={tournament.status} />
      </View>
      <Text style={styles.tournamentMeta}>
        {tournament.venue} · {tournament.city}
      </Text>
      {tournament.ageCategories.length > 0 && (
        <Text style={styles.tournamentMeta}>{tournament.ageCategories.join(' · ')}</Text>
      )}
      <Text style={styles.tournamentMeta}>{dateRangeLabel(tournament.startDate, tournament.endDate)}</Text>
      <View style={styles.selectRow}>
        <Text style={styles.selectLabel}>
          {tournament.officialCoachCount} entrenador{tournament.officialCoachCount === 1 ? '' : 'es'} oficial
          {tournament.officialCoachCount === 1 ? '' : 'es'}
        </Text>
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>
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
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
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
    marginBottom: 4,
  },
  headerSubtitle: {
    color: colors.textDim,
    fontSize: 13,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.ballLime,
    borderRadius: 16,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  createLabel: {
    color: colors.courtBlueDeep,
    fontSize: 12,
    fontWeight: '800',
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 12,
  },
  card: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  tournamentName: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
    flexShrink: 1,
  },
  tournamentMeta: {
    color: colors.textDim,
    fontSize: 12,
    marginBottom: 2,
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  selectLabel: {
    color: colors.courtBlue,
    fontSize: 12,
    fontWeight: '700',
  },
  chevron: {
    color: colors.textDim,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyState: {
    paddingTop: 40,
    paddingHorizontal: 20,
  },
  emptyText: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  reportsSection: {
    gap: 12,
    marginBottom: 4,
  },
  reportsLabel: {
    color: colors.amber,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  reportCard: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 16,
    borderWidth: 1,
    borderColor: withOpacity(colors.amber, 0.4),
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
  resolveButtonLabel: {
    color: colors.courtBlueDeep,
    fontSize: 12,
    fontWeight: '800',
  },
  unclaimedSection: {
    marginTop: 8,
    gap: 12,
  },
  unclaimedLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  claimErrorText: {
    color: colors.errorCoral,
    fontSize: 12,
  },
  unclaimedCard: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  claimButton: {
    marginTop: 12,
    backgroundColor: colors.ballLime,
    borderRadius: 16,
    paddingVertical: 9,
    alignItems: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  claimButtonLabel: {
    color: colors.courtBlueDeep,
    fontSize: 12,
    fontWeight: '800',
  },
});
