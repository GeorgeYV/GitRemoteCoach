import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import InitialAvatar from '../../components/shared/InitialAvatar';
import { colors, radius, withOpacity } from '../../lib/theme';
import { mockPreMatchReminder } from '../../mock/coachFlow';

const URGENT_MINUTES_THRESHOLD = 15;

function usePreMatchCountdown(initialMinutes: number): number {
  const [minutes, setMinutes] = useState(initialMinutes);

  useEffect(() => {
    const interval = setInterval(() => {
      setMinutes((m) => Math.max(0, m - 1));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  return minutes;
}

export default function CoachPreMatchReminderScreen({ onStartCapture }: { onStartCapture?: () => void }) {
  const reminder = mockPreMatchReminder;
  const minutesLeft = usePreMatchCountdown(reminder.minutesUntilMatch);
  const urgent = minutesLeft <= URGENT_MINUTES_THRESHOLD;
  const startingNow = minutesLeft <= 0;
  const playerFirstName = reminder.playerName.split(' ')[0];
  const parentFirstName = reminder.parentName.split(' ')[0];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.notifCaption}>Así llega a tu teléfono</Text>
        <View style={styles.notifCard}>
          <View style={styles.notifIcon}>
            <Text style={styles.notifIconLabel}>RC</Text>
          </View>
          <View style={styles.notifTextWrap}>
            <View style={styles.notifTitleRow}>
              <Text style={styles.notifApp}>Remote Coach</Text>
              <Text style={styles.notifTime}>ahora</Text>
            </View>
            <Text style={styles.notifTitle}>Tu partido con {playerFirstName} empieza pronto</Text>
            <Text style={styles.notifBody}>
              {reminder.time} · {reminder.courtLabel}, {reminder.venue}
            </Text>
          </View>
        </View>

        <View style={[styles.countdownCard, urgent && styles.countdownCardUrgent]}>
          <Text style={[styles.countdownEyebrow, urgent && styles.countdownEyebrowUrgent]}>
            {startingNow ? 'Tu partido está por comenzar' : 'Tu partido comienza en'}
          </Text>
          {!startingNow && (
            <Text style={[styles.countdownValue, urgent && styles.countdownValueUrgent]}>{minutesLeft} min</Text>
          )}
          <Text style={styles.countdownMeta}>
            {reminder.date} · {reminder.time}
          </Text>
        </View>

        <Section label="Lugar exacto">
          <View style={styles.locationCard}>
            <View style={styles.locationAccent} />
            <View style={styles.locationTextWrap}>
              <Text style={styles.locationVenue}>{reminder.venue}</Text>
              <Text style={styles.locationCourt}>{reminder.courtLabel}</Text>
              <Text style={styles.locationDirections}>{reminder.meetingPointDetail}</Text>
            </View>
          </View>
        </Section>

        <Section label="Jugador">
          <View style={styles.playerCard}>
            <View style={styles.playerTopRow}>
              <InitialAvatar initial={reminder.playerInitial} size={48} />
              <View style={styles.playerInfo}>
                <Text style={styles.playerName}>{reminder.playerName}</Text>
                <Text style={styles.playerMeta}>{reminder.category}</Text>
                <Text style={styles.parentMeta}>Padre/madre: {reminder.parentName}</Text>
              </View>
            </View>
            {reminder.playerNote && <Text style={styles.playerNote}>“{reminder.playerNote}”</Text>}
          </View>
        </Section>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.chatButton}>
          <Text style={styles.chatButtonLabel}>Abrir chat con {parentFirstName}</Text>
        </Pressable>
        {onStartCapture && (
          <Pressable style={styles.captureButton} onPress={onStartCapture}>
            <Text style={styles.captureButtonLabel}>Iniciar captura en vivo</Text>
          </Pressable>
        )}
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
  content: {
    padding: 20,
    paddingBottom: 24,
  },
  notifCaption: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
    marginBottom: 10,
  },
  notifCard: {
    flexDirection: 'row',
    backgroundColor: colors.panelLight,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  notifIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.ballLime,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  notifIconLabel: {
    color: colors.courtBlueDeep,
    fontSize: 12,
    fontWeight: '800',
  },
  notifTextWrap: {
    flex: 1,
  },
  notifTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  notifApp: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
  },
  notifTime: {
    color: colors.textDim,
    fontSize: 11,
  },
  notifTitle: {
    color: colors.lineWhite,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  notifBody: {
    color: colors.textSoft,
    fontSize: 12,
  },
  countdownCard: {
    backgroundColor: withOpacity(colors.ballLime, 0.1),
    borderRadius: radius,
    borderWidth: 1.5,
    borderColor: colors.ballLime,
    paddingVertical: 22,
    alignItems: 'center',
    marginBottom: 26,
  },
  countdownCardUrgent: {
    backgroundColor: withOpacity(colors.errorCoral, 0.12),
    borderColor: colors.errorCoral,
  },
  countdownEyebrow: {
    color: colors.ballLime,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  countdownEyebrowUrgent: {
    color: colors.errorCoral,
  },
  countdownValue: {
    color: colors.lineWhite,
    fontSize: 40,
    fontWeight: '800',
    marginBottom: 6,
  },
  countdownValueUrgent: {
    color: colors.errorCoral,
  },
  countdownMeta: {
    color: colors.textDim,
    fontSize: 12,
  },
  section: {
    marginBottom: 22,
  },
  sectionLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  locationCard: {
    flexDirection: 'row',
    backgroundColor: colors.panel,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  locationAccent: {
    width: 5,
    backgroundColor: colors.ballLime,
  },
  locationTextWrap: {
    flex: 1,
    padding: 16,
  },
  locationVenue: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  locationCourt: {
    color: colors.ballLime,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  locationDirections: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  playerCard: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  playerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  playerName: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  playerMeta: {
    color: colors.textSoft,
    fontSize: 12,
    marginBottom: 2,
  },
  parentMeta: {
    color: colors.textDim,
    fontSize: 12,
  },
  playerNote: {
    color: colors.textDim,
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 18,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.courtBlueDeep,
    padding: 16,
    gap: 10,
  },
  chatButton: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 15,
    alignItems: 'center',
  },
  chatButtonLabel: {
    color: colors.lineWhite,
    fontSize: 14,
    fontWeight: '700',
  },
  captureButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 16,
    alignItems: 'center',
  },
  captureButtonLabel: {
    color: colors.courtBlueDeep,
    fontSize: 15,
    fontWeight: '800',
  },
});
