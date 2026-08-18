import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import IconTextInput from '../../components/shared/IconTextInput';
import { ApiError, requestPasswordReset, resetPassword } from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';
import { isValidEmail } from '../../lib/validation';

/** Login → "¿Olvidaste tu contraseña?". Dos pasos en una sola pantalla (sin ruta extra):
 * pedir el código por correo, luego canjearlo junto con la nueva contraseña. Un código
 * numérico en vez de un link — esta app no tiene deep-linking configurado (sin `scheme` en
 * app.json), así que un código evita esa plomería y funciona igual en web y nativo. */
export default function ForgotPasswordScreen({
  onSuccess,
  onNavigateToLogin,
}: {
  onSuccess?: () => void;
  onNavigateToLogin?: () => void;
}) {
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRequestCode() {
    if (!isValidEmail(email.trim())) {
      setError('Correo electrónico inválido.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await requestPasswordReset(email.trim());
      setStep('reset');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar el código. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword() {
    setSubmitting(true);
    setError(null);
    try {
      await resetPassword({ email: email.trim(), code: code.trim(), newPassword });
      onSuccess?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo restablecer la contraseña. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  const canRequestCode = email.trim().length > 0 && !submitting;
  const canResetPassword = code.trim().length === 6 && newPassword.length >= 8 && !submitting;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Recupera tu contraseña</Text>
        <Text style={styles.headerSubtitle}>
          {step === 'request'
            ? 'Escribe tu correo y te enviamos un código de 6 dígitos.'
            : `Escribe el código que enviamos a ${email.trim()} y tu nueva contraseña.`}
        </Text>
      </View>

      <View style={styles.content}>
        {step === 'request' ? (
          <IconTextInput
            icon="mail-outline"
            placeholder="Correo electrónico"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        ) : (
          <>
            <IconTextInput
              icon="key-outline"
              placeholder="Código de 6 dígitos"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
            />
            <IconTextInput
              icon="lock-closed-outline"
              placeholder="Nueva contraseña (mínimo 8 caracteres)"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
            />
          </>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable
          style={[styles.submitButton, !(step === 'request' ? canRequestCode : canResetPassword) && styles.submitButtonDisabled]}
          disabled={step === 'request' ? !canRequestCode : !canResetPassword}
          onPress={step === 'request' ? handleRequestCode : handleResetPassword}
        >
          {submitting ? (
            <ActivityIndicator color={colors.courtBlueDeep} />
          ) : (
            <View style={styles.submitContent}>
              <Ionicons name={step === 'request' ? 'send-outline' : 'checkmark-outline'} size={18} color={colors.courtBlueDeep} />
              <Text style={styles.submitLabel}>{step === 'request' ? 'Enviar código' : 'Cambiar contraseña'}</Text>
            </View>
          )}
        </Pressable>

        {onNavigateToLogin && (
          <Pressable style={styles.linkButton} onPress={onNavigateToLogin}>
            <Text style={styles.linkText}>Volver a iniciar sesión</Text>
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
});
