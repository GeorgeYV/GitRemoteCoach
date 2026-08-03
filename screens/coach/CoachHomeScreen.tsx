import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import InitialAvatar from '../../components/shared/InitialAvatar';
import { colors, radius } from '../../lib/theme';
import {
  CoachBooking,
  mockBookingRequests,
  mockCoachActivityStats,
  mockEarningsHistory,
  PLATFORM_COMMISSION_RATE,
} from '../../mock/coachFlow';
import { mockCarlosMedinaProfile } from '../../mock/parentFlow';

const QUICK_LINKS = [
  { label: 'Disponibilidad', hint: 'Ajusta tus días y tarifa por torneo' },
  { label: 'Historial de sesiones', hint: 'Revisa partidos pasados y en curso' },
  { label: 'Ingresos', hint: 'Ve lo liberado y lo pendiente de pago' },
  { label: 'Reputación', hint: 'Reseñas y estadísticas de actividad' },
];

function money(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export default function CoachHomeScreen({
  nextBooking,
  onOpenBooking,
}: {
  nextBooking?: CoachBooking;
  onOpenBooking?: () => void;
}) {
  const { trainer } = mockCarlosMedinaProfile;
  const firstName = trainer.name.split(' ')[0];
  const pendingRequests = mockBookingRequests.length;
  const pendingEarnings = mockEarningsHistory
    .filter((e) => e.payoutStatus === 'pendiente')
    .reduce((sum, e) => sum + e.agreedRate * (1 - PLATFORM_COMMISSION_RATE), 0);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.wordmark}>Remote Coach</Text>
        <InitialAvatar initial={trainer.name[0]} size={36} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.greeting}>Hola, {firstName}</Text>
        <Text style={styles.headline}>Este es el resumen de tu actividad como entrenador</Text>

        <View style={styles.statsRow}>
          <StatChip value={String(pendingRequests)} label="Solicitudes" />
          <StatChip value={money(pendingEarnings)} label="Por liberar" />
          <StatChip value={`★ ${trainer.rating}`} label="Reputación" />
        </View>

        <Text style={styles.sectionLabel}>Próxima sesión</Text>
        {nextBooking ? (
          <Pressable style={styles.nextCard} onPress={onOpenBooking}>
            <View style={styles.nextTopRow}>
              <InitialAvatar initial={nextBooking.playerInitial} size={44} />
              <View style={styles.nextInfo}>
                <Text style={styles.nextPlayerName}>{nextBooking.playerName}</Text>
                <Text style={styles.nextMeta}>{nextBooking.category}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </View>
            <View style={styles.nextDivider} />
            <Text style={styles.nextLine}>
              {nextBooking.date} · {nextBooking.time}
            </Text>
            <Text style={styles.nextLine}>{nextBooking.venue}</Text>
          </Pressable>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No tienes sesiones confirmadas por ahora.</Text>
          </View>
        )}

        <Text style={styles.sectionLabel}>Accesos rápidos</Text>
        <View style={styles.linkList}>
          {QUICK_LINKS.map((link) => (
            <Pressable key={link.label} style={styles.linkRow}>
              <View style={styles.linkInfo}>
                <Text style={styles.linkLabel}>{link.label}</Text>
                <Text style={styles.linkHint}>{link.hint}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatChip({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statChip}>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
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
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  statChip: {
    flex: 1,
    backgroundColor: colors.panelLight,
    borderRadius: radius,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  statValue: {
    color: colors.ballLime,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  statLabel: {
    color: colors.textDim,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  sectionLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  nextCard: {
    backgroundColor: colors.panelLight,
    borderRadius: radius,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nextTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nextInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  nextPlayerName: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  nextMeta: {
    color: colors.textDim,
    fontSize: 12,
  },
  nextDivider: {
    height: 1,
    backgroundColor: colors.borderSoft,
    marginVertical: 14,
  },
  nextLine: {
    color: colors.textSoft,
    fontSize: 13,
    marginBottom: 3,
  },
  chevron: {
    color: colors.textDim,
    fontSize: 20,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 18,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    color: colors.textDim,
    fontSize: 13,
    textAlign: 'center',
  },
  linkList: {
    gap: 10,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.panel,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  linkInfo: {
    flex: 1,
    marginRight: 10,
  },
  linkLabel: {
    color: colors.lineWhite,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  linkHint: {
    color: colors.textDim,
    fontSize: 12,
  },
});
