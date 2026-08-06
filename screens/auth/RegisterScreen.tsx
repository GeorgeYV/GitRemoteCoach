import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';

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
  const { user, register, logout } = useAuth();
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

  if (user) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <Text style={styles.headerTitle}>Cuenta creada</Text>
          <Text style={styles.headerSubtitle}>
            {user.fullName} · {user.email} · {user.primaryRole}
          </Text>
          <Pressable style={[styles.submitButton, styles.logoutButton]} onPress={logout}>
            <Text style={styles.submitLabel}>Cerrar sesión</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
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

        <TextInput
          style={styles.input}
          placeholder="Nombre completo"
          placeholderTextColor={colors.textDim}
          value={fullName}
          onChangeText={setFullName}
        />
        <TextInput
          style={styles.input}
          placeholder="Correo electrónico"
          placeholderTextColor={colors.textDim}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Contraseña (mínimo 8 caracteres)"
          placeholderTextColor={colors.textDim}
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
            <Text style={styles.submitLabel}>Crear cuenta</Text>
          )}
        </Pressable>

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
  input: {
    backgroundColor: colors.panel,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: colors.lineWhite,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
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
});
