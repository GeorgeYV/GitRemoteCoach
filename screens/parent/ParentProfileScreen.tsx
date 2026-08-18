import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ParentTabBar from '../../components/parent/ParentTabBar';
import IconTextInput from '../../components/shared/IconTextInput';
import InitialAvatar from '../../components/shared/InitialAvatar';
import { useAuth } from '../../context/AuthContext';
import { ApiError, listPlayers, Player } from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';
import { COUNTRY_LABELS } from '../../mock/coachFlow';
import PlayerRegistrationScreen from './PlayerRegistrationScreen';

const AGE_CATEGORY_LABELS: Record<string, string> = {
  U10: 'Sub-10',
  U12: 'Sub-12',
  U14: 'Sub-14',
  U16: 'Sub-16',
  U18: 'Sub-18',
};

export default function ParentProfileScreen() {
  const { user, token, logout, updateProfile } = useAuth();
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRegistration, setShowRegistration] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('No hay una sesión activa.');
      return;
    }
    let cancelled = false;
    setError(null);
    listPlayers(token)
      .then((result) => {
        if (!cancelled) setPlayers(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'No se pudieron cargar tus jugadores.');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const firstInitial = user?.fullName[0] ?? '?';
  const canSaveProfile = nameInput.trim().length > 0 && !savingProfile;

  function startEditingProfile() {
    setNameInput(user?.fullName ?? '');
    setPhoneInput(user?.phone ?? '');
    setProfileError(null);
    setEditingProfile(true);
  }

  async function handleSaveProfile() {
    setSavingProfile(true);
    setProfileError(null);
    try {
      await updateProfile({ fullName: nameInput.trim(), phone: phoneInput.trim() || undefined });
      setEditingProfile(false);
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : 'No se pudo actualizar tu perfil.');
    } finally {
      setSavingProfile(false);
    }
  }

  if (showRegistration || editingPlayer) {
    return (
      <PlayerRegistrationScreen
        player={editingPlayer ?? undefined}
        onBack={() => {
          setShowRegistration(false);
          setEditingPlayer(null);
        }}
        onSubmit={(player) => {
          setPlayers((prev) =>
            editingPlayer ? (prev?.map((p) => (p.id === player.id ? player : p)) ?? null) : [...(prev ?? []), player],
          );
          setShowRegistration(false);
          setEditingPlayer(null);
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Perfil</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileCard}>
          <InitialAvatar initial={firstInitial} size={56} />
          <View style={styles.profileInfo}>
            {editingProfile ? (
              <>
                <IconTextInput
                  icon="person-outline"
                  placeholder="Nombre completo"
                  value={nameInput}
                  onChangeText={setNameInput}
                  containerStyle={styles.profileInput}
                />
                <IconTextInput
                  icon="call-outline"
                  placeholder="Teléfono (opcional)"
                  value={phoneInput}
                  onChangeText={setPhoneInput}
                  keyboardType="phone-pad"
                  containerStyle={styles.profileInputLast}
                />
              </>
            ) : (
              <>
                <Text style={styles.profileName}>{user?.fullName}</Text>
                <View style={styles.profileEmailRow}>
                  <Ionicons name="mail-outline" size={14} color={colors.textDim} />
                  <Text style={styles.profileEmail}>{user?.email}</Text>
                </View>
                {user?.phone && (
                  <View style={styles.profileEmailRow}>
                    <Ionicons name="call-outline" size={14} color={colors.textDim} />
                    <Text style={styles.profileEmail}>{user.phone}</Text>
                  </View>
                )}
              </>
            )}
          </View>
          {!editingProfile && (
            <Pressable style={styles.editButton} onPress={startEditingProfile}>
              <Ionicons name="pencil-outline" size={16} color={colors.textDim} />
            </Pressable>
          )}
        </View>

        {editingProfile && (
          <View style={styles.profileEditFooter}>
            {profileError && <Text style={styles.errorText}>{profileError}</Text>}
            <View style={styles.profileEditActions}>
              <Pressable style={styles.cancelButton} onPress={() => setEditingProfile(false)}>
                <Text style={styles.cancelLabel}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.saveProfileButton, !canSaveProfile && styles.submitButtonDisabled]}
                disabled={!canSaveProfile}
                onPress={handleSaveProfile}
              >
                {savingProfile ? (
                  <ActivityIndicator color={colors.courtBlueDeep} />
                ) : (
                  <Text style={styles.saveProfileLabel}>Guardar</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        <Section label="Jugadores registrados">
          {error ? (
            <Text style={styles.emptyText}>{error}</Text>
          ) : !players ? (
            <ActivityIndicator color={colors.courtBlue} />
          ) : players.length === 0 ? (
            <Text style={styles.emptyText}>Todavía no registraste a ningún jugador.</Text>
          ) : (
            <View style={styles.playerList}>
              {players.map((player) => (
                <View key={player.id} style={styles.playerRow}>
                  <View style={styles.playerIcon}>
                    <Ionicons name="person-outline" size={16} color={colors.courtBlue} />
                  </View>
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName}>{player.fullName}</Text>
                    <Text style={styles.playerMeta}>
                      {AGE_CATEGORY_LABELS[player.ageCategory] ?? player.ageCategory} · {player.birthDate}
                      {player.country ? ` · ${COUNTRY_LABELS[player.country]}` : ''}
                    </Text>
                  </View>
                  <Pressable style={styles.editButton} onPress={() => setEditingPlayer(player)}>
                    <Ionicons name="pencil-outline" size={16} color={colors.textDim} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          <Pressable style={styles.addPlayerButton} onPress={() => setShowRegistration(true)}>
            <Ionicons name="add-circle-outline" size={18} color={colors.courtBlue} />
            <Text style={styles.addPlayerLabel}>Agregar jugador</Text>
          </Pressable>
        </Section>

        <Pressable style={styles.logoutButton} onPress={logout}>
          <Ionicons name="log-out-outline" size={17} color={colors.errorCoral} />
          <Text style={styles.logoutLabel}>Cerrar sesión</Text>
        </Pressable>
      </ScrollView>

      <ParentTabBar active="perfil" />
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
  },
  content: {
    padding: 20,
    paddingBottom: 24,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 26,
  },
  profileInfo: {
    flex: 1,
    marginLeft: 14,
  },
  profileName: {
    color: colors.lineWhite,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  profileEmailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  profileEmail: {
    color: colors.textDim,
    fontSize: 13,
  },
  profileInput: {
    marginBottom: 8,
  },
  profileInputLast: {
    marginBottom: 0,
  },
  profileEditFooter: {
    marginTop: -14,
    marginBottom: 26,
  },
  errorText: {
    color: colors.errorCoral,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
  },
  profileEditActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelLabel: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
  },
  saveProfileButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: radius,
    backgroundColor: colors.ballLime,
  },
  submitButtonDisabled: {
    backgroundColor: withOpacity(colors.ballLime, 0.3),
  },
  saveProfileLabel: {
    color: colors.courtBlueDeep,
    fontSize: 13,
    fontWeight: '800',
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
  playerList: {
    gap: 10,
  },
  addPlayerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    paddingVertical: 12,
    marginTop: 12,
  },
  addPlayerLabel: {
    color: colors.courtBlue,
    fontSize: 13,
    fontWeight: '700',
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  playerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: withOpacity(colors.ballLime, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    color: colors.lineWhite,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  playerMeta: {
    color: colors.textDim,
    fontSize: 12,
  },
  editButton: {
    padding: 6,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: withOpacity(colors.errorCoral, 0.4),
    borderRadius: radius,
    paddingVertical: 14,
  },
  logoutLabel: {
    color: colors.errorCoral,
    fontSize: 14,
    fontWeight: '700',
  },
  emptyText: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 19,
  },
});
