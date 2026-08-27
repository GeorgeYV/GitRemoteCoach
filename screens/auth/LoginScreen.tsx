import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BrandLogo from '../../components/shared/BrandLogo';
import IconTextInput from '../../components/shared/IconTextInput';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../lib/api';
import { useGoogleAuthRequest } from '../../lib/googleAuthSession';
import { colors, radius, withOpacity } from '../../lib/theme';
import { isValidEmail } from '../../lib/validation';

/** Mismas opciones que RegisterScreen.tsx — solo se preguntan acá si "Continuar con Google"
 * resulta ser una identidad nueva (ver AuthContext.googleSignIn). */
const ROLE_OPTIONS: { value: Exclude<UserRole, 'platform_admin'>; label: string }[] = [
  { value: 'parent', label: 'Soy padre/madre' },
  { value: 'coach', label: 'Soy entrenador' },
  { value: 'club_admin', label: 'Soy club/federación' },
];

export default function LoginScreen({
  onSuccess,
  onNavigateToRegister,
  onNavigateToForgotPassword,
}: {
  onSuccess?: () => void;
  onNavigateToRegister?: () => void;
  onNavigateToForgotPassword?: () => void;
}) {
  const { user, login, logout, googleSignIn, completeGoogleRegistration } = useAuth();
  const [step, setStep] = useState<'credentials' | 'google-complete-profile'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pendingGoogle, setPendingGoogle] = useState<{ pendingToken: string; email: string; name: string } | null>(
    null,
  );
  const [pendingRole, setPendingRole] = useState<Exclude<UserRole, 'platform_admin'> | null>(null);

  async function handleGoogleCode(params: { code: string; redirectUri: string; codeVerifier: string }) {
    setSubmitting(true);
    setError(null);
    try {
      const result = await googleSignIn(params);
      if (result.status === 'pendingRegistration') {
        setPendingGoogle(result);
        setStep('google-complete-profile');
      } else {
        onSuccess?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo continuar con Google');
    } finally {
      setSubmitting(false);
    }
  }

  const { request, promptAsync, isError: googleAuthError } = useGoogleAuthRequest(handleGoogleCode);

  useEffect(() => {
    if (googleAuthError) setError('No se pudo continuar con Google');
  }, [googleAuthError]);

  async function handleCompleteGoogleRegistration() {
    if (!pendingGoogle || !pendingRole) return;
    setSubmitting(true);
    setError(null);
    try {
      await completeGoogleRegistration({ pendingToken: pendingGoogle.pendingToken, primaryRole: pendingRole });
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit() {
    if (!isValidEmail(email.trim())) {
      setError('Correo electrónico inválido.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login(email.trim(), password);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  if (user) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <Text style={styles.headerTitle}>Sesión iniciada</Text>
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

  if (step === 'google-complete-profile' && pendingGoogle) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <BrandLogo />
          <Text style={styles.headerTitle}>Un último paso</Text>
          <Text style={styles.headerSubtitle}>
            {pendingGoogle.name ? `${pendingGoogle.name}, ¿` : '¿'}cuál es tu rol en Remote Coach?
          </Text>
        </View>

        <View style={styles.content}>
          <View style={styles.roleRow}>
            {ROLE_OPTIONS.map((opt) => {
              const active = pendingRole === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setPendingRole(opt.value)}
                  style={[styles.roleChip, active && styles.roleChipActive]}
                >
                  <Text style={[styles.roleChipLabel, active && styles.roleChipLabelActive]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Pressable
            style={[styles.submitButton, (!pendingRole || submitting) && styles.submitButtonDisabled]}
            disabled={!pendingRole || submitting}
            onPress={handleCompleteGoogleRegistration}
          >
            {submitting ? (
              <ActivityIndicator color={colors.courtBlueDeep} />
            ) : (
              <View style={styles.submitContent}>
                <Ionicons name="checkmark-outline" size={18} color={colors.courtBlueDeep} />
                <Text style={styles.submitLabel}>Continuar</Text>
              </View>
            )}
          </Pressable>

          <Pressable
            style={styles.linkButton}
            onPress={() => {
              setStep('credentials');
              setPendingGoogle(null);
              setPendingRole(null);
              setError(null);
            }}
          >
            <Text style={styles.linkText}>Cancelar</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <BrandLogo />
        <Text style={styles.headerTitle}>Iniciar sesión</Text>
        <Text style={styles.headerSubtitle}>Accede con tu correo y contraseña.</Text>
      </View>

      <View style={styles.content}>
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
          placeholder="Contraseña"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable
          style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
          disabled={!canSubmit}
          onPress={handleSubmit}
        >
          {submitting ? (
            <ActivityIndicator color={colors.courtBlueDeep} />
          ) : (
            <View style={styles.submitContent}>
              <Ionicons name="log-in-outline" size={18} color={colors.courtBlueDeep} />
              <Text style={styles.submitLabel}>Entrar</Text>
            </View>
          )}
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerLabel}>O</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable
          // request.url se arma async (useGoogleAuthRequest > makeAuthUrlAsync) apenas discovery
          // está listo — si se llega a tocar antes de que esté, promptAsync tiene que esperar esa
          // promesa antes de abrir el popup, y esa demora es justo lo que hace que el navegador
          // bloquee el popup por "no fue un gesto reciente del usuario". Exigir request.url (no
          // solo request) evita ese hueco.
          style={[styles.googleButton, (!request?.url || submitting) && styles.googleButtonDisabled]}
          disabled={!request?.url || submitting}
          onPress={() => promptAsync()}
        >
          <Ionicons name="logo-google" size={18} color={colors.lineWhite} />
          <Text style={styles.googleButtonLabel}>Continuar con Google</Text>
        </Pressable>

        {onNavigateToForgotPassword && (
          <Pressable style={styles.linkButton} onPress={onNavigateToForgotPassword}>
            <Text style={styles.linkText}>¿Olvidaste tu contraseña?</Text>
          </Pressable>
        )}

        {onNavigateToRegister && (
          <Pressable style={styles.linkButton} onPress={onNavigateToRegister}>
            <Text style={styles.linkText}>¿No tienes cuenta? Regístrate</Text>
          </Pressable>
        )}
      </View>
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
  linkButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
  },
});
