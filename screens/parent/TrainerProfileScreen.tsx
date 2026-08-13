import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AvailabilitySlotPill from '../../components/parent/AvailabilitySlotPill';
import InitialAvatar from '../../components/shared/InitialAvatar';
import StatTile from '../../components/shared/StatTile';
import TrainerAvatarPlaceholder from '../../components/shared/TrainerAvatarPlaceholder';
import {
  ApiError,
  CoachProfileWithTraining,
  CoachReportSummary,
  CoachTournamentAvailability,
  getCoachProfile,
  getCoachReportSummary,
  getCoachTournamentAvailability,
  getCoachTournamentBookingCount,
  listCoachReviews,
  PlayingLevel,
  ReviewWithParent,
  TournamentSearchResult,
  VerificationStatus,
} from '../../lib/api';
import { buildDaySlotsFromRange } from '../../lib/dateSlots';
import { colors, radius } from '../../lib/theme';
import { AvailabilityDay, buildMatchDatetime } from '../../mock/parentFlow';

const LEVEL_LABELS: Record<PlayingLevel, string> = {
  recreativo: 'Recreativo',
  competitivo: 'Competitivo',
  alto_rendimiento: 'Alto rendimiento',
};

const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  approved: 'Entrenador verificado',
  pending: 'Verificación en proceso',
  rejected: 'Verificación no aprobada',
};

/** slotDate llega como datetime ISO completo (pg serializa DATE como Date → JSON), no como
 * 'YYYY-MM-DD' — hay que recortarlo antes de matchear contra los días reales del torneo. */
/** Un día que el coach marcó disponible pero cuyo horario ya pasó no debe ofrecerse — si no, el
 * padre lo elige y el backend lo rechaza recién al enviar la solicitud (ver buildMatchDatetime). */
function isDayStillFuture(dayLabel: string, isoDate: string): boolean {
  return new Date(buildMatchDatetime({ dayLabel, isoDate })).getTime() > Date.now();
}

function toAvailabilityDays(
  tournament: TournamentSearchResult,
  availability: CoachTournamentAvailability[],
): AvailabilityDay[] {
  const byDate = new Map(availability.map((a) => [a.slotDate.slice(0, 10), a]));
  return buildDaySlotsFromRange(tournament.startDate, tournament.endDate).map(({ dayLabel, isoDate }) => {
    const slot = byDate.get(isoDate);
    return {
      dayLabel,
      isoDate,
      available: (slot?.available ?? false) && isDayStillFuture(dayLabel, isoDate),
    };
  });
}

export default function TrainerProfileScreen({
  coachId,
  tournament,
  onBack,
  onReserve,
}: {
  coachId: string;
  tournament: TournamentSearchResult;
  onBack?: () => void;
  onReserve?: (info: { coachId: string; name: string; price: number; availability: AvailabilityDay[] }) => void;
}) {
  const [profile, setProfile] = useState<CoachProfileWithTraining | null>(null);
  const [availability, setAvailability] = useState<AvailabilityDay[] | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [reviews, setReviews] = useState<ReviewWithParent[] | null>(null);
  const [reviewsError, setReviewsError] = useState<string | null>(null);

  const [reportSummary, setReportSummary] = useState<CoachReportSummary | null | undefined>(undefined);
  const [reportError, setReportError] = useState<string | null>(null);

  const [bookedPlayers, setBookedPlayers] = useState<number | undefined>(undefined);
  const [bookedPlayersError, setBookedPlayersError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    Promise.all([getCoachProfile(coachId), getCoachTournamentAvailability(coachId, tournament.id)])
      .then(([profileResult, availabilityResult]) => {
        if (cancelled) return;
        setProfile(profileResult);
        setAvailability(toAvailabilityDays(tournament, availabilityResult.availability));
        setPrice(Number(availabilityResult.rate?.amount ?? profileResult.profile.hourlyRate));
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : 'No se pudo cargar el perfil del entrenador.');
      });
    return () => {
      cancelled = true;
    };
  }, [coachId, tournament]);

  useEffect(() => {
    let cancelled = false;
    setReviewsError(null);
    listCoachReviews(coachId)
      .then((result) => {
        if (!cancelled) setReviews(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setReviewsError(err instanceof ApiError ? err.message : 'No se pudieron cargar las reseñas.');
      });
    return () => {
      cancelled = true;
    };
  }, [coachId]);

  useEffect(() => {
    let cancelled = false;
    setReportError(null);
    getCoachReportSummary(coachId)
      .then((result) => {
        if (!cancelled) setReportSummary(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setReportError(err instanceof ApiError ? err.message : 'No se pudieron cargar las estadísticas.');
      });
    return () => {
      cancelled = true;
    };
  }, [coachId]);

  useEffect(() => {
    let cancelled = false;
    setBookedPlayersError(null);
    getCoachTournamentBookingCount(coachId, tournament.id)
      .then((result) => {
        if (!cancelled) setBookedPlayers(result.bookedPlayers);
      })
      .catch((err) => {
        if (cancelled) return;
        setBookedPlayersError(err instanceof ApiError ? err.message : 'No se pudo cargar cuántos jugadores reservaron.');
      });
    return () => {
      cancelled = true;
    };
  }, [coachId, tournament]);

  if (loadError) {
    return (
      <SafeAreaView style={[styles.container, styles.centerState]} edges={['top', 'bottom']}>
        <Text style={styles.reviewsMessage}>{loadError}</Text>
      </SafeAreaView>
    );
  }

  if (!profile || !availability || price === null) {
    return (
      <SafeAreaView style={[styles.container, styles.centerState]} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.courtBlue} />
      </SafeAreaView>
    );
  }

  const name = profile.profile.fullName;
  const firstName = name.split(' ')[0];
  const tags = [profile.profile.specialty, ...profile.ageCategories, ...profile.levels.map((l) => LEVEL_LABELS[l])].filter(
    (t): t is string => !!t,
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <TrainerAvatarPlaceholder size={64} />
        <View style={styles.headerInfo}>
          <Text style={styles.trainerName}>{name}</Text>
          <Text style={styles.trainerMeta}>
            ★ {profile.profile.ratingAvg} · {profile.profile.ratingCount} reseñas
          </Text>
        </View>
        <View style={styles.priceBlock}>
          <Text style={styles.price}>
            ${price} <Text style={styles.priceSuffix}>/ partido</Text>
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Section label={`Sobre ${firstName}`}>
          <Text style={styles.bio}>{profile.profile.bio ?? 'Este entrenador todavía no agregó una biografía.'}</Text>
          {tags.length > 0 && (
            <View style={styles.tagRow}>
              {tags.map((tag) => (
                <View key={tag} style={styles.tagPill}>
                  <Text style={styles.tagLabel}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </Section>

        <Section label="Verificación">
          <Text style={styles.verificationText}>{VERIFICATION_LABELS[profile.profile.verificationStatus]}</Text>
        </Section>

        <Section label="Reseñas de padres">
          {reviewsError ? (
            <Text style={styles.reviewsMessage}>{reviewsError}</Text>
          ) : reviews === null ? (
            <ActivityIndicator color={colors.courtBlue} />
          ) : reviews.length === 0 ? (
            <Text style={styles.reviewsMessage}>Todavía no hay reseñas para {firstName}.</Text>
          ) : (
            <View style={styles.reviewList}>
              {reviews.map((review) => (
                <View key={review.id} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <InitialAvatar initial={review.parentName[0] ?? '?'} size={32} />
                    <View style={styles.reviewHeaderText}>
                      <Text style={styles.reviewName}>{review.parentName}</Text>
                      <Text style={styles.reviewStars}>{'★'.repeat(review.rating)}</Text>
                    </View>
                  </View>
                  {review.comment && <Text style={styles.reviewQuote}>“{review.comment}”</Text>}
                </View>
              ))}
            </View>
          )}
        </Section>

        <Section label="En números">
          {reportError || bookedPlayersError ? (
            <Text style={styles.reviewsMessage}>{reportError ?? bookedPlayersError}</Text>
          ) : reportSummary === undefined || bookedPlayers === undefined ? (
            <ActivityIndicator color={colors.courtBlue} />
          ) : (
            <View style={styles.statsGrid}>
              <StatTile value={String(reportSummary?.matchesCount ?? 0)} label="Partidos capturados" />
              <StatTile value={String(bookedPlayers)} label="Jugadores en este torneo" />
            </View>
          )}
        </Section>

        <Section label="Disponibilidad para este torneo">
          <View style={styles.availabilityGrid}>
            {availability.map((day) => (
              <View key={day.dayLabel} style={styles.availabilityColumn}>
                <Text style={styles.availabilityDay}>{day.dayLabel}</Text>
                <AvailabilitySlotPill label="Disponible" available={day.available} />
              </View>
            ))}
          </View>
        </Section>
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerNote}>${price} · sin costo de viáticos</Text>
        <Pressable
          style={styles.reserveButton}
          onPress={() => onReserve?.({ coachId, name, price, availability })}
        >
          <View style={styles.reserveContent}>
            <Ionicons name="calendar-outline" size={17} color={colors.courtBlueDeep} />
            <Text style={styles.reserveLabel}>Reservar con {firstName}</Text>
          </View>
        </Pressable>
      </View>
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
  headerInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  trainerName: {
    color: colors.lineWhite,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 3,
  },
  trainerMeta: {
    color: colors.textDim,
    fontSize: 13,
  },
  priceBlock: {
    alignItems: 'flex-end',
  },
  price: {
    color: colors.courtBlue,
    fontSize: 16,
    fontWeight: '800',
  },
  priceSuffix: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '400',
  },
  content: {
    padding: 20,
    paddingBottom: 24,
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
  bio: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagPill: {
    backgroundColor: colors.panel,
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagLabel: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '600',
  },
  verificationText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  reviewsMessage: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 19,
  },
  reviewList: {
    gap: 12,
  },
  reviewCard: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 16,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  reviewHeaderText: {
    marginLeft: 10,
  },
  reviewName: {
    color: colors.lineWhite,
    fontSize: 13,
    fontWeight: '700',
  },
  reviewStars: {
    color: colors.courtBlue,
    fontSize: 12,
    marginTop: 1,
  },
  reviewQuote: {
    color: colors.textSoft,
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 19,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  availabilityGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  availabilityColumn: {
    flex: 1,
  },
  availabilityDay: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.panel,
    padding: 16,
  },
  footerNote: {
    color: colors.textDim,
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 10,
  },
  reserveButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 16,
    alignItems: 'center',
  },
  reserveContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reserveLabel: {
    color: colors.courtBlueDeep,
    fontSize: 15,
    fontWeight: '800',
  },
});
