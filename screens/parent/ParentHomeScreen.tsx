import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import InitialAvatar from '../../components/parent/InitialAvatar';
import { colors, radius } from '../../lib/theme';
import { mockActiveTournaments, mockFeaturedTournament, mockParentUser, Tournament } from '../../mock/parentFlow';

type TabKey = 'inicio' | 'reservas' | 'reportes' | 'perfil';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'inicio', label: 'Inicio' },
  { key: 'reservas', label: 'Reservas' },
  { key: 'reportes', label: 'Reportes' },
  { key: 'perfil', label: 'Perfil' },
];

export default function ParentHomeScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.wordmark}>Remote Coach</Text>
        <InitialAvatar initial={mockParentUser.initial} size={36} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.greeting}>Hola, {mockParentUser.name}</Text>
        <Text style={styles.headline}>
          Encuentra un entrenador para el próximo torneo de {mockParentUser.childName}
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
          <Pressable style={styles.ctaButton}>
            <Text style={styles.ctaLabel}>Ver entrenadores</Text>
          </Pressable>
        </View>

        <Pressable style={styles.searchBar}>
          <Text style={styles.searchIcon}>⌕</Text>
          <Text style={styles.searchPlaceholder}>Buscar por nombre o sede del torneo</Text>
        </Pressable>

        <Text style={styles.sectionLabel}>Torneos activos</Text>
        <View style={styles.tournamentList}>
          {mockActiveTournaments.map((tournament) => (
            <TournamentRow key={tournament.id} tournament={tournament} />
          ))}
        </View>
      </ScrollView>

      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <View key={tab.key} style={styles.tabItem}>
            <View style={[styles.tabDot, tab.key === 'inicio' && styles.tabDotActive]} />
            <Text style={[styles.tabLabel, tab.key === 'inicio' && styles.tabLabelActive]}>{tab.label}</Text>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

function TournamentRow({ tournament }: { tournament: Tournament }) {
  return (
    <Pressable style={styles.tournamentRow}>
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
  searchIcon: {
    color: colors.textDim,
    fontSize: 15,
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
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.courtBlueDeep,
    paddingTop: 10,
    paddingBottom: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
  },
  tabDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textDim,
    marginBottom: 5,
  },
  tabDotActive: {
    backgroundColor: colors.ballLime,
  },
  tabLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: colors.ballLime,
  },
});
