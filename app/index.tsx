import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { ApiError, getCoachProfile, PublicUser } from '../lib/api';
import { colors, radius } from '../lib/theme';
import { ClubFlow, CoachHomeFlow } from '../screens/previewFlows';
import PlatformAdminFlow from '../screens/admin/PlatformAdminFlow';
import CoachRegistrationScreen from '../screens/coach/CoachRegistrationScreen';
import CoachVerificationPendingScreen from '../screens/coach/CoachVerificationPendingScreen';
import ParentHomeScreen from '../screens/parent/ParentHomeScreen';

/**
 * Gatea el home del coach en el estado real de su coach_profiles: sin fila todavía → formulario
 * de alta (POST /coaches lo crea); pending/rejected → pantalla de estado; approved → dashboard.
 * La aprobación es real (PlatformAdminReviewScreen, rol platform_admin) — sembrado directo en la
 * base, no auto-registrable (ver SELF_SERVICE_ROLES en authService).
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
    case 'platform_admin':
      return <PlatformAdminFlow />;
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

  // Parent, coach y club_admin ya tienen su propio botón "Salir" dentro del flujo — este chip
  // flotante se sobreponía a botones de esas pantallas (p. ej. "Crear torneo"). Solo
  // platform_admin todavía no tiene uno propio.
  const showLogoutChip = user.primaryRole === 'platform_admin';

  return (
    <View style={styles.container}>
      <RoleHome user={user} />
      {showLogoutChip && (
        <Pressable style={[styles.logoutChip, { bottom: insets.bottom + 12 }]} onPress={logout}>
          <Ionicons name="log-out-outline" size={16} color={colors.textSoft} />
          <Text style={styles.logoutChipLabel}>Salir</Text>
        </Pressable>
      )}
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
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.panel,
    borderRadius: radius,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoutChipLabel: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
  },
});
