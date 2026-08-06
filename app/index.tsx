import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { PublicUser } from '../lib/api';
import { colors, radius } from '../lib/theme';
import { ClubFlow, CoachHomeFlow } from '../screens/previewFlows';
import ParentHomeScreen from '../screens/parent/ParentHomeScreen';

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
      return <CoachHomeFlow coachId={user.id} coachName={user.fullName} />;
    case 'club_admin':
      return <ClubFlow />;
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
