import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ClubTagBadge from '../../components/coach/ClubTagBadge';
import ReportTournamentModal from '../../components/shared/ReportTournamentModal';
import RequestTournamentModal from '../../components/shared/RequestTournamentModal';
import { useAuth } from '../../context/AuthContext';
import {
  ApiError,
  CoachClubTag,
  CountryCode,
  getCoachProfile,
  listCoachClubTags,
  listConfiguredCoachTournamentIds,
  searchTournaments,
  TournamentSearchResult,
} from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';
import { COUNTRY_LABELS } from '../../mock/coachFlow';

function dateRangeLabel(startIso: string, endIso: string): string {
  const start = new Date(startIso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  const end = new Date(endIso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${start} – ${end}`;
}

/** "faltan N d" mientras el torneo no arranca (con color según urgencia), null si ya empezó. */
function daysUntilCountdown(startIso: string): { text: string; color: string } | null {
  const days = Math.ceil((new Date(startIso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return null;
  const color = days < 7 ? colors.errorCoral : days < 14 ? colors.amber : colors.ballLime;
  return { text: `faltan ${days} d`, color };
}

export default function CoachTournamentSearchScreen({
  onSelect,
  onBack,
  tabBar,
  /** CoachHomeScreen "Ver mis torneos con disponibilidad" — arranca con el filtro ya activado en
   * vez de que el coach tenga que encontrar y tocar el chip él mismo. */
  initialConfiguredFilter,
}: {
  onSelect: (tournament: TournamentSearchResult) => void;
  onBack?: () => void;
  tabBar?: React.ReactNode;
  initialConfiguredFilter?: boolean;
}) {
  const { user, token } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TournamentSearchResult[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clubTags, setClubTags] = useState<CoachClubTag[]>([]);
  const [configuredIds, setConfiguredIds] = useState<Set<string>>(new Set());
  const [defaultCountry, setDefaultCountry] = useState<CountryCode | null>(null);
  const [countryFilterOn, setCountryFilterOn] = useState(true);
  const [configuredFilterOn, setConfiguredFilterOn] = useState(!!initialConfiguredFilter);
  const [reportTarget, setReportTarget] = useState<{ id: string; name: string } | null>(null);
  const [showTournamentRequestModal, setShowTournamentRequestModal] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    listCoachClubTags(user.id).then((tags) => {
      if (!cancelled) setClubTags(tags);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Píldora "Disponibilidad lista" + filtro "Con disponibilidad" (ver comentario del lado del
  // servidor) — recarga cuando vuelve el foco a esta pantalla no hace falta: se re-monta entera
  // cada vez que el coach entra desde el tab, así que siempre trae el estado actual.
  useEffect(() => {
    if (!user || !token) return;
    let cancelled = false;
    listConfiguredCoachTournamentIds(token, user.id)
      .then(({ tournamentIds }) => {
        if (!cancelled) setConfiguredIds(new Set(tournamentIds));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, token]);

  // País donde entrena — default del toggle "mi país"/"todos" de abajo.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getCoachProfile(user.id)
      .then((result) => {
        if (!cancelled) setDefaultCountry(result.profile.country);
      })
      .catch(() => {
        if (!cancelled) setDefaultCountry(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const activeCountry = countryFilterOn ? (defaultCountry ?? undefined) : undefined;

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    // Debounce: espera a que el usuario deje de escribir antes de pegarle al backend en cada tecla.
    const handle = setTimeout(() => {
      searchTournaments(query.trim() || undefined, activeCountry)
        .then((result) => {
          if (!cancelled) setResults(result);
        })
        .catch((err) => {
          if (cancelled) return;
          setLoadError(err instanceof ApiError ? err.message : 'No se pudieron cargar los torneos.');
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, activeCountry]);

  const visibleResults = results ? (configuredFilterOn ? results.filter((t) => configuredIds.has(t.id)) : results) : [];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Pressable style={styles.backButton} onPress={onBack}>
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>¿En qué torneo vas a estar?</Text>
        </View>
        <Text style={styles.headerSubtitle}>
          Busca por nombre, sede o ciudad para configurar tu disponibilidad y tarifa ahí.
        </Text>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color={colors.textDim} />
        <TextInput
          style={styles.searchInput}
          placeholder="Nombre, sede o ciudad del torneo"
          placeholderTextColor={colors.textDim}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {defaultCountry && (
        <View style={styles.countryToggleRow}>
          <Pressable
            style={[styles.countryToggleChip, countryFilterOn && styles.countryToggleChipActive]}
            onPress={() => setCountryFilterOn(true)}
          >
            <Text style={[styles.countryToggleLabel, countryFilterOn && styles.countryToggleLabelActive]}>
              {COUNTRY_LABELS[defaultCountry]}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.countryToggleChip, !countryFilterOn && styles.countryToggleChipActive]}
            onPress={() => setCountryFilterOn(false)}
          >
            <Text style={[styles.countryToggleLabel, !countryFilterOn && styles.countryToggleLabelActive]}>Todos</Text>
          </Pressable>
        </View>
      )}

      {configuredIds.size > 0 && (
        <View style={styles.countryToggleRow}>
          <Pressable
            style={[styles.countryToggleChip, configuredFilterOn && styles.countryToggleChipActive]}
            onPress={() => setConfiguredFilterOn((v) => !v)}
          >
            {/* "Mi disponibilidad", no "Con disponibilidad" — ese nombre sonaba ambiguo (¿disponibilidad
               de quién?); reusa el mismo vocabulario que ya usa esta pantalla más abajo ("Disponibilidad
               lista", "Editar disponibilidad"). */}
            <Text style={[styles.countryToggleLabel, configuredFilterOn && styles.countryToggleLabelActive]}>
              Mi disponibilidad
            </Text>
          </Pressable>
        </View>
      )}

      {loadError ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{loadError}</Text>
        </View>
      ) : !results ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color={colors.courtBlue} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {visibleResults.map((tournament) => (
            <TournamentCard
              key={tournament.id}
              tournament={tournament}
              clubTags={clubTags}
              configured={configuredIds.has(tournament.id)}
              onPress={() => onSelect(tournament)}
              onReport={() => setReportTarget({ id: tournament.id, name: tournament.name })}
            />
          ))}

          {visibleResults.length === 0 && (
            <View style={styles.emptyStateWrap}>
              <Text style={styles.emptyText}>
                {configuredFilterOn
                  ? 'Todavía no configuraste disponibilidad en ningún torneo.'
                  : 'No encontramos torneos con ese nombre, sede o ciudad.'}
              </Text>
              {!configuredFilterOn && (
                <Pressable style={styles.requestTournamentButton} onPress={() => setShowTournamentRequestModal(true)}>
                  <Ionicons name="add-circle-outline" size={15} color={colors.courtBlue} />
                  <Text style={styles.requestTournamentLabel}>Solicitar que agreguen este torneo</Text>
                </Pressable>
              )}
            </View>
          )}
        </ScrollView>
      )}
      {tabBar}

      {token && (
        <>
          <ReportTournamentModal
            visible={reportTarget !== null}
            tournamentId={reportTarget?.id ?? null}
            tournamentName={reportTarget?.name ?? ''}
            authToken={token}
            onClose={() => setReportTarget(null)}
          />
          <RequestTournamentModal
            visible={showTournamentRequestModal}
            initialName={query}
            defaultCountry={activeCountry}
            authToken={token}
            onClose={() => setShowTournamentRequestModal(false)}
          />
        </>
      )}
    </SafeAreaView>
  );
}

function TournamentCard({
  tournament,
  clubTags,
  configured,
  onPress,
  onReport,
}: {
  tournament: TournamentSearchResult;
  clubTags: CoachClubTag[];
  /** true si el coach ya guardó disponibilidad/tarifa acá — ver GET .../configured-tournaments. */
  configured: boolean;
  onPress: () => void;
  onReport: () => void;
}) {
  const tagging = clubTags.find((t) => t.tournamentId === tournament.id);
  const countdown = daysUntilCountdown(tournament.startDate);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardTopRow}>
        <View style={styles.cardTitleWrap}>
          <Text style={styles.tournamentName}>{tournament.name}</Text>
          {tagging && <ClubTagBadge clubName={tagging.clubName} />}
          {configured && (
            <View style={styles.configuredPill}>
              <Ionicons name="checkmark" size={11} color={colors.courtBlue} />
              <Text style={styles.configuredPillLabel}>Disponibilidad lista</Text>
            </View>
          )}
        </View>
        {/* Pressable anidado dentro del Pressable de la tarjeta — RN prioriza el más interno,
           así que no dispara onPress de la tarjeta (mismo criterio que ParentHomeScreen). */}
        <Pressable style={styles.reportButton} onPress={onReport} hitSlop={8}>
          <Ionicons name="flag-outline" size={16} color={colors.textDim} />
        </Pressable>
      </View>
      <Text style={styles.tournamentMeta}>
        {tournament.venue} · <Text style={styles.tournamentCity}>{tournament.city}</Text>
      </Text>
      <Text style={styles.tournamentMeta}>
        {dateRangeLabel(tournament.startDate, tournament.endDate)}
        {countdown && <Text style={[styles.countdown, { color: countdown.color }]}> · {countdown.text}</Text>}
      </Text>
      <View style={styles.selectRow}>
        <Text style={styles.selectLabel}>{configured ? 'Editar disponibilidad' : 'Configurar disponibilidad'}</Text>
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
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  backButton: {
    paddingRight: 12,
  },
  backIcon: {
    color: colors.lineWhite,
    fontSize: 20,
  },
  headerTitle: {
    color: colors.lineWhite,
    fontSize: 20,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderRadius: radius,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 20,
    marginBottom: 18,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.lineWhite,
    fontSize: 13,
    padding: 0,
  },
  countryToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 18,
  },
  countryToggleChip: {
    backgroundColor: colors.panel,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  countryToggleChipActive: {
    backgroundColor: withOpacity(colors.ballLime, 0.16),
    borderColor: colors.ballLime,
  },
  countryToggleLabel: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
  },
  countryToggleLabelActive: {
    color: colors.courtBlue,
  },
  list: {
    paddingHorizontal: 20,
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
  cardTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  configuredPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: withOpacity(colors.ballLime, 0.14),
    borderWidth: 1,
    borderColor: withOpacity(colors.ballLime, 0.4),
    borderRadius: 10,
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  configuredPillLabel: {
    color: colors.courtBlue,
    fontSize: 10,
    fontWeight: '700',
  },
  reportButton: {
    paddingHorizontal: 4,
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
  tournamentCity: {
    color: colors.textSoft,
    fontWeight: '800',
  },
  countdown: {
    fontWeight: '800',
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
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 19,
  },
  emptyStateWrap: {
    alignItems: 'center',
    gap: 14,
  },
  requestTournamentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: withOpacity(colors.courtBlue, 0.35),
  },
  requestTournamentLabel: {
    color: colors.courtBlue,
    fontSize: 12,
    fontWeight: '700',
  },
});
