import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import InitialAvatar from '../../components/shared/InitialAvatar';
import { ClubCoachInvitationWithNames } from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';
import { CoachBooking } from '../../mock/coachFlow';

// "Mi perfil"/"Disponibilidad"/"Ingresos" ya viven en CoachTabBar (barra de abajo) — solo quedan
// acá los accesos que la barra no cubre, para no duplicar el mismo destino en dos lugares.
const QUICK_LINKS = [
  { key: 'configuredTournaments', label: 'Mis torneos con disponibilidad', hint: 'Revisa o edita lo que ya configuraste' },
  // "Sesiones", no "Historial" — el nombre viejo sonaba a solo pasado (aunque el hint ya
  // aclaraba "y en curso"), y la propia pantalla a la que lleva se llama "Sesiones", no
  // "Historial" (ver CoachSessionHistoryScreen#headerTitle).
  { key: 'sessions', label: 'Sesiones', hint: 'Revisa partidos pasados y en curso' },
  { key: 'reputation', label: 'Reputación', hint: 'Reseñas y estadísticas de actividad' },
] as const;

function money(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** "faltan N d" con color según urgencia — mismo criterio que CoachTournamentSearchScreen/
 * ParentHomeScreen, null si la sesión ya empezó. */
function daysUntilCountdown(matchDatetime: string): { text: string; color: string } | null {
  const days = Math.ceil((new Date(matchDatetime).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return null;
  const color = days < 7 ? colors.errorCoral : days < 14 ? colors.amber : colors.ballLime;
  return { text: `faltan ${days} d`, color };
}

export default function CoachHomeScreen({
  coachName,
  rating,
  pendingRequests,
  pendingEarnings,
  nextSessions,
  upcomingCount,
  pendingInvitation,
  suspendedMatchPlayerName,
  onOpenSuspendedMatch,
  onOpenBooking,
  onOpenRequests,
  onOpenSessions,
  onOpenEarnings,
  onOpenReputation,
  onOpenInvitation,
  onOpenAvailability,
  onOpenConfiguredTournaments,
  configuredTournamentsCount = 0,
  onLogout,
  tabBar,
}: {
  coachName: string;
  rating: string;
  pendingRequests: number;
  pendingEarnings: number;
  /** Sesiones confirmadas que caen en la fecha más próxima — puede ser más de una. */
  nextSessions?: CoachBooking[];
  /** Total de sesiones próximas (todas las fechas), para el link "Ver todas". */
  upcomingCount?: number;
  pendingInvitation?: ClubCoachInvitationWithNames | null;
  suspendedMatchPlayerName?: string;
  onOpenSuspendedMatch?: () => void;
  onOpenBooking?: (bookingId: string) => void;
  onOpenRequests?: () => void;
  onOpenSessions?: () => void;
  onOpenEarnings?: () => void;
  onOpenReputation?: () => void;
  onOpenInvitation?: () => void;
  /** "Explora torneos" (ver más abajo) — guía a un coach sin solicitudes todavía a la pestaña
   * Disponibilidad, que arranca en CoachTournamentSearchScreen (buscar/elegir torneo). */
  onOpenAvailability?: () => void;
  /** "Mis torneos con disponibilidad" en Accesos rápidos — mismo destino que onOpenAvailability
   * pero con el filtro "Mi disponibilidad" ya activado (ver CoachTournamentSearchScreen). */
  onOpenConfiguredTournaments?: () => void;
  /** Píldora con la cantidad, en el mismo link — 0 no muestra nada (ver QUICK_LINKS.map). */
  configuredTournamentsCount?: number;
  onLogout?: () => void;
  tabBar?: React.ReactNode;
}) {
  const quickLinkHandlers: Record<(typeof QUICK_LINKS)[number]['key'], (() => void) | undefined> = {
    configuredTournaments: onOpenConfiguredTournaments,
    sessions: onOpenSessions,
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
        <Text style={styles.greeting}>Hola coach, {firstName}</Text>
        <Text style={styles.headline}>Resumen de tu actividad</Text>

        {suspendedMatchPlayerName && (
          <Pressable style={styles.suspendedBanner} onPress={onOpenSuspendedMatch}>
            <View style={styles.suspendedTextWrap}>
              <Text style={styles.suspendedTitle}>Partido suspendido</Text>
              <Text style={styles.suspendedMeta}>Con {suspendedMatchPlayerName} · toca para reanudar</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}

        <View style={styles.statsRow}>
          <StatChip
            value={String(pendingRequests)}
            label="Solicitudes"
            onPress={onOpenRequests}
            urgent={pendingRequests > 0}
          />
          <StatChip value={money(pendingEarnings)} label="Por liberar" onPress={onOpenEarnings} />
          <StatChip value={`★ ${rating}`} label="Reputación" onPress={onOpenReputation} />
        </View>

        {pendingRequests === 0 && onOpenAvailability && (
          <Pressable style={styles.guideBanner} onPress={onOpenAvailability}>
            <View style={styles.guideTextWrap}>
              <Text style={styles.guideTitle}>Explora torneos disponibles</Text>
              <Text style={styles.guideMeta}>
                Elige un torneo y define tu disponibilidad y tarifa para empezar a recibir solicitudes.
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}

        {pendingInvitation && (
          <Pressable style={styles.invitationCard} onPress={onOpenInvitation}>
            <View style={styles.invitationTextWrap}>
              <Text style={styles.invitationTitle}>Invitación de {pendingInvitation.clubName}</Text>
              <Text style={styles.invitationMeta}>Entrenador oficial para {pendingInvitation.tournamentName}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}

        {nextSessions && nextSessions.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>{nextSessions.length > 1 ? 'Próximas sesiones' : 'Próxima sesión'}</Text>
            <View style={styles.nextGroup}>
            {nextSessions.map((session) => {
              const countdown = daysUntilCountdown(session.matchDatetime);
              return (
                <Pressable key={session.id} style={styles.nextCard} onPress={() => onOpenBooking?.(session.id)}>
                  <View style={styles.nextTopRow}>
                    <InitialAvatar initial={session.playerInitial} size={44} />
                    <View style={styles.nextInfo}>
                      <Text style={styles.nextPlayerName} numberOfLines={1}>
                        {session.playerName}
                      </Text>
                      <Text style={styles.nextMeta}>{session.category}</Text>
                    </View>
                    {session.hasUnreadMessages && (
                      <View style={styles.unreadPill}>
                        <Ionicons name="chatbubble-ellipses" size={12} color={colors.bg} />
                        <Text style={styles.unreadPillLabel}>Nuevo mensaje</Text>
                      </View>
                    )}
                    <Text style={styles.chevron}>›</Text>
                  </View>
                  <View style={styles.nextDivider} />
                  <View style={styles.nextDateRow}>
                    <Text style={[styles.nextLine, styles.nextDateText]}>
                      {session.date}
                      {session.time ? ` · ${session.time}` : ''}
                    </Text>
                    {countdown && (
                      <Text style={[styles.countdown, { color: countdown.color }]}>{countdown.text}</Text>
                    )}
                  </View>
                  <Text style={styles.nextLine}>
                    {session.venue}
                    {session.city ? ` · ${session.city}` : ''}
                  </Text>
                </Pressable>
              );
            })}
              {!!upcomingCount && upcomingCount > nextSessions.length && (
                <Pressable style={styles.seeAllRow} onPress={onOpenSessions}>
                  <Text style={styles.seeAllLabel}>Ver todas ({upcomingCount})</Text>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              )}
            </View>
          </>
        )}

        <Text style={styles.sectionLabel}>Accesos rápidos</Text>
        <View style={styles.linkList}>
          {QUICK_LINKS.map((link) => (
            <Pressable key={link.key} style={styles.linkRow} onPress={quickLinkHandlers[link.key]}>
              <View style={styles.linkInfo}>
                <Text style={styles.linkLabel}>{link.label}</Text>
                <Text style={styles.linkHint}>{link.hint}</Text>
              </View>
              {link.key === 'configuredTournaments' && configuredTournamentsCount > 0 && (
                <View style={styles.countPill}>
                  <Text style={styles.countPillLabel}>{configuredTournamentsCount}</Text>
                </View>
              )}
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
          {onLogout && (
            <Pressable style={styles.linkRow} onPress={onLogout}>
              <View style={styles.linkInfo}>
                <Text style={[styles.linkLabel, styles.logoutLabel]}>Salir</Text>
                <Text style={styles.linkHint}>Cerrar tu sesión actual</Text>
              </View>
              <Ionicons name="log-out-outline" size={18} color={colors.errorCoral} />
            </Pressable>
          )}
        </View>
      </ScrollView>
      {tabBar}
    </SafeAreaView>
  );
}

function StatChip({
  value,
  label,
  onPress,
  urgent,
}: {
  value: string;
  label: string;
  onPress?: () => void;
  urgent?: boolean;
}) {
  return (
    <Pressable style={[styles.statChip, urgent && styles.statChipUrgent]} onPress={onPress}>
      <Ionicons
        name="chevron-forward"
        size={12}
        color={urgent ? colors.amber : colors.textDim}
        style={styles.statChevron}
      />
      <Text style={[styles.statValue, urgent && styles.statValueUrgent]} numberOfLines={1}>
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
    color: colors.courtBlue,
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
  suspendedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withOpacity(colors.errorCoral, 0.12),
    borderRadius: radius,
    borderWidth: 1,
    borderColor: withOpacity(colors.errorCoral, 0.4),
    padding: 16,
    marginBottom: 20,
  },
  suspendedTextWrap: {
    flex: 1,
    marginRight: 8,
  },
  suspendedTitle: {
    color: colors.errorCoral,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  suspendedMeta: {
    color: colors.textSoft,
    fontSize: 12,
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
    position: 'relative',
  },
  statChevron: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  statValue: {
    color: colors.courtBlue,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  statChipUrgent: {
    backgroundColor: withOpacity(colors.amber, 0.14),
    borderColor: withOpacity(colors.amber, 0.4),
  },
  statValueUrgent: {
    color: colors.amber,
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
  guideBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panelLight,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 24,
  },
  guideTextWrap: {
    flex: 1,
    marginRight: 8,
  },
  guideTitle: {
    color: colors.lineWhite,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  guideMeta: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
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
    color: colors.courtBlue,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  invitationMeta: {
    color: colors.textSoft,
    fontSize: 12,
  },
  nextGroup: {
    marginBottom: 24,
    gap: 12,
  },
  nextCard: {
    backgroundColor: colors.panelLight,
    borderRadius: radius,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  seeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  seeAllLabel: {
    color: colors.courtBlue,
    fontSize: 13,
    fontWeight: '700',
    marginRight: 4,
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
  unreadPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.amber,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 4,
    marginRight: 8,
  },
  unreadPillLabel: {
    color: colors.bg,
    fontSize: 10,
    fontWeight: '800',
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
  nextDateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 3,
  },
  nextDateText: {
    marginBottom: 0,
  },
  countdown: {
    fontSize: 12,
    fontWeight: '800',
  },
  chevron: {
    color: colors.textDim,
    fontSize: 20,
    fontWeight: '700',
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
  countPill: {
    backgroundColor: withOpacity(colors.ballLime, 0.16),
    borderRadius: 10,
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 3,
    alignItems: 'center',
    marginRight: 6,
  },
  countPillLabel: {
    color: colors.courtBlue,
    fontSize: 11,
    fontWeight: '800',
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
  logoutLabel: {
    color: colors.errorCoral,
  },
});
