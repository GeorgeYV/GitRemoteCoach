import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { colors, radius } from '../../lib/theme';

/**
 * AuthenticatedHome (app/index.tsx) monta esto en vez del home del rol mientras user.disabledAt
 * no sea NULL (ver decisión #51 en db/schema.sql) — mismo criterio de "gate" que
 * VerifyEmailGateScreen/CoachVerificationPendingScreen. Sin ninguna acción disponible más que
 * salir: solo un platform_admin puede revertir esto (PlatformAdminAccountsScreen).
 */
export default function AccountDisabledScreen() {
  const { user, logout } = useAuth();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Ionicons name="ban-outline" size={40} color={colors.errorCoral} />
        <Text style={styles.title}>Tu cuenta fue deshabilitada</Text>
        {user?.disabledReason && <Text style={styles.reason}>{user.disabledReason}</Text>}
        <Text style={styles.subtitle}>
          Si te parece un error, contactá a la plataforma para resolverlo.
        </Text>
        <Pressable style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutLabel}>Salir</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: colors.lineWhite,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 14,
    textAlign: 'center',
  },
  reason: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
    textAlign: 'center',
  },
  logoutButton: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoutLabel: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
  },
});
