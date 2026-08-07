import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { ApiError, getCoachProfile, PublicUser } from '../lib/api';
import { colors, radius } from '../lib/theme';
import { ClubFlow, CoachHomeFlow } from '../screens/previewFlows';
import CoachRegistrationScreen from '../screens/coach/CoachRegistrationScreen';
import CoachVerificationPendingScreen from '../screens/coach/CoachVerificationPendingScreen';
import ParentHomeScreen from '../screens/parent/ParentHomeScreen';

/**
 * Gatea el home del coach en el estado real de su coach_profiles: sin fila todavía → formulario
 * de alta (POST /coaches lo crea); pending/rejected → pantalla de estado; approved → dashboard.
 * No hay flujo de aprobación real todavía (ver plan de onboarding) — para probar "approved" hay
 * que actualizar verification_status a mano en la base.
 */
function CoachRoleHome({ user }: { user: PublicUser }) {
  const [state, setState] = useState<'loading' | 'no-profile' | 'pending' | 'approved' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  function reload() {
    setState('loading');
    getCoachProfile(user.id)
      .then((result) => {
        setState(result.profile.verificationStatus === 'approved' ? 'approved' : 'pending');
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setState('no-profile');
          return;
        }
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar tu perfil.');
        setState('error');
      });
  }

  useEffect(reload, [user.id]);

  if (state === 'loading') {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color={colors.ballLime} />
      </View>
    );
  }

  if (state === 'no-profile') {
    return <CoachRegistrationScreen onSubmit={reload} />;
  }

  if (state === 'pending') {
    return <CoachVerificationPendingScreen coachId={user.id} />;
  }

  if (state === 'error') {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>{error}</Text>
      </View>
    );
  }

  return <CoachHomeFlow coachId={user.id} coachName={user.fullName} />;
}

/**
 * Ninguno de los flujos por rol está todavía cruzado entre sí (ej. CoachHomeFlow no lleva a
 * CoachAvailabilityFlow) — ver plan de navegación. Esta ruta solo monta el "home" ya existente
 * de cada rol; el resto de pantallas sigue siendo alcanzable únicamente vía /dev-preview.
 */
function RoleHome({ user }: { user: PublicUser }) {
  switch (user.primaryRole) {
    case 'parent':
      return <ParentHomeScreen />;
    case 'coach':
      return <CoachRoleHome user={user} />;
    case 'club_admin':
      return <ClubFlow adminUserId={user.id} />;
    default:
      return (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Todavía no hay pantallas para el rol "{user.primaryRole}".</Text>
        </View>
      );
  }
}

export default function AuthenticatedHome() {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();

  // Stack.Protected en app/_layout.tsx garantiza que esta ruta solo se monta con sesión activa.
  if (!user) return null;

  return (
    <View style={styles.container}>
      <RoleHome user={user} />
      <Pressable style={[styles.logoutChip, { top: insets.top + 8 }]} onPress={logout}>
        <Text style={styles.logoutChipLabel}>Salir</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  placeholderText: {
    color: colors.textDim,
    fontSize: 13,
    textAlign: 'center',
  },
  logoutChip: {
    position: 'absolute',
    right: 16,
    backgroundColor: colors.panel,
    borderRadius: radius,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoutChipLabel: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
  },
});
