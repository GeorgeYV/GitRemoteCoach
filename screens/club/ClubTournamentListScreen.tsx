import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TournamentStatusPill from '../../components/club/TournamentStatusPill';
import { ApiError, listClubTournaments, TournamentSummary } from '../../lib/api';
import { colors, radius } from '../../lib/theme';

function dateRangeLabel(startIso: string, endIso: string): string {
  const start = new Date(startIso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  const end = new Date(endIso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${start} – ${end}`;
}

export default function ClubTournamentListScreen({
  clubId,
  clubName,
  onSelect,
}: {
  clubId: string;
  clubName: string;
  onSelect: (tournament: TournamentSummary) => void;
}) {
  const [tournaments, setTournaments] = useState<TournamentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    listClubTournaments(clubId)
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
  }, [clubId]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Torneos</Text>
        <Text style={styles.headerSubtitle}>{clubName}</Text>
      </View>

      {error ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      ) : !tournaments ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color={colors.ballLime} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {tournaments.map((tournament) => (
            <TournamentCard key={tournament.id} tournament={tournament} onPress={() => onSelect(tournament)} />
          ))}

          {tournaments.length === 0 && (
            <Text style={styles.emptyText}>Todavía no hay torneos organizados por este club.</Text>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
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
      <Text style={styles.tournamentMeta}>{tournament.venue}</Text>
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
    lineHeight: 20,
    textAlign: 'center',
  },
});
