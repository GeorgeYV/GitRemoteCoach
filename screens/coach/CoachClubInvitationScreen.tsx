import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ClubTagBadge from '../../components/coach/ClubTagBadge';
import { useAuth } from '../../context/AuthContext';
import { ApiError, ClubCoachInvitationWithNames, listClubInvitations, respondClubInvitation } from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';

type Decision = 'pending' | 'accepted' | 'declined';

export default function CoachClubInvitationScreen({ coachId, onBack }: { coachId: string; onBack?: () => void }) {
  const { token } = useAuth();
  const [invitation, setInvitation] = useState<ClubCoachInvitationWithNames | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision>('pending');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoadError('No hay una sesión activa.');
      return;
    }
    let cancelled = false;
    setLoadError(null);
    listClubInvitations(token, coachId)
      .then((result) => {
        if (!cancelled) setInvitation(result[0] ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : 'No se pudo cargar tu invitación.');
      });
    return () => {
      cancelled = true;
    };
  }, [coachId, token]);

  async function respond(decisionValue: Extract<Decision, 'accepted' | 'declined'>) {
    if (!invitation || !token) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await respondClubInvitation(token, invitation.id, decisionValue);
      setDecision(decisionValue);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo enviar tu respuesta. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <SafeAreaView style={[styles.container, styles.centerState]} edges={['top', 'bottom']}>
        <Text style={styles.headerSubtitle}>{loadError}</Text>
      </SafeAreaView>
    );
  }

  if (invitation === null) {
    return (
      <SafeAreaView style={[styles.container, styles.centerState]} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.courtBlue} />
      </SafeAreaView>
    );
  }

  const invitedAtLabel = new Date(invitation.invitedAt).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Pressable style={styles.backButton} onPress={onBack}>
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Invitación de club o federación</Text>
        </View>
        <Text style={styles.headerSubtitle}>{invitedAtLabel}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.clubName}>{invitation.clubName}</Text>
          <Text style={styles.tournamentName}>{invitation.tournamentName}</Text>
          {invitation.message && <Text style={styles.message}>“{invitation.message}”</Text>}
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
        <View style={styles.footerWrap}>
          {actionError && <Text style={styles.actionErrorText}>{actionError}</Text>}
          <View style={styles.footer}>
            <Pressable style={styles.declineButton} onPress={() => respond('declined')} disabled={submitting}>
              <View style={styles.buttonContent}>
                <Ionicons name="close-circle-outline" size={17} color={colors.errorCoral} />
                <Text style={styles.declineLabel}>Rechazar</Text>
              </View>
            </Pressable>
            <Pressable style={styles.acceptButton} onPress={() => respond('accepted')} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator color={colors.courtBlueDeep} />
              ) : (
                <View style={styles.buttonContent}>
                  <Ionicons name="checkmark-circle-outline" size={17} color={colors.courtBlueDeep} />
                  <Text style={styles.acceptLabel}>Aceptar invitación</Text>
                </View>
              )}
            </Pressable>
          </View>
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
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionErrorText: {
    color: colors.errorCoral,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 2,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  backButton: {
    paddingRight: 12,
  },
  backIcon: {
    color: colors.lineWhite,
    fontSize: 20,
  },
  headerTitle: {
    color: colors.lineWhite,
    fontSize: 22,
    fontWeight: '800',
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
    color: colors.courtBlue,
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
    color: colors.courtBlue,
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
  footerWrap: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.panel,
    padding: 16,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
