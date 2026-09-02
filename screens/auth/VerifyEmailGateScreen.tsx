import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import IconTextInput from '../../components/shared/IconTextInput';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';
import { useHardwareBack } from '../../lib/useHardwareBack';
import { isValidEmail } from '../../lib/validation';

/**
 * AuthenticatedHome (app/index.tsx) monta esto en vez del home del rol mientras
 * user.emailVerifiedAt sea NULL (ver decisión #48 en db/schema.sql) — mismo criterio de
 * "gate" que CoachVerificationPendingScreen para la aprobación del coach. Código de 6 dígitos,
 * no un link: esta app no tiene deep-linking configurado (ver ForgotPasswordScreen).
 */
export default function VerifyEmailGateScreen() {
  const { user, verifyEmail, resendVerificationCode, changeEmail, logout } = useAuth();
  const [step, setStep] = useState<'verify' | 'change'>('verify');
  const [code, setCode] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleVerify() {
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await verifyEmail(code.trim());
      // Sin onSuccess: AuthenticatedHome reacciona solo al emailVerifiedAt ya poblado en el
      // usuario en memoria (verifyEmail actualiza el context) y desmonta esta pantalla.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo verificar el código. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await resendVerificationCode();
      setNotice('Te enviamos un código nuevo.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo reenviar el código. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleChangeEmail() {
    if (!isValidEmail(newEmail.trim())) {
      setError('Correo electrónico inválido.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await changeEmail(newEmail.trim());
      setStep('verify');
      setCode('');
      setNotice('Correo actualizado — te enviamos un código nuevo.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar el correo. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  const canVerify = code.trim().length === 6 && !submitting;
  const canChangeEmail = newEmail.trim().length > 0 && !submitting;

  // El botón/gesto de "atrás" debe hacer lo mismo que "Cancelar" en el paso de cambiar correo
  // (ver lib/useHardwareBack.ts) — sin esto salta directo a la ruta anterior en vez de volver a
  // "verify".
  useHardwareBack(
    step === 'change',
    () => {
      setError(null);
      setStep('verify');
    },
    step,
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Confirma tu correo</Text>
        <Text style={styles.headerSubtitle}>
          {step === 'verify'
            ? `Escribe el código de 6 dígitos que enviamos a ${user?.email}.`
            : 'Escribe tu correo correcto y te enviamos un código nuevo.'}
        </Text>
        {step === 'verify' && (
          <View style={styles.spamHint}>
            <Ionicons name="alert-circle-outline" size={14} color={colors.textDim} />
            <Text style={styles.spamHintText}>
              Si no lo encuentras, revisa la carpeta de spam o correo no deseado.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.content}>
        {step === 'verify' ? (
          <IconTextInput
            icon="key-outline"
            placeholder="Código de 6 dígitos"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
          />
        ) : (
          <IconTextInput
            icon="mail-outline"
            placeholder="Correo electrónico"
            value={newEmail}
            onChangeText={setNewEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        )}

        {notice && <Text style={styles.noticeText}>{notice}</Text>}
        {error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable
          style={[styles.submitButton, !(step === 'verify' ? canVerify : canChangeEmail) && styles.submitButtonDisabled]}
          disabled={step === 'verify' ? !canVerify : !canChangeEmail}
          onPress={step === 'verify' ? handleVerify : handleChangeEmail}
        >
          {submitting ? (
            <ActivityIndicator color={colors.courtBlueDeep} />
          ) : (
            <View style={styles.submitContent}>
              <Ionicons name="checkmark-outline" size={18} color={colors.courtBlueDeep} />
              <Text style={styles.submitLabel}>{step === 'verify' ? 'Verificar' : 'Guardar y reenviar código'}</Text>
            </View>
          )}
        </Pressable>

        {step === 'verify' ? (
          <>
            <Pressable style={styles.linkButton} onPress={handleResend} disabled={submitting}>
              <Text style={styles.linkText}>Reenviar código</Text>
            </Pressable>
            <Pressable
              style={styles.linkButton}
              onPress={() => {
                setError(null);
                setNotice(null);
                setStep('change');
              }}
              disabled={submitting}
            >
              <Text style={styles.linkText}>¿Correo incorrecto? Cambiarlo</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            style={styles.linkButton}
            onPress={() => {
              setError(null);
              setStep('verify');
            }}
            disabled={submitting}
          >
            <Text style={styles.linkText}>Cancelar</Text>
          </Pressable>
        )}

        <Pressable style={styles.linkButton} onPress={logout}>
          <Text style={styles.linkText}>Salir</Text>
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
  spamHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 10,
  },
  spamHintText: {
    flex: 1,
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 17,
  },
  content: {
    padding: 20,
  },
  noticeText: {
    color: colors.ballLime,
    fontSize: 12,
    textAlign: 'center',
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
