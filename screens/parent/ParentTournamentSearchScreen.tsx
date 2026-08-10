import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { dateRangeLabel } from '../../lib/dateSlots';
import { ApiError, searchTournaments, TournamentSearchResult } from '../../lib/api';
import { colors, radius } from '../../lib/theme';

export default function ParentTournamentSearchScreen({
  onSelect,
  onBack,
}: {
  onSelect: (tournament: TournamentSearchResult) => void;
  onBack?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TournamentSearchResult[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    // Debounce: espera a que el usuario deje de escribir antes de pegarle al backend en cada tecla.
    const handle = setTimeout(() => {
      searchTournaments(query.trim() || undefined)
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
  }, [query]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Pressable style={styles.backButton} onPress={onBack}>
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>¿En qué torneo va a jugar?</Text>
        </View>
        <Text style={styles.headerSubtitle}>
          Busca por nombre, sede o ciudad para ver los entrenadores disponibles ahí.
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

      {loadError ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{loadError}</Text>
        </View>
      ) : !results ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color={colors.ballLime} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {results.map((tournament) => (
            <TournamentCard key={tournament.id} tournament={tournament} onPress={() => onSelect(tournament)} />
          ))}

          {results.length === 0 && (
            <Text style={styles.emptyText}>No encontramos torneos con ese nombre, sede o ciudad.</Text>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function TournamentCard({ tournament, onPress }: { tournament: TournamentSearchResult; onPress: () => void }) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <Text style={styles.tournamentName}>{tournament.name}</Text>
      <Text style={styles.tournamentMeta}>
        {tournament.venue} · {tournament.city}
      </Text>
      <Text style={styles.tournamentMeta}>{dateRangeLabel(tournament.startDate, tournament.endDate)}</Text>
      <View style={styles.selectRow}>
        <Text style={styles.selectLabel}>Ver entrenadores</Text>
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
  tournamentName: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
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
    color: colors.ballLime,
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
