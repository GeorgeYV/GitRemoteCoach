import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import IconTextInput from '../../components/shared/IconTextInput';
import { useAuth } from '../../context/AuthContext';
import { ApiError, getPaymentAccountsForAdmin, PaymentCollectionAccountAdmin, updatePaymentAccount } from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';

const COUNTRY_LABELS: Record<string, string> = { EC: 'Ecuador', PE: 'Perú' };

/** Mismo criterio que BookingPaymentScreen#PROVIDER_ICONS: sin logotipos de terceros, solo un
 * ícono genérico por tipo de cuenta (celular para apps P2P, intercambio para transferencia). */
const PROVIDER_ICONS: Record<PaymentCollectionAccountAdmin['provider'], React.ComponentProps<typeof Ionicons>['name']> = {
  deuna: 'phone-portrait-outline',
  yape: 'phone-portrait-outline',
  plin: 'phone-portrait-outline',
  bank_transfer: 'swap-horizontal-outline',
};

function isConfigured(account: PaymentCollectionAccountAdmin): boolean {
  return account.provider === 'bank_transfer' ? account.bankName !== null : account.handle !== null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * PlatformAdminFlow, pestaña "Cuentas de cobro" (decisión #54): editar a qué cuenta le paga el
 * padre por fuera de la app (Deuna en Ecuador, Yape/Plin/transferencia en Perú, transferencia
 * también en Ecuador) sin depender de un redeploy en Render — antes vivía en variables de entorno.
 */
export default function PlatformAdminPaymentAccountsScreen() {
  const { token } = useAuth();
  const [accounts, setAccounts] = useState<PaymentCollectionAccountAdmin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<PaymentCollectionAccountAdmin | null>(null);

  function load() {
    if (!token) return;
    setError(null);
    getPaymentAccountsForAdmin(token)
      .then(setAccounts)
      .catch((err) => {
        setAccounts(null);
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar la lista.');
      });
  }

  useEffect(load, [token]);

  const byCountry = (accounts ?? []).reduce<Record<string, PaymentCollectionAccountAdmin[]>>((acc, a) => {
    (acc[a.country] ??= []).push(a);
    return acc;
  }, {});

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Cuentas de cobro</Text>
        <Text style={styles.headerSubtitle}>
          A estas cuentas paga el padre por fuera de la app. Un cambio acá se ve de inmediato, sin deploy.
        </Text>
      </View>

      {error ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      ) : !accounts ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color={colors.courtBlue} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {Object.keys(byCountry).map((country) => (
            <View key={country} style={styles.countryGroup}>
              <Text style={styles.countryLabel}>{COUNTRY_LABELS[country] ?? country}</Text>
              {byCountry[country].map((account) => {
                const configured = isConfigured(account);
                return (
                  <View key={account.id} style={styles.card}>
                    <View style={styles.cardTopRow}>
                      <View style={styles.cardIconWrap}>
                        <Ionicons name={PROVIDER_ICONS[account.provider]} size={18} color={colors.courtBlue} />
                      </View>
                      <View style={styles.cardInfo}>
                        <Text style={styles.accountLabel}>{account.label}</Text>
                        {configured ? (
                          account.provider === 'bank_transfer' ? (
                            <Text style={styles.accountValue} numberOfLines={1}>
                              {account.bankName} · {account.accountNumber}
                            </Text>
                          ) : (
                            <Text style={styles.accountValue}>{account.handle}</Text>
                          )
                        ) : (
                          <Text style={styles.notConfiguredLabel}>Sin configurar</Text>
                        )}
                        {configured && <Text style={styles.accountMeta}>Actualizado: {formatDate(account.updatedAt)}</Text>}
                      </View>
                      {!configured && (
                        <View style={styles.notConfiguredBadge}>
                          <Text style={styles.notConfiguredBadgeLabel}>Pendiente</Text>
                        </View>
                      )}
                    </View>
                    <Pressable style={styles.editButton} onPress={() => setEditTarget(account)}>
                      <Ionicons name="create-outline" size={15} color={colors.courtBlueDeep} />
                      <Text style={styles.editButtonLabel}>{configured ? 'Editar' : 'Configurar'}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}

      {token && (
        <EditPaymentAccountModal
          account={editTarget}
          authToken={token}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            load();
          }}
        />
      )}
    </SafeAreaView>
  );
}

function EditPaymentAccountModal({
  account,
  authToken,
  onClose,
  onSaved,
}: {
  account: PaymentCollectionAccountAdmin | null;
  authToken: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [handle, setHandle] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountType, setAccountType] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [interbankAccountNumber, setInterbankAccountNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Precarga el formulario con los valores actuales de la fila cada vez que se abre una distinta
  // (o se reabre la misma tras guardar) — mismo criterio que cualquier modal de edición de la app.
  useEffect(() => {
    if (!account) return;
    setHandle(account.handle ?? '');
    setBankName(account.bankName ?? '');
    setAccountType(account.accountType ?? '');
    setAccountNumber(account.accountNumber ?? '');
    setAccountHolderName(account.accountHolderName ?? '');
    setInterbankAccountNumber(account.interbankAccountNumber ?? '');
    setError(null);
  }, [account]);

  function handleClose() {
    onClose();
  }

  const isBankTransfer = account?.provider === 'bank_transfer';
  const canSubmit = isBankTransfer
    ? bankName.trim().length > 0 && accountType.trim().length > 0 && accountNumber.trim().length > 0 && accountHolderName.trim().length > 0
    : handle.trim().length > 0;

  async function handleSubmit() {
    if (!account || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await updatePaymentAccount(
        authToken,
        account.id,
        isBankTransfer
          ? {
              bankName: bankName.trim(),
              accountType: accountType.trim(),
              accountNumber: accountNumber.trim(),
              accountHolderName: accountHolderName.trim(),
              interbankAccountNumber: interbankAccountNumber.trim() || undefined,
            }
          : { handle: handle.trim() },
      );
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la cuenta.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={account !== null} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.sheetTitleRow}>
            <Text style={styles.sheetTitle}>{account?.label}</Text>
            <Pressable onPress={handleClose} hitSlop={8}>
              <Text style={styles.sheetCloseLabel}>Cerrar</Text>
            </Pressable>
          </View>

          {isBankTransfer ? (
            <>
              <IconTextInput icon="business-outline" placeholder="Banco" value={bankName} onChangeText={setBankName} />
              <IconTextInput icon="wallet-outline" placeholder="Tipo de cuenta (ahorros, corriente…)" value={accountType} onChangeText={setAccountType} />
              <IconTextInput
                icon="card-outline"
                placeholder="Número de cuenta"
                value={accountNumber}
                onChangeText={setAccountNumber}
                keyboardType="number-pad"
              />
              <IconTextInput icon="person-outline" placeholder="Titular de la cuenta" value={accountHolderName} onChangeText={setAccountHolderName} />
              <IconTextInput
                icon="key-outline"
                placeholder="Cuenta interbancaria / CCI (opcional)"
                value={interbankAccountNumber}
                onChangeText={setInterbankAccountNumber}
                keyboardType="number-pad"
              />
            </>
          ) : (
            <IconTextInput icon="phone-portrait-outline" placeholder="Número de celular" value={handle} onChangeText={setHandle} keyboardType="phone-pad" />
          )}

          {error && <Text style={styles.sheetErrorText}>{error}</Text>}
          <Pressable style={[styles.confirmButton, !canSubmit && styles.confirmButtonDisabled]} onPress={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? <ActivityIndicator color={colors.courtBlueDeep} /> : <Text style={styles.confirmButtonLabel}>Guardar</Text>}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
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
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  headerTitle: {
    color: colors.lineWhite,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6,
  },
  headerSubtitle: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  emptyState: {
    paddingTop: 40,
    paddingHorizontal: 20,
  },
  emptyText: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  content: {
    padding: 20,
    paddingBottom: 24,
  },
  countryGroup: {
    marginBottom: 20,
  },
  countryLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  card: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cardIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: withOpacity(colors.courtBlue, 0.14),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardInfo: {
    flex: 1,
    marginRight: 8,
  },
  accountLabel: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 3,
  },
  accountValue: {
    color: colors.textSoft,
    fontSize: 13,
  },
  accountMeta: {
    color: colors.textDim,
    fontSize: 11,
    marginTop: 4,
  },
  notConfiguredLabel: {
    color: colors.textDim,
    fontSize: 13,
    fontStyle: 'italic',
  },
  notConfiguredBadge: {
    backgroundColor: withOpacity(colors.errorCoral, 0.16),
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  notConfiguredBadgeLabel: {
    color: colors.errorCoral,
    fontSize: 10,
    fontWeight: '800',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    paddingVertical: 10,
    marginTop: 12,
    backgroundColor: colors.ballLime,
  },
  editButtonLabel: {
    color: colors.courtBlueDeep,
    fontSize: 13,
    fontWeight: '700',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(14,32,56,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.panelLight,
    borderTopLeftRadius: radius,
    borderTopRightRadius: radius,
    padding: 20,
    paddingBottom: 32,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.lineWhite,
  },
  sheetCloseLabel: {
    fontSize: 13,
    color: colors.courtBlue,
    fontWeight: '700',
  },
  sheetErrorText: {
    color: colors.errorCoral,
    fontSize: 12,
    marginTop: 4,
    marginBottom: 6,
  },
  confirmButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonLabel: {
    color: colors.courtBlueDeep,
    fontSize: 14,
    fontWeight: '800',
  },
});
