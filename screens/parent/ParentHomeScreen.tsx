import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ParentTabBar from '../../components/parent/ParentTabBar';
import InitialAvatar from '../../components/shared/InitialAvatar';
import { useAuth } from '../../context/AuthContext';
import { listPlayers } from '../../lib/api';
import { colors, radius } from '../../lib/theme';
import { mockActiveTournaments, mockFeaturedTournament, Tournament } from '../../mock/parentFlow';

export default function ParentHomeScreen() {
  const router = useRouter();
  const { user, token } = useAuth();
  const [childName, setChildName] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    listPlayers(token)
      .then((players) => setChildName(players[0]?.fullName ?? null))
      .catch(() => setChildName(null));
  }, [token]);

  function goToTrainers() {
    router.push('/trainers');
  }

  const firstName = user?.fullName.split(' ')[0] ?? '';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.wordmark}>Remote Coach</Text>
        <InitialAvatar initial={firstName[0] ?? '?'} size={36} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.greeting}>Hola, {firstName}</Text>
        <Text style={styles.headline}>
          {childName
            ? `Encuentra un entrenador para el próximo torneo de ${childName}`
            : 'Encuentra un entrenador para tu próximo torneo'}
        </Text>

        <Text style={styles.sectionLabel}>Continuar con</Text>
        <View style={styles.featuredCard}>
          <View style={styles.badge}>
            <Text style={styles.badgeLabel}>{mockFeaturedTournament.badgeLabel}</Text>
          </View>
          <Text style={styles.featuredName}>{mockFeaturedTournament.name}</Text>
          <Text style={styles.featuredMeta}>
            {mockFeaturedTournament.venue} · {mockFeaturedTournament.city}
          </Text>
          <Text style={styles.featuredMeta}>{mockFeaturedTournament.dates}</Text>
          <Pressable style={styles.ctaButton} onPress={goToTrainers}>
            <Text style={styles.ctaLabel}>Ver entrenadores</Text>
          </Pressable>
        </View>

        <Pressable style={styles.searchBar} onPress={goToTrainers}>
          <Ionicons name="search-outline" size={16} color={colors.textDim} />
          <Text style={styles.searchPlaceholder}>Buscar por nombre o sede del torneo</Text>
        </Pressable>

        <Text style={styles.sectionLabel}>Torneos activos</Text>
        <View style={styles.tournamentList}>
          {mockActiveTournaments.map((tournament) => (
            <TournamentRow key={tournament.id} tournament={tournament} onPress={goToTrainers} />
          ))}
        </View>
      </ScrollView>

      <ParentTabBar active="inicio" />
    </SafeAreaView>
  );
}

function TournamentRow({ tournament, onPress }: { tournament: Tournament; onPress?: () => void }) {
  return (
    <Pressable style={styles.tournamentRow} onPress={onPress}>
      <View style={styles.tournamentInfo}>
        <Text style={styles.tournamentName}>{tournament.name}</Text>
        <Text style={styles.tournamentMeta}>
          {tournament.venue} · {tournament.city} · {tournament.dates}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  wordmark: {
    color: colors.ballLime,
    fontSize: 18,
    fontWeight: '800',
  },
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  greeting: {
    color: colors.textDim,
    fontSize: 14,
    marginBottom: 4,
  },
  headline: {
    color: colors.lineWhite,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
    marginBottom: 22,
  },
  sectionLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  featuredCard: {
    backgroundColor: colors.panelLight,
    borderRadius: radius,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badge: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: colors.errorCoral,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  badgeLabel: {
    color: colors.lineWhite,
    fontSize: 10,
    fontWeight: '700',
  },
  featuredName: {
    color: colors.lineWhite,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
    marginRight: 90,
  },
  featuredMeta: {
    color: colors.textSoft,
    fontSize: 13,
    marginBottom: 2,
  },
  ctaButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  ctaLabel: {
    color: colors.courtBlueDeep,
    fontSize: 14,
    fontWeight: '800',
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
    marginBottom: 24,
    gap: 8,
  },
  searchPlaceholder: {
    color: colors.textDim,
    fontSize: 13,
  },
  tournamentList: {
    gap: 10,
  },
  tournamentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.panel,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  tournamentInfo: {
    flex: 1,
    marginRight: 10,
  },
  tournamentName: {
    color: colors.lineWhite,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  tournamentMeta: {
    color: colors.textDim,
    fontSize: 12,
  },
  chevron: {
    color: colors.textDim,
    fontSize: 20,
    fontWeight: '700',
  },
});
