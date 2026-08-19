import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TrainerAvatarPlaceholder from '../../components/shared/TrainerAvatarPlaceholder';
import { useAuth } from '../../context/AuthContext';
import {
  ApiError,
  CountryCode,
  getPaymentInstructions,
  PaymentInstructions,
  PaymentProvider,
  submitPaymentProofBatch,
} from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';

export interface PayableBooking {
  bookingId: string;
  dayLabel: string;
  price: number;
  /** Solo hace falta cuando el lote mezcla reservas de distintos entrenadores/torneos (ver
   * "Pagar todas"/selección múltiple en BookingHistoryScreen) — con un solo entrenador para todo
   * el lote (el caso de BookingConfirmScreen, varios días con el mismo coach) se usan en cambio
   * los props trainerName/tournamentName/venue de más abajo, compartidos para todo el resumen. */
  trainerName?: string;
  tournamentName?: string;
  venue?: string;
}

export default function BookingPaymentScreen({
  bookings,
  country,
  venue,
  note,
  trainerName,
  tournamentName,
  onBack,
  onConfirm,
}: {
  bookings: PayableBooking[];
  /** País del torneo — decide qué app de pago mostrar (Deuna en Ecuador, Yape/Plin en Perú). Con
   * un lote mixto, BookingHistoryScreen ya restringe la selección a un solo país antes de llegar
   * acá (un código de operación no puede cubrir un pago a Deuna y a Yape a la vez). */
  country: CountryCode;
  venue?: string;
  note: string;
  trainerName?: string;
  tournamentName?: string;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const { token } = useAuth();
  const [instructions, setInstructions] = useState<PaymentInstructions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [provider, setProvider] = useState<PaymentProvider | null>(null);
  const [referenceCode, setReferenceCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getPaymentInstructions(token)
      .then((result) => {
        if (cancelled) return;
        setInstructions(result);
        const options = result[country as 'EC' | 'PE'] ?? [];
        if (options.length === 1) setProvider(options[0].provider);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : 'No se pudo cargar la cuenta de cobro.');
      });
    return () => {
      cancelled = true;
    };
  }, [token, country]);

  // Un solo entrenador/torneo para todo el lote: header compartido de siempre. Lote mixto (p. ej.
  // "Pagar todas" desde el historial, con reservas de distintos entrenadores): cada reserva se
  // lista con sus propios datos en vez de un único encabezado que no aplicaría a todas por igual.
  const singleHeader = trainerName !== undefined && tournamentName !== undefined;
  const total = bookings.reduce((sum, b) => sum + b.price, 0);
  const options = instructions ? (instructions[country as 'EC' | 'PE'] ?? []) : [];
  const selectedAccount = options.find((o) => o.provider === provider);
  const canSubmit = !!provider && referenceCode.trim().length > 0 && !submitting;

  async function handleConfirm() {
    if (!token || !provider) {
      setError('No hay una sesión activa.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitPaymentProofBatch(
        token,
        bookings.map((b) => b.bookingId),
        { provider, referenceCode: referenceCode.trim() },
      );
      onConfirm();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar el comprobante. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Confirmar pago</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Section label="Resumen">
          <View style={styles.summaryCard}>
            {singleHeader ? (
              <>
                <View style={styles.summaryTopRow}>
                  <TrainerAvatarPlaceholder size={48} />
                  <View style={styles.summaryInfo}>
                    <Text style={styles.trainerName}>{trainerName}</Text>
                    <Text style={styles.summaryMeta}>{tournamentName}</Text>
                  </View>
                </View>
                <View style={styles.summaryDivider} />
                {venue && <SummaryLine label="Sede" value={venue} />}
                {bookings.map((b) => (
                  <SummaryLine key={b.bookingId} label={b.dayLabel} value={`$${b.price}`} />
                ))}
              </>
            ) : (
              bookings.map((b, i) => (
                <View key={b.bookingId}>
                  {i > 0 && <View style={styles.summaryDivider} />}
                  <Text style={styles.itemTrainerName}>{b.trainerName}</Text>
                  <Text style={styles.summaryMeta}>{b.tournamentName}</Text>
                  <SummaryLine label={b.dayLabel} value={`$${b.price}`} />
                  {b.venue && <SummaryLine label="Sede" value={b.venue} />}
                </View>
              ))
            )}
            {note ? <SummaryLine label="Nota" value={note} /> : null}
            <View style={styles.summaryDivider} />
            <SummaryLine label="Total a pagar" value={`$${total}`} emphasize />
          </View>
        </Section>

        <Section label="Cómo pagar">
          {loadError ? (
            <Text style={styles.errorText}>{loadError}</Text>
          ) : !instructions ? (
            <ActivityIndicator color={colors.courtBlue} />
          ) : (
            <>
              {options.length > 1 && (
                <View style={styles.providerRow}>
                  {options.map((option) => {
                    const selected = provider === option.provider;
                    return (
                      <Pressable
                        key={option.provider}
                        style={[styles.providerChip, selected && styles.providerChipActive]}
                        onPress={() => setProvider(option.provider)}
                      >
                        <Text style={[styles.providerChipLabel, selected && styles.providerChipLabelActive]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {selectedAccount && (
                <View style={styles.accountCard}>
                  <Text style={styles.accountInstructions}>
                    Paga <Text style={styles.accountAmount}>${total}</Text> por {selectedAccount.label} a:
                  </Text>
                  {selectedAccount.provider === 'bank_transfer' ? (
                    <>
                      <AccountDetailLine label="Banco" value={selectedAccount.bankName} />
                      <AccountDetailLine label="Tipo de cuenta" value={selectedAccount.accountType} />
                      <AccountDetailLine label="Número de cuenta" value={selectedAccount.accountNumber} />
                      <AccountDetailLine label="Titular" value={selectedAccount.accountHolderName} />
                      {selectedAccount.interbankAccountNumber && (
                        <AccountDetailLine label="Cuenta interbancaria (CCI)" value={selectedAccount.interbankAccountNumber} />
                      )}
                    </>
                  ) : (
                    <Text style={styles.accountHandle} selectable>
                      {selectedAccount.handle}
                    </Text>
                  )}
                </View>
              )}

              <Text style={styles.referenceLabel}>Código de operación</Text>
              <TextInput
                style={styles.referenceInput}
                placeholder="El código que te da la app al pagar"
                placeholderTextColor={colors.textDim}
                value={referenceCode}
                onChangeText={setReferenceCode}
                autoCapitalize="characters"
              />
            </>
          )}
        </Section>
      </ScrollView>

      <View style={styles.footer}>
        {error && <Text style={styles.errorText}>{error}</Text>}
        <Text style={styles.footerNote}>Un administrador confirmará tu pago en cuanto lo revise</Text>
        <Pressable
          style={[styles.confirmButton, !canSubmit && styles.confirmButtonDisabled]}
          onPress={handleConfirm}
          disabled={!canSubmit}
        >
          {submitting ? (
            <ActivityIndicator color={colors.courtBlueDeep} />
          ) : (
            <View style={styles.confirmContent}>
              <Ionicons name="paper-plane-outline" size={17} color={colors.courtBlueDeep} />
              <Text style={styles.confirmLabel}>Enviar comprobante</Text>
            </View>
          )}
        </Pressable>
      </View>
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

function AccountDetailLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.accountDetailLine}>
      <Text style={styles.accountDetailLabel}>{label}</Text>
      <Text style={styles.accountDetailValue} selectable>
        {value}
      </Text>
    </View>
  );
}

function SummaryLine({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <View style={styles.summaryLine}>
      <Text style={styles.summaryLineLabel}>{label}</Text>
      <Text style={[styles.summaryLineValue, emphasize && styles.summaryLineValueEmphasized]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  backButton: {
    paddingRight: 12,
  },
  backIcon: {
    color: colors.lineWhite,
    fontSize: 20,
  },
  headerTitle: {
    color: colors.lineWhite,
    fontSize: 17,
    fontWeight: '800',
  },
  content: {
    padding: 20,
    paddingBottom: 24,
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
    marginBottom: 14,
  },
  summaryCard: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryInfo: {
    flex: 1,
    marginLeft: 12,
  },
  trainerName: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  itemTrainerName: {
    color: colors.lineWhite,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  summaryMeta: {
    color: colors.textDim,
    fontSize: 12,
    marginBottom: 8,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.borderSoft,
    marginVertical: 14,
  },
  summaryLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 12,
  },
  summaryLineLabel: {
    color: colors.textDim,
    fontSize: 12,
  },
  summaryLineValue: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  summaryLineValueEmphasized: {
    color: colors.courtBlue,
    fontSize: 17,
    fontWeight: '800',
  },
  providerRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  providerChip: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderRadius: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  providerChipActive: {
    borderColor: colors.ballLime,
    backgroundColor: withOpacity(colors.ballLime, 0.08),
  },
  providerChipLabel: {
    color: colors.textSoft,
    fontSize: 14,
    fontWeight: '700',
  },
  providerChipLabelActive: {
    color: colors.lineWhite,
  },
  accountCard: {
    backgroundColor: withOpacity(colors.ballLime, 0.1),
    borderRadius: radius,
    borderWidth: 1,
    borderColor: withOpacity(colors.ballLime, 0.35),
    padding: 16,
    marginBottom: 18,
  },
  accountInstructions: {
    color: colors.textSoft,
    fontSize: 13,
    marginBottom: 6,
  },
  accountAmount: {
    color: colors.lineWhite,
    fontWeight: '800',
  },
  accountHandle: {
    color: colors.lineWhite,
    fontSize: 18,
    fontWeight: '800',
  },
  accountDetailLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    gap: 12,
  },
  accountDetailLabel: {
    color: colors.textDim,
    fontSize: 12,
  },
  accountDetailValue: {
    color: colors.lineWhite,
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },
  referenceLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  referenceInput: {
    backgroundColor: colors.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: colors.lineWhite,
    fontSize: 14,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.panel,
    padding: 16,
  },
  footerNote: {
    color: colors.textDim,
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 10,
  },
  confirmButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
  confirmContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  confirmLabel: {
    color: colors.courtBlueDeep,
    fontSize: 15,
    fontWeight: '800',
  },
  errorText: {
    color: colors.errorCoral,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
  },
});
