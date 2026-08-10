import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import InitialAvatar from '../../components/shared/InitialAvatar';
import { ClubCoachInvitationWithNames } from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';
import { CoachBooking } from '../../mock/coachFlow';

const QUICK_LINKS = [
  { key: 'availability', label: 'Disponibilidad', hint: 'Ajusta tus días y tarifa por torneo' },
  { key: 'sessions', label: 'Historial de sesiones', hint: 'Revisa partidos pasados y en curso' },
  { key: 'earnings', label: 'Ingresos', hint: 'Ve lo liberado y lo pendiente de pago' },
  { key: 'reputation', label: 'Reputación', hint: 'Reseñas y estadísticas de actividad' },
] as const;

function money(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export default function CoachHomeScreen({
  coachName,
  rating,
  pendingRequests,
  pendingEarnings,
  nextBooking,
  pendingInvitation,
  onOpenBooking,
  onOpenRequests,
  onOpenAvailability,
  onOpenSessions,
  onOpenEarnings,
  onOpenReputation,
  onOpenInvitation,
}: {
  coachName: string;
  rating: string;
  pendingRequests: number;
  pendingEarnings: number;
  nextBooking?: CoachBooking;
  pendingInvitation?: ClubCoachInvitationWithNames | null;
  onOpenBooking?: () => void;
  onOpenRequests?: () => void;
  onOpenAvailability?: () => void;
  onOpenSessions?: () => void;
  onOpenEarnings?: () => void;
  onOpenReputation?: () => void;
  onOpenInvitation?: () => void;
}) {
  const quickLinkHandlers: Record<(typeof QUICK_LINKS)[number]['key'], (() => void) | undefined> = {
    availability: onOpenAvailability,
    sessions: onOpenSessions,
    earnings: onOpenEarnings,
    reputation: onOpenReputation,
  };
  const firstName = coachName.split(' ')[0];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.wordmark}>Remote Coach</Text>
        <InitialAvatar initial={coachName[0]} size={36} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.greeting}>Hola, {firstName}</Text>
        <Text style={styles.headline}>Este es el resumen de tu actividad como entrenador</Text>

        <View style={styles.statsRow}>
          <StatChip value={String(pendingRequests)} label="Solicitudes" onPress={onOpenRequests} />
          <StatChip value={money(pendingEarnings)} label="Por liberar" onPress={onOpenEarnings} />
          <StatChip value={`★ ${rating}`} label="Reputación" onPress={onOpenReputation} />
        </View>

        {pendingInvitation && (
          <Pressable style={styles.invitationCard} onPress={onOpenInvitation}>
            <View style={styles.invitationTextWrap}>
              <Text style={styles.invitationTitle}>Invitación de {pendingInvitation.clubName}</Text>
              <Text style={styles.invitationMeta}>Entrenador oficial para {pendingInvitation.tournamentName}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}

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
            <Pressable key={link.key} style={styles.linkRow} onPress={quickLinkHandlers[link.key]}>
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

function StatChip({ value, label, onPress }: { value: string; label: string; onPress?: () => void }) {
  return (
    <Pressable style={styles.statChip} onPress={onPress}>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
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
  invitationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withOpacity(colors.ballLime, 0.1),
    borderRadius: radius,
    borderWidth: 1,
    borderColor: withOpacity(colors.ballLime, 0.35),
    padding: 16,
    marginBottom: 24,
  },
  invitationTextWrap: {
    flex: 1,
    marginRight: 8,
  },
  invitationTitle: {
    color: colors.ballLime,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  invitationMeta: {
    color: colors.textSoft,
    fontSize: 12,
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
