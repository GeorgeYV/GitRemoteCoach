import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ClubTagBadge from '../../components/coach/ClubTagBadge';
import TrainerAvatarPlaceholder from '../../components/shared/TrainerAvatarPlaceholder';
import {
  ApiError,
  BookedPlayer,
  CoachSearchResult,
  getCoachTournamentBookedPlayers,
  listOfficialCoachIds,
  RateMode,
  searchCoaches,
  TournamentSearchResult,
} from '../../lib/api';
import { dateRangeLabel } from '../../lib/dateSlots';
import { colors, radius } from '../../lib/theme';

const MIN_RATING_THRESHOLD = 4;

/** Mismo criterio que TrainerProfileScreen#PRICE_SUFFIX — duplicado a propósito (mismo patrón ya
 * usado por dateRangeLabel entre las dos pantallas), no vale la pena compartirlo por dos líneas. */
const PRICE_SUFFIX: Record<RateMode, string> = {
  per_day: '/ día',
  per_tournament: '/ torneo',
};

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
  const [bookedPlayersByCoach, setBookedPlayersByCoach] = useState<Record<string, BookedPlayer[]>>({});
  // Entrenadores oficiales de este torneo — se muestran primero y con una insignia (ver
  // sortedTrainers más abajo). undefined mientras carga, para no reordenar la lista dos veces.
  const [officialIds, setOfficialIds] = useState<Set<string> | undefined>(undefined);

  // configuredForTournamentId: solo entrenadores que ya configuraron disponibilidad/tarifa para
  // ESTE torneo (antes traía los ~25 aprobados de toda la plataforma sin relación con el torneo
  // elegido) — la tarifa ya viene incluida en cada resultado, ver decisión en coachRepository.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    searchCoaches({ configuredForTournamentId: tournament.id })
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
  }, [tournament.id]);

  useEffect(() => {
    let cancelled = false;
    listOfficialCoachIds(tournament.id)
      .then(({ coachIds }) => {
        if (!cancelled) setOfficialIds(new Set(coachIds));
      })
      .catch(() => {
        if (!cancelled) setOfficialIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [tournament.id]);

  // Un coach puede aceptar varios alumnos el mismo torneo — el padre necesita ver quiénes ya
  // reservaron antes de elegir. Una llamada por coach visible (la lista es corta) en vez de una
  // pantalla aparte, para no interrumpir el flujo de elegir entrenador.
  useEffect(() => {
    if (!trainers || trainers.length === 0) return;
    let cancelled = false;
    Promise.all(
      trainers.map((t) =>
        getCoachTournamentBookedPlayers(t.id, tournament.id)
          .then((result) => [t.id, result.players] as const)
          .catch(() => [t.id, []] as const),
      ),
    ).then((entries) => {
      if (cancelled) return;
      setBookedPlayersByCoach(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [trainers, tournament.id]);

  // Los oficiales de este torneo van primero — Array#sort es estable, así que dentro de cada
  // grupo (oficial / no oficial) se conserva el orden que ya traía searchCoaches.
  const visibleTrainers = trainers
    ? trainers
        .filter((t) => !minRatingOnly || Number(t.ratingAvg) >= MIN_RATING_THRESHOLD)
        .slice()
        .sort((a, b) => Number(!!officialIds?.has(b.id)) - Number(!!officialIds?.has(a.id)))
    : null;

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
              <TrainerCard
                key={trainer.id}
                trainer={trainer}
                bookedPlayers={bookedPlayersByCoach[trainer.id]}
                official={!!officialIds?.has(trainer.id)}
                onPress={() => onSelectTrainer?.(trainer)}
              />
            ))}

            {visibleTrainers.length === 0 && (
              <Text style={styles.emptyText}>
                {minRatingOnly
                  ? `Ningún entrenador tiene ${MIN_RATING_THRESHOLD}+ estrellas todavía.`
                  : 'Todavía ningún entrenador configuró su disponibilidad para este torneo.'}
              </Text>
            )}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

function TrainerCard({
  trainer,
  bookedPlayers,
  official,
  onPress,
}: {
  trainer: CoachSearchResult;
  bookedPlayers?: BookedPlayer[];
  official: boolean;
  onPress?: () => void;
}) {
  const metaParts = [trainer.city, trainer.specialty, `${trainer.yearsExperience} años`].filter(Boolean);
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardTopRow}>
        <TrainerAvatarPlaceholder size={60} photoUrl={trainer.photoUrl} />
        <View style={styles.cardInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.trainerName}>{trainer.name}</Text>
            {official && <ClubTagBadge />}
          </View>
          <Text style={styles.trainerMeta}>
            ★ {trainer.ratingAvg} · {metaParts.join(' · ')}
          </Text>
        </View>
        {trainer.rateAmount && trainer.rateMode && (
          <Text style={styles.price}>
            ${Number(trainer.rateAmount)} <Text style={styles.priceSuffix}>{PRICE_SUFFIX[trainer.rateMode]}</Text>
          </Text>
        )}
      </View>
      {bookedPlayers && bookedPlayers.length > 0 && (
        <View style={styles.bookedRow}>
          <Text style={styles.bookedText}>
            {bookedPlayers.length} alumno{bookedPlayers.length === 1 ? '' : 's'} ya reservado
            {bookedPlayers.length === 1 ? '' : 's'}: {bookedPlayers.map((p) => p.playerName).join(', ')}
          </Text>
        </View>
      )}
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 3,
  },
  trainerName: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '700',
  },
  price: {
    color: colors.courtBlue,
    fontSize: 14,
    fontWeight: '800',
  },
  priceSuffix: {
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '400',
  },
  trainerMeta: {
    color: colors.textDim,
    fontSize: 12,
  },
  bookedRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  bookedText: {
    color: colors.amber,
    fontSize: 11,
    lineHeight: 16,
  },
});
