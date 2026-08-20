import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ClubTagBadge from '../../components/coach/ClubTagBadge';
import { useAuth } from '../../context/AuthContext';
import {
  ApiError,
  CoachClubTag,
  CountryCode,
  getCoachProfile,
  listCoachClubTags,
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
}: {
  onSelect: (tournament: TournamentSearchResult) => void;
  onBack?: () => void;
  tabBar?: React.ReactNode;
}) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TournamentSearchResult[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clubTags, setClubTags] = useState<CoachClubTag[]>([]);
  const [defaultCountry, setDefaultCountry] = useState<CountryCode | null>(null);
  const [countryFilterOn, setCountryFilterOn] = useState(true);

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
          {results.map((tournament) => (
            <TournamentCard
              key={tournament.id}
              tournament={tournament}
              clubTags={clubTags}
              onPress={() => onSelect(tournament)}
            />
          ))}

          {results.length === 0 && (
            <Text style={styles.emptyText}>No encontramos torneos con ese nombre, sede o ciudad.</Text>
          )}
        </ScrollView>
      )}
      {tabBar}
    </SafeAreaView>
  );
}

function TournamentCard({
  tournament,
  clubTags,
  onPress,
}: {
  tournament: TournamentSearchResult;
  clubTags: CoachClubTag[];
  onPress: () => void;
}) {
  const tagging = clubTags.find((t) => t.tournamentId === tournament.id);
  const countdown = daysUntilCountdown(tournament.startDate);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardTopRow}>
        <Text style={styles.tournamentName}>{tournament.name}</Text>
        {tagging && <ClubTagBadge clubName={tagging.clubName} />}
      </View>
      <Text style={styles.tournamentMeta}>
        {tournament.venue} · <Text style={styles.tournamentCity}>{tournament.city}</Text>
      </Text>
      <Text style={styles.tournamentMeta}>
        {dateRangeLabel(tournament.startDate, tournament.endDate)}
        {countdown && <Text style={[styles.countdown, { color: countdown.color }]}> · {countdown.text}</Text>}
      </Text>
      <View style={styles.selectRow}>
        <Text style={styles.selectLabel}>Configurar disponibilidad</Text>
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
});
