import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ClubTagBadge from '../../components/coach/ClubTagBadge';
import { colors, radius, withOpacity } from '../../lib/theme';
import { mockPendingClubInvitation } from '../../mock/coachFlow';

type Decision = 'pending' | 'accepted' | 'declined';

export default function CoachClubInvitationScreen() {
  const invitation = mockPendingClubInvitation;
  const [decision, setDecision] = useState<Decision>('pending');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Invitación de club</Text>
        <Text style={styles.headerSubtitle}>{invitation.invitedAt}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.clubName}>{invitation.clubName}</Text>
          <Text style={styles.tournamentName}>{invitation.tournamentName}</Text>
          <Text style={styles.message}>“{invitation.message}”</Text>
        </View>

        <View style={styles.explainerBox}>
          <Text style={styles.explainerText}>
            Si aceptas, aparecerás como entrenador oficial de {invitation.clubName} para{' '}
            {invitation.tournamentName} — los padres lo verán como una insignia en tu perfil. No tienes que
            configurar nada más: tu disponibilidad y tarifa para ese torneo siguen siendo tuyas.
          </Text>
        </View>

        {decision === 'accepted' && (
          <View style={styles.resultBox}>
            <Text style={styles.resultTitle}>¡Listo!</Text>
            <Text style={styles.resultText}>
              Ya apareces como entrenador oficial de {invitation.clubName} en {invitation.tournamentName}.
            </Text>
            <ClubTagBadge clubName={invitation.clubName} />
          </View>
        )}

        {decision === 'declined' && (
          <View style={styles.resultBoxNeutral}>
            <Text style={styles.resultTextNeutral}>
              Invitación rechazada. Puedes seguir participando en {invitation.tournamentName} como entrenador
              independiente, sin ningún cambio en tu perfil.
            </Text>
          </View>
        )}
      </ScrollView>

      {decision === 'pending' && (
        <View style={styles.footer}>
          <Pressable style={styles.declineButton} onPress={() => setDecision('declined')}>
            <Text style={styles.declineLabel}>Rechazar</Text>
          </Pressable>
          <Pressable style={styles.acceptButton} onPress={() => setDecision('accepted')}>
            <Text style={styles.acceptLabel}>Aceptar invitación</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  headerTitle: {
    color: colors.lineWhite,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  headerSubtitle: {
    color: colors.textDim,
    fontSize: 13,
  },
  content: {
    padding: 20,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 18,
  },
  clubName: {
    color: colors.lineWhite,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  tournamentName: {
    color: colors.ballLime,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 14,
  },
  message: {
    color: colors.textSoft,
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 19,
  },
  explainerBox: {
    backgroundColor: colors.panelLight,
    borderRadius: radius,
    padding: 16,
  },
  explainerText: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  resultBox: {
    backgroundColor: withOpacity(colors.ballLime, 0.1),
    borderRadius: radius,
    borderWidth: 1,
    borderColor: withOpacity(colors.ballLime, 0.35),
    padding: 18,
    marginTop: 18,
    alignItems: 'flex-start',
    gap: 10,
  },
  resultTitle: {
    color: colors.ballLime,
    fontSize: 15,
    fontWeight: '800',
  },
  resultText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  resultBoxNeutral: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginTop: 18,
  },
  resultTextNeutral: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.courtBlueDeep,
    padding: 16,
  },
  declineButton: {
    flex: 1,
    borderRadius: radius,
    borderWidth: 1.5,
    borderColor: colors.errorCoral,
    paddingVertical: 16,
    alignItems: 'center',
  },
  declineLabel: {
    color: colors.errorCoral,
    fontSize: 14,
    fontWeight: '800',
  },
  acceptButton: {
    flex: 1,
    borderRadius: radius,
    backgroundColor: colors.ballLime,
    paddingVertical: 16,
    alignItems: 'center',
  },
  acceptLabel: {
    color: colors.courtBlueDeep,
    fontSize: 14,
    fontWeight: '800',
  },
});
