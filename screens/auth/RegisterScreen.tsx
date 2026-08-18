import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BrandLogo from '../../components/shared/BrandLogo';
import IconTextInput from '../../components/shared/IconTextInput';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../lib/api';
import { useGoogleAuthRequest } from '../../lib/googleAuthSession';
import { colors, radius, withOpacity } from '../../lib/theme';
import { isValidEmail } from '../../lib/validation';

const ROLE_OPTIONS: { value: Exclude<UserRole, 'platform_admin'>; label: string }[] = [
  { value: 'parent', label: 'Soy padre/madre' },
  { value: 'coach', label: 'Soy entrenador' },
  { value: 'club_admin', label: 'Soy club/federación' },
];

export default function RegisterScreen({
  onSuccess,
  onNavigateToLogin,
}: {
  onSuccess?: () => void;
  onNavigateToLogin?: () => void;
}) {
  const { user, register, logout, googleSignIn, completeGoogleRegistration } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [primaryRole, setPrimaryRole] = useState<Exclude<UserRole, 'platform_admin'> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    fullName.trim().length > 0 && email.trim().length > 0 && password.length >= 8 && primaryRole !== null && !submitting;

  async function handleSubmit() {
    if (!primaryRole) return;
    if (!isValidEmail(email.trim())) {
      setError('Correo electrónico inválido.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await register({ email: email.trim(), password, fullName: fullName.trim(), primaryRole });
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta');
    } finally {
      setSubmitting(false);
    }
  }

  // A diferencia de LoginScreen, acá el rol ya se eligió antes de tocar el botón — si Google
  // resulta ser una identidad nueva, se completa el registro directo con ese rol, sin un paso
  // extra de "¿cuál es tu rol?" (eso solo hace falta cuando no había ningún rol de antemano).
  async function handleGoogleCode(params: { code: string; redirectUri: string; codeVerifier: string }) {
    if (!primaryRole) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await googleSignIn(params);
      if (result.status === 'pendingRegistration') {
        await completeGoogleRegistration({ pendingToken: result.pendingToken, primaryRole });
      }
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo continuar con Google');
    } finally {
      setSubmitting(false);
    }
  }

  const { request, promptAsync, isError: googleAuthError } = useGoogleAuthRequest(handleGoogleCode);

  if (user) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <Text style={styles.headerTitle}>Cuenta creada</Text>
          <Text style={styles.headerSubtitle}>
            {user.fullName} · {user.email} · {user.primaryRole}
          </Text>
          <Pressable style={[styles.submitButton, styles.logoutButton]} onPress={logout}>
            <View style={styles.submitContent}>
              <Ionicons name="log-out-outline" size={18} color={colors.courtBlueDeep} />
              <Text style={styles.submitLabel}>Cerrar sesión</Text>
            </View>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <BrandLogo />
        <Text style={styles.headerTitle}>Crea tu cuenta</Text>
        <Text style={styles.headerSubtitle}>Elige tu rol para empezar.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.roleRow}>
          {ROLE_OPTIONS.map((opt) => {
            const active = primaryRole === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => setPrimaryRole(opt.value)}
                style={[styles.roleChip, active && styles.roleChipActive]}
              >
                <Text style={[styles.roleChipLabel, active && styles.roleChipLabelActive]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <IconTextInput icon="person-outline" placeholder="Nombre completo" value={fullName} onChangeText={setFullName} />
        <IconTextInput
          icon="mail-outline"
          placeholder="Correo electrónico"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <IconTextInput
          icon="lock-closed-outline"
          placeholder="Contraseña (mínimo 8 caracteres)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {(error || googleAuthError) && (
          <Text style={styles.errorText}>{error ?? 'No se pudo continuar con Google'}</Text>
        )}

        <Pressable
          style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
          disabled={!canSubmit}
          onPress={handleSubmit}
        >
          {submitting ? (
            <ActivityIndicator color={colors.courtBlueDeep} />
          ) : (
            <View style={styles.submitContent}>
              <Ionicons name="person-add-outline" size={18} color={colors.courtBlueDeep} />
              <Text style={styles.submitLabel}>Crear cuenta</Text>
            </View>
          )}
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerLabel}>O</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable
          style={[styles.googleButton, (!request || !primaryRole || submitting) && styles.googleButtonDisabled]}
          disabled={!request || !primaryRole || submitting}
          onPress={() => promptAsync()}
        >
          <Ionicons name="logo-google" size={18} color={colors.lineWhite} />
          <Text style={styles.googleButtonLabel}>Continuar con Google</Text>
        </Pressable>
        {!primaryRole && <Text style={styles.googleHint}>Elige tu rol arriba para continuar con Google</Text>}

        {onNavigateToLogin && (
          <Pressable style={styles.linkButton} onPress={onNavigateToLogin}>
            <Text style={styles.linkText}>¿Ya tienes cuenta? Inicia sesión</Text>
          </Pressable>
        )}
      </ScrollView>
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
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  headerTitle: {
    color: colors.lineWhite,
    fontSize: 22,
    fontWeight: '800',
    marginTop: 18,
    marginBottom: 6,
  },
  headerSubtitle: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  roleChip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  roleChipActive: {
    backgroundColor: colors.ballLime,
  },
  roleChipLabel: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
  },
  roleChipLabelActive: {
    color: colors.courtBlueDeep,
  },
  errorText: {
    color: colors.errorCoral,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
  },
  submitButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  logoutButton: {
    marginTop: 20,
  },
  submitButtonDisabled: {
    backgroundColor: withOpacity(colors.ballLime, 0.3),
  },
  submitContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitLabel: {
    color: colors.courtBlueDeep,
    fontSize: 15,
    fontWeight: '800',
  },
  linkButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderSoft,
  },
  dividerLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    marginHorizontal: 10,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    paddingVertical: 14,
    marginTop: 16,
  },
  googleButtonDisabled: {
    opacity: 0.5,
  },
  googleButtonLabel: {
    color: colors.lineWhite,
    fontSize: 14,
    fontWeight: '700',
  },
  googleHint: {
    color: colors.textDim,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
  },
});
