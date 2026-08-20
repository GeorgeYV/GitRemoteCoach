import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ReviewCard from '../../components/coach/ReviewCard';
import StatTile from '../../components/shared/StatTile';
import TrainerAvatarPlaceholder from '../../components/shared/TrainerAvatarPlaceholder';
import { useAuth } from '../../context/AuthContext';
import {
  ApiError,
  CoachClubTag,
  CoachProfile,
  getCoachProfile,
  listCoachBookings,
  listCoachClubTags,
  listCoachReviews,
  ReviewWithParent,
} from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';
import { CoachReview } from '../../mock/coachFlow';

interface ActivityStats {
  matchesPlayed: number;
  acceptanceRate: number;
  averageResponseMinutes: number;
  tournamentsCount: number;
}

function toCoachReview(review: ReviewWithParent): CoachReview {
  return {
    id: review.id,
    parentInitial: review.parentName[0] ?? '?',
    parentName: review.parentName,
    stars: review.rating,
    quote: review.comment ?? '',
    date: new Date(review.createdAt).toLocaleDateString('es-MX', { month: 'short', year: 'numeric' }),
  };
}

export default function CoachReputationScreen({
  coachId,
  coachName,
  onBack,
}: {
  coachId: string;
  coachName: string;
  onBack?: () => void;
}) {
  const { token } = useAuth();

  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [reviews, setReviews] = useState<CoachReview[] | null>(null);
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [taggings, setTaggings] = useState<CoachClubTag[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('No hay una sesión activa.');
      return;
    }
    let cancelled = false;
    setError(null);
    Promise.all([
      getCoachProfile(coachId),
      listCoachReviews(coachId),
      listCoachBookings(token, coachId),
      listCoachClubTags(coachId),
    ])
      .then(([profileResult, reviewsResult, bookings, clubTags]) => {
        if (cancelled) return;
        setProfile(profileResult.profile);
        setReviews(reviewsResult.map(toCoachReview));
        setTaggings(clubTags);

        const responded = bookings.filter((b) => b.decidedAt !== null);
        const accepted = responded.filter((b) => b.status !== 'rejected');
        const avgResponseMs =
          responded.length > 0
            ? responded.reduce((sum, b) => sum + (new Date(b.decidedAt!).getTime() - new Date(b.requestedAt).getTime()), 0) /
              responded.length
            : 0;
        setStats({
          matchesPlayed: bookings.filter((b) => b.status === 'completed').length,
          acceptanceRate: responded.length > 0 ? accepted.length / responded.length : 0,
          averageResponseMinutes: Math.round(avgResponseMs / 60_000),
          tournamentsCount: new Set(bookings.map((b) => b.tournamentId)).size,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar tu reputación.');
      });
    return () => {
      cancelled = true;
    };
  }, [coachId, token]);

  if (error) {
    return (
      <SafeAreaView style={[styles.container, styles.centerState]} edges={['top', 'bottom']}>
        <Text style={styles.reviewsCount}>{error}</Text>
      </SafeAreaView>
    );
  }

  if (!profile || !reviews || !stats) {
    return (
      <SafeAreaView style={[styles.container, styles.centerState]} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.courtBlue} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Reputación</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileHeader}>
          <TrainerAvatarPlaceholder size={72} photoUrl={profile.photoUrl} />
          <Text style={styles.name}>{coachName}</Text>
          <View style={styles.ratingRow}>
            <Text style={styles.ratingValue}>★ {profile.ratingAvg}</Text>
            <Text style={styles.reviewsCount}>({profile.ratingCount} reseñas)</Text>
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
          {reviews.length === 0 ? (
            <Text style={styles.reviewsCount}>Todavía no tienes reseñas.</Text>
          ) : (
            <View style={styles.reviewsList}>
              {reviews.map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}
            </View>
          )}
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
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
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
    fontSize: 17,
    fontWeight: '800',
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
    color: colors.courtBlue,
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
    color: colors.courtBlue,
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
