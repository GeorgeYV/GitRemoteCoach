import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ClubTagBadge from '../../components/coach/ClubTagBadge';
import { colors, radius } from '../../lib/theme';
import { mockOfficialClubTaggings } from '../../mock/coachFlow';
import { mockActiveTournaments, Tournament } from '../../mock/parentFlow';

export default function CoachTournamentSearchScreen({ onSelect }: { onSelect: (tournament: Tournament) => void }) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mockActiveTournaments;
    return mockActiveTournaments.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.venue.toLowerCase().includes(q) ||
        t.city.toLowerCase().includes(q) ||
        t.dates.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>¿En qué torneo vas a estar?</Text>
        <Text style={styles.headerSubtitle}>
          Busca por nombre, sede o fecha para configurar tu disponibilidad y tarifa ahí.
        </Text>
      </View>

      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Nombre, sede o ciudad del torneo"
          placeholderTextColor={colors.textDim}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {results.map((tournament) => (
          <TournamentCard key={tournament.id} tournament={tournament} onPress={() => onSelect(tournament)} />
        ))}

        {results.length === 0 && (
          <Text style={styles.emptyText}>No encontramos torneos con ese nombre, sede o fecha.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TournamentCard({ tournament, onPress }: { tournament: Tournament; onPress: () => void }) {
  const tagging = mockOfficialClubTaggings.find((t) => t.tournamentId === tournament.id);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardTopRow}>
        <Text style={styles.tournamentName}>{tournament.name}</Text>
        {tagging && <ClubTagBadge clubName={tagging.clubName} />}
      </View>
      <Text style={styles.tournamentMeta}>
        {tournament.venue} · {tournament.city}
      </Text>
      <Text style={styles.tournamentMeta}>{tournament.dates}</Text>
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
  searchIcon: {
    color: colors.textDim,
    fontSize: 15,
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
    color: colors.ballLime,
    fontSize: 12,
    fontWeight: '700',
  },
  chevron: {
    color: colors.textDim,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyText: {
    color: colors.textDim,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 19,
  },
});
