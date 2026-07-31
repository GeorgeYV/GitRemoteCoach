import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AvailabilitySlotPill from '../../components/parent/AvailabilitySlotPill';
import InitialAvatar from '../../components/parent/InitialAvatar';
import StatTile from '../../components/parent/StatTile';
import TrainerAvatarPlaceholder from '../../components/parent/TrainerAvatarPlaceholder';
import VerificationRow from '../../components/parent/VerificationRow';
import { colors, radius } from '../../lib/theme';
import { mockCarlosMedinaProfile } from '../../mock/parentFlow';

export default function TrainerProfileScreen() {
  const profile = mockCarlosMedinaProfile;
  const { trainer } = profile;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <TrainerAvatarPlaceholder size={64} />
        <View style={styles.headerInfo}>
          <Text style={styles.trainerName}>{trainer.name}</Text>
          <Text style={styles.trainerMeta}>
            ★ {trainer.rating} · {trainer.reviews} reseñas
          </Text>
        </View>
        <View style={styles.priceBlock}>
          <Text style={styles.price}>
            ${trainer.price} <Text style={styles.priceSuffix}>/ partido</Text>
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Section label={`Sobre ${trainer.name.split(' ')[0]}`}>
          <Text style={styles.bio}>{profile.bio}</Text>
          <View style={styles.tagRow}>
            {profile.tags.map((tag) => (
              <View key={tag} style={styles.tagPill}>
                <Text style={styles.tagLabel}>{tag}</Text>
              </View>
            ))}
          </View>
        </Section>

        <Section label="Verificaciones">
          {profile.verifications.map((v) => (
            <VerificationRow key={v.title} title={v.title} subtitle={v.subtitle} />
          ))}
        </Section>

        <Section label="Reseñas de padres">
          <View style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
              <InitialAvatar initial={profile.review.initial} size={32} />
              <View style={styles.reviewHeaderText}>
                <Text style={styles.reviewName}>{profile.review.name}</Text>
                <Text style={styles.reviewStars}>{'★'.repeat(profile.review.stars)}</Text>
              </View>
            </View>
            <Text style={styles.reviewQuote}>“{profile.review.quote}”</Text>
          </View>
        </Section>

        <Section label="Ejemplo de reporte (anonimizado)">
          <View style={styles.statsGrid}>
            {profile.reportStats.map((stat) => (
              <StatTile key={stat.label} value={stat.value} label={stat.label} />
            ))}
          </View>
        </Section>

        <Section label="Disponibilidad para este torneo">
          <View style={styles.availabilityGrid}>
            {profile.availability.map((day) => (
              <View key={day.dayLabel} style={styles.availabilityColumn}>
                <Text style={styles.availabilityDay}>{day.dayLabel}</Text>
                <AvailabilitySlotPill label="Mañana" available={day.morningAvailable} />
                <AvailabilitySlotPill label="Tarde" available={day.afternoonAvailable} />
              </View>
            ))}
          </View>
        </Section>
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerNote}>${trainer.price} · sin costo de viáticos</Text>
        <Pressable style={styles.reserveButton}>
          <Text style={styles.reserveLabel}>Reservar con {trainer.name.split(' ')[0]}</Text>
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
    color: colors.ballLime,
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
    color: colors.ballLime,
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
    backgroundColor: colors.courtBlueDeep,
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
  reserveLabel: {
    color: colors.courtBlueDeep,
    fontSize: 15,
    fontWeight: '800',
  },
});
