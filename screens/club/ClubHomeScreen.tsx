import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import StatTile from '../../components/shared/StatTile';
import { useAuth } from '../../context/AuthContext';
import {
  ApiError,
  Club,
  ClubAdminInvitation,
  ClubAdminJoinRequestWithUserName,
  ClubSettlementWithTournamentName,
  getClub,
  inviteClubAdmin,
  listClubAdminInvitations,
  listClubAdminJoinRequests,
  listClubSettlements,
  listClubTournaments,
  respondToClubAdminJoinRequest,
  TournamentSummary,
} from '../../lib/api';
import { CLUB_TYPE_LABELS_LOWER } from '../../lib/clubType';
import { colors, radius, withOpacity } from '../../lib/theme';
import { isValidEmail } from '../../lib/validation';

const INVITATION_STATUS_LABELS: Record<ClubAdminInvitation['status'], string> = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  declined: 'Rechazada',
};

function money(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** "Administración de respaldo" (ver decisión #42 en db/schema.sql) — invitar por email a un
 * segundo administrador y aprobar/rechazar solicitudes de acceso que otros ya mandaron. Aparte
 * del resto de ClubHomeScreen porque es la única parte de la pantalla que necesita el token
 * (el resto son GETs públicos). */
function BackupAdminSection({ clubId }: { clubId: string }) {
  const { token } = useAuth();
  const [invitations, setInvitations] = useState<ClubAdminInvitation[] | null>(null);
  const [requests, setRequests] = useState<ClubAdminJoinRequestWithUserName[] | null>(null);
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function load() {
    if (!token) return;
    Promise.all([listClubAdminInvitations(token, clubId), listClubAdminJoinRequests(token, clubId)])
      .then(([invitationsResult, requestsResult]) => {
        setInvitations(invitationsResult);
        setRequests(requestsResult);
      })
      .catch(() => {
        // Sección secundaria — si falla, se deja vacía en vez de romper el resto del panel.
      });
  }

  useEffect(load, [token, clubId]);

  async function sendInvite() {
    if (!token || !isValidEmail(email.trim())) return;
    setInviting(true);
    setActionError(null);
    try {
      await inviteClubAdmin(token, clubId, email.trim());
      setEmail('');
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo enviar la invitación. Intenta de nuevo.');
    } finally {
      setInviting(false);
    }
  }

  async function respond(requestId: string, decision: 'accepted' | 'declined') {
    if (!token) return;
    setRespondingId(requestId);
    setActionError(null);
    try {
      await respondToClubAdminJoinRequest(token, requestId, decision);
      setRequests((prev) => prev?.filter((r) => r.id !== requestId) ?? null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo enviar tu respuesta. Intenta de nuevo.');
    } finally {
      setRespondingId(null);
    }
  }

  return (
    <>
      <Text style={styles.sectionLabel}>Administración de respaldo</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Invitar administrador</Text>
        <View style={styles.inviteRow}>
          <TextInput
            style={styles.inviteInput}
            placeholder="Email del administrador de respaldo"
            placeholderTextColor={colors.textDim}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Pressable style={styles.inviteButton} onPress={sendInvite} disabled={inviting || !isValidEmail(email.trim())}>
            {inviting ? <ActivityIndicator color={colors.courtBlueDeep} size="small" /> : <Ionicons name="send" size={16} color={colors.courtBlueDeep} />}
          </Pressable>
        </View>
        {actionError && <Text style={styles.actionErrorText}>{actionError}</Text>}

        {invitations && invitations.length > 0 && (
          <View style={styles.invitationList}>
            {invitations.map((inv) => (
              <View key={inv.id} style={styles.invitationRow}>
                <Text style={styles.invitationEmail}>{inv.email}</Text>
                <Text style={styles.invitationStatus}>{INVITATION_STATUS_LABELS[inv.status]}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {requests && requests.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Solicitudes de acceso</Text>
          {requests.map((req) => (
            <View key={req.id} style={styles.requestRow}>
              <View style={styles.requestInfo}>
                <Text style={styles.requestName}>{req.userName}</Text>
                <Text style={styles.requestEmail}>{req.userEmail}</Text>
              </View>
              <View style={styles.requestActions}>
                <Pressable
                  style={styles.rejectButton}
                  onPress={() => respond(req.id, 'declined')}
                  disabled={respondingId === req.id}
                >
                  <Ionicons name="close-circle-outline" size={18} color={colors.errorCoral} />
                </Pressable>
                <Pressable
                  style={styles.approveButton}
                  onPress={() => respond(req.id, 'accepted')}
                  disabled={respondingId === req.id}
                >
                  {respondingId === req.id ? (
                    <ActivityIndicator color={colors.courtBlueDeep} size="small" />
                  ) : (
                    <Ionicons name="checkmark-circle-outline" size={18} color={colors.courtBlueDeep} />
                  )}
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
    </>
  );
}

export default function ClubHomeScreen({
  clubId,
  onOpenTournaments,
  onOpenSettlements,
  onOpenProfile,
  onLogout,
  tabBar,
}: {
  clubId: string;
  onOpenTournaments: () => void;
  onOpenSettlements: () => void;
  onOpenProfile?: () => void;
  onLogout?: () => void;
  tabBar?: React.ReactNode;
}) {
  const { token } = useAuth();
  const [club, setClub] = useState<Club | null>(null);
  const [tournaments, setTournaments] = useState<TournamentSummary[] | null>(null);
  const [settlements, setSettlements] = useState<ClubSettlementWithTournamentName[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setError(null);
    Promise.all([
      getClub(clubId),
      listClubTournaments(token, clubId),
      listClubSettlements(token, clubId),
    ])
      .then(([clubResult, tournamentsResult, settlementsResult]) => {
        if (cancelled) return;
        setClub(clubResult);
        setTournaments(tournamentsResult);
        setSettlements(settlementsResult);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar el panel.');
      });
    return () => {
      cancelled = true;
    };
  }, [token, clubId]);

  if (error) {
    return (
      <SafeAreaView style={[styles.container, styles.centerState]} edges={['top', 'bottom']}>
        <Text style={styles.headerSubtitle}>{error}</Text>
        {tabBar}
      </SafeAreaView>
    );
  }

  if (!club || !tournaments || !settlements) {
    return (
      <SafeAreaView style={[styles.container, styles.centerState]} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.courtBlue} />
        {tabBar}
      </SafeAreaView>
    );
  }

  const typeLabelLower = CLUB_TYPE_LABELS_LOWER[club.type];
  const activeTournaments = tournaments.filter((t) => t.status === 'scheduled' || t.status === 'in_progress').length;
  const officialCoachCount = tournaments.reduce((sum, t) => sum + t.officialCoachCount, 0);
  const pendingCommission = tournaments.reduce((sum, t) => sum + Number(t.pendingCommissionAmount), 0);
  const paidTotal = settlements
    .filter((s) => s.status === 'paid')
    .reduce((sum, s) => sum + Number(s.totalCommissionAmount), 0);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>{club.name}</Text>
            <Text style={styles.headerSubtitle}>{club.city}</Text>
          </View>
          {onOpenProfile && (
            <Pressable style={styles.editButton} onPress={onOpenProfile}>
              <Ionicons name="pencil-outline" size={14} color={colors.textDim} />
              <Text style={styles.editButtonLabel}>Editar</Text>
            </Pressable>
          )}
        </View>

        {club.verificationStatus !== 'approved' && (
          <View style={[styles.verificationBanner, club.verificationStatus === 'rejected' && styles.verificationBannerRejected]}>
            <Ionicons
              name={club.verificationStatus === 'rejected' ? 'close-circle-outline' : 'time-outline'}
              size={18}
              color={club.verificationStatus === 'rejected' ? colors.errorCoral : colors.amber}
            />
            <Text style={styles.verificationBannerText}>
              {club.verificationStatus === 'rejected'
                ? `Tu ${typeLabelLower} no pasó la verificación. Contacta a soporte para revisar los datos enviados.`
                : `Verificación pendiente — tus torneos todavía no aparecen en la búsqueda pública hasta que un administrador de la plataforma revise tu ${typeLabelLower}.`}
            </Text>
          </View>
        )}

        <View style={styles.statGrid}>
          <StatTile value={String(activeTournaments)} label="Torneos activos" />
          <StatTile value={String(officialCoachCount)} label="Entrenadores oficiales" />
          <StatTile value={money(pendingCommission)} label="Comisión pendiente" />
          <StatTile value={money(paidTotal)} label="Liquidaciones pagadas" />
        </View>

        <Pressable style={styles.actionButton} onPress={onOpenTournaments}>
          <View style={styles.buttonContent}>
            <Ionicons name="trophy-outline" size={16} color={colors.courtBlueDeep} />
            <Text style={styles.actionButtonLabel}>Ver/Crear mis torneos</Text>
          </View>
        </Pressable>
        <Pressable style={[styles.actionButton, styles.actionButtonSecondary]} onPress={onOpenSettlements}>
          <View style={styles.buttonContent}>
            <Ionicons name="cash-outline" size={16} color={colors.lineWhite} />
            <Text style={[styles.actionButtonLabel, styles.actionButtonLabelSecondary]}>Ver liquidaciones</Text>
          </View>
        </Pressable>

        <View style={styles.backupSection}>
          <BackupAdminSection clubId={clubId} />
        </View>

        {onLogout && (
          <Pressable style={[styles.actionButton, styles.logoutButton]} onPress={onLogout}>
            <View style={styles.buttonContent}>
              <Ionicons name="log-out-outline" size={16} color={colors.errorCoral} />
              <Text style={[styles.actionButtonLabel, styles.logoutButtonLabel]}>Salir</Text>
            </View>
          </Pressable>
        )}
      </ScrollView>
      {tabBar}
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
  content: {
    padding: 20,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  verificationBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: withOpacity(colors.amber, 0.12),
    borderWidth: 1,
    borderColor: withOpacity(colors.amber, 0.35),
    borderRadius: radius,
    padding: 14,
    marginBottom: 20,
  },
  verificationBannerRejected: {
    backgroundColor: withOpacity(colors.errorCoral, 0.12),
    borderColor: withOpacity(colors.errorCoral, 0.35),
  },
  verificationBannerText: {
    flex: 1,
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  headerText: {
    flex: 1,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editButtonLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
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
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  actionButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButtonLabel: {
    color: colors.courtBlueDeep,
    fontSize: 14,
    fontWeight: '800',
  },
  actionButtonSecondary: {
    backgroundColor: colors.panelLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonLabelSecondary: {
    color: colors.lineWhite,
  },
  logoutButton: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  logoutButtonLabel: {
    color: colors.errorCoral,
  },
  backupSection: {
    marginTop: 22,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textDim,
    marginBottom: 12,
  },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    color: colors.lineWhite,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  inviteRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inviteInput: {
    flex: 1,
    backgroundColor: colors.panelLight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.lineWhite,
    fontSize: 13,
  },
  inviteButton: {
    width: 42,
    borderRadius: 14,
    backgroundColor: colors.ballLime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionErrorText: {
    color: colors.errorCoral,
    fontSize: 12,
    marginTop: 8,
  },
  invitationList: {
    marginTop: 12,
    gap: 8,
  },
  invitationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    paddingTop: 8,
  },
  invitationEmail: {
    color: colors.textSoft,
    fontSize: 12,
    flex: 1,
    marginRight: 8,
  },
  invitationStatus: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  requestInfo: {
    flex: 1,
    marginRight: 10,
  },
  requestName: {
    color: colors.lineWhite,
    fontSize: 13,
    fontWeight: '700',
  },
  requestEmail: {
    color: colors.textDim,
    fontSize: 11,
    marginTop: 1,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  rejectButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.errorCoral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.ballLime,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
