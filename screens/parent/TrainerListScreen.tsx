import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TrainerAvatarPlaceholder from '../../components/shared/TrainerAvatarPlaceholder';
import { ApiError, CoachSearchResult, searchCoaches, TournamentSearchResult } from '../../lib/api';
import { dateRangeLabel } from '../../lib/dateSlots';
import { colors, radius } from '../../lib/theme';

const MIN_RATING_THRESHOLD = 4;

export default function TrainerListScreen({
  tournament,
  onBack,
  onSelectTrainer,
}: {
  tournament: TournamentSearchResult;
  onBack?: () => void;
  onSelectTrainer?: (coach: CoachSearchResult) => void;
}) {
  const [minRatingOnly, setMinRatingOnly] = useState(false);
  const [trainers, setTrainers] = useState<CoachSearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    searchCoaches({})
      .then((result) => {
        if (!cancelled) setTrainers(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los entrenadores.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleTrainers = trainers?.filter((t) => !minRatingOnly || Number(t.ratingAvg) >= MIN_RATING_THRESHOLD) ?? null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.tournamentName} numberOfLines={1}>
            {tournament.name}
          </Text>
          <Text style={styles.tournamentMeta} numberOfLines={1}>
            {tournament.venue} · {dateRangeLabel(tournament.startDate, tournament.endDate)}
          </Text>
        </View>
      </View>

      <View style={styles.chipsRow}>
        <Pressable
          onPress={() => setMinRatingOnly((v) => !v)}
          style={[styles.chip, minRatingOnly && styles.chipActive]}
        >
          <Text style={[styles.chipLabel, minRatingOnly && styles.chipLabelActive]}>
            ★ {MIN_RATING_THRESHOLD}+ Calificación
          </Text>
        </Pressable>
      </View>

      {error ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      ) : !visibleTrainers ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color={colors.courtBlue} />
        </View>
      ) : (
        <>
          <Text style={styles.resultsLabel}>{visibleTrainers.length} entrenadores disponibles</Text>

          <ScrollView contentContainerStyle={styles.list}>
            {visibleTrainers.map((trainer) => (
              <TrainerCard key={trainer.id} trainer={trainer} onPress={() => onSelectTrainer?.(trainer)} />
            ))}

            {visibleTrainers.length === 0 && (
              <Text style={styles.emptyText}>
                {minRatingOnly
                  ? `Ningún entrenador tiene ${MIN_RATING_THRESHOLD}+ estrellas todavía.`
                  : 'No hay entrenadores disponibles por ahora.'}
              </Text>
            )}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

function TrainerCard({ trainer, onPress }: { trainer: CoachSearchResult; onPress?: () => void }) {
  const metaParts = [trainer.city, trainer.specialty, `${trainer.yearsExperience} años`].filter(Boolean);
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardTopRow}>
        <TrainerAvatarPlaceholder size={60} />
        <View style={styles.cardInfo}>
          <Text style={styles.trainerName}>{trainer.name}</Text>
          <Text style={styles.trainerMeta}>
            ★ {trainer.ratingAvg} · {metaParts.join(' · ')}
          </Text>
        </View>
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
  headerText: {
    flex: 1,
  },
  tournamentName: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
  },
  tournamentMeta: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 2,
  },
  chipsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  chipActive: {
    backgroundColor: colors.ballLime,
  },
  chipLabel: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '600',
  },
  chipLabelActive: {
    color: colors.courtBlueDeep,
  },
  resultsLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  emptyState: {
    paddingTop: 40,
    paddingHorizontal: 20,
  },
  emptyText: {
    color: colors.textDim,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  card: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  trainerName: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  trainerMeta: {
    color: colors.textDim,
    fontSize: 12,
  },
});
