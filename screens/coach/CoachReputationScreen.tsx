import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ReviewCard from '../../components/coach/ReviewCard';
import StatTile from '../../components/shared/StatTile';
import TrainerAvatarPlaceholder from '../../components/shared/TrainerAvatarPlaceholder';
import { colors, radius, withOpacity } from '../../lib/theme';
import { mockCoachActivityStats, mockCoachReviews, mockOfficialClubTaggings } from '../../mock/coachFlow';
import { mockCarlosMedinaProfile } from '../../mock/parentFlow';

export default function CoachReputationScreen() {
  const { trainer } = mockCarlosMedinaProfile;
  const stats = mockCoachActivityStats;
  const taggings = mockOfficialClubTaggings;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileHeader}>
          <TrainerAvatarPlaceholder size={72} />
          <Text style={styles.name}>{trainer.name}</Text>
          <View style={styles.ratingRow}>
            <Text style={styles.ratingValue}>★ {trainer.rating}</Text>
            <Text style={styles.reviewsCount}>({trainer.reviews} reseñas)</Text>
          </View>
        </View>

        {taggings.length > 0 && (
          <View style={styles.clubBadgeList}>
            {taggings.map((tagging) => (
              <View key={tagging.tournamentId} style={styles.clubBadge}>
                <Text style={styles.clubBadgeTitle}>
                  Entrenador oficial · {tagging.clubName}
                </Text>
                <Text style={styles.clubBadgeSubtitle}>
                  Para {tagging.tournamentName}. Los padres ya ven esta insignia en tu perfil — no necesitas hacer
                  nada más.
                </Text>
              </View>
            ))}
          </View>
        )}

        <Section label="Tu actividad">
          <View style={styles.statsGrid}>
            <StatTile value={String(stats.matchesPlayed)} label="Partidos" />
            <StatTile value={`${Math.round(stats.acceptanceRate * 100)}%`} label="Tasa de aceptación" />
            <StatTile value={String(stats.tournamentsCount)} label="Torneos" />
            <StatTile value={`${stats.averageResponseMinutes} min`} label="Tiempo de respuesta" />
          </View>
        </Section>

        <Section label="Comentarios de padres">
          <View style={styles.reviewsList}>
            {mockCoachReviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </View>
        </Section>
      </ScrollView>
    </SafeAreaView>
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
  content: {
    padding: 20,
    paddingBottom: 24,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 18,
  },
  name: {
    color: colors.lineWhite,
    fontSize: 19,
    fontWeight: '800',
    marginTop: 12,
    marginBottom: 6,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  ratingValue: {
    color: colors.ballLime,
    fontSize: 16,
    fontWeight: '800',
  },
  reviewsCount: {
    color: colors.textDim,
    fontSize: 13,
  },
  clubBadgeList: {
    gap: 10,
    marginBottom: 24,
  },
  clubBadge: {
    backgroundColor: withOpacity(colors.ballLime, 0.1),
    borderRadius: radius,
    borderWidth: 1,
    borderColor: withOpacity(colors.ballLime, 0.35),
    padding: 14,
  },
  clubBadgeTitle: {
    color: colors.ballLime,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },
  clubBadgeSubtitle: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  section: {
    marginBottom: 26,
  },
  sectionLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  reviewsList: {
    gap: 12,
  },
});
