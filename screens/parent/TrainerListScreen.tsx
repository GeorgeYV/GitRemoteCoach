import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TrainerAvatarPlaceholder from '../../components/shared/TrainerAvatarPlaceholder';
import VerificationBadgePill from '../../components/parent/VerificationBadgePill';
import { colors, radius } from '../../lib/theme';
import { FILTER_CHIPS, mockFeaturedTournament, mockTrainers, Trainer } from '../../mock/parentFlow';

export default function TrainerListScreen() {
  const [activeChips, setActiveChips] = useState<Record<string, boolean>>({});

  function toggleChip(chip: string) {
    setActiveChips((prev) => ({ ...prev, [chip]: !prev[chip] }));
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.tournamentName} numberOfLines={1}>
            {mockFeaturedTournament.name}
          </Text>
          <Text style={styles.tournamentMeta} numberOfLines={1}>
            {mockFeaturedTournament.venue} · {mockFeaturedTournament.dates}
          </Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow} contentContainerStyle={styles.chipsContent}>
        {FILTER_CHIPS.map((chip) => {
          const active = !!activeChips[chip];
          return (
            <Pressable key={chip} onPress={() => toggleChip(chip)} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{chip}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={styles.resultsLabel}>{mockTrainers.length} entrenadores disponibles</Text>

      <ScrollView contentContainerStyle={styles.list}>
        {mockTrainers.map((trainer) => (
          <TrainerCard key={trainer.id} trainer={trainer} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function TrainerCard({ trainer }: { trainer: Trainer }) {
  return (
    <Pressable style={styles.card}>
      <View style={styles.cardTopRow}>
        <TrainerAvatarPlaceholder size={60} />
        <View style={styles.cardInfo}>
          <Text style={styles.trainerName}>{trainer.name}</Text>
          <Text style={styles.trainerMeta}>
            ★ {trainer.rating} · {trainer.reviews} reseñas · {trainer.category}
          </Text>
        </View>
        <View style={styles.priceBlock}>
          <Text style={styles.price}>${trainer.price}</Text>
          <Text style={styles.priceSuffix}>por partido</Text>
        </View>
      </View>
      <View style={styles.badgeRow}>
        {trainer.badges.map((badge) => (
          <VerificationBadgePill key={badge} label={badge} />
        ))}
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
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  chipsContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
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
    marginBottom: 12,
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
  priceBlock: {
    alignItems: 'flex-end',
  },
  price: {
    color: colors.ballLime,
    fontSize: 17,
    fontWeight: '800',
  },
  priceSuffix: {
    color: colors.textDim,
    fontSize: 10,
    marginTop: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
});
