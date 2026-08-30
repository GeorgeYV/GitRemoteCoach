import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import IconTextInput from '../../components/shared/IconTextInput';
import { useAuth } from '../../context/AuthContext';
import {
  AdminAccountSummary,
  ApiError,
  disableAccount,
  enableAccount,
  listCoachesForAdmin,
  listParentsForAdmin,
} from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';

type AccountTab = 'coaches' | 'parents';

const VERIFICATION_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * PlatformAdminFlow, pestaña "Cuentas" (decisión #51): listar y deshabilitar/habilitar coaches y
 * padres — reversible, no un borrado. Federaciones (club_admin) quedan fuera del alcance por
 * ahora. Deshabilitar no cancela reservas/torneos ya en curso: eso queda a criterio del admin.
 */
export default function PlatformAdminAccountsScreen() {
  const { token } = useAuth();
  const [tab, setTab] = useState<AccountTab>('coaches');
  const [query, setQuery] = useState('');
  const [accounts, setAccounts] = useState<AdminAccountSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disableTarget, setDisableTarget] = useState<AdminAccountSummary | null>(null);
  const [actingOnId, setActingOnId] = useState<string | null>(null);

  function load() {
    if (!token) return;
    setError(null);
    const fetcher = tab === 'coaches' ? listCoachesForAdmin : listParentsForAdmin;
    fetcher(token, query.trim() || undefined)
      .then(setAccounts)
      .catch((err) => {
        setAccounts(null);
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar la lista.');
      });
  }

  // Debounce de la búsqueda, mismo criterio que ParentHomeScreen — no dispara una consulta por
  // cada tecla. Cambiar de pestaña sí recarga de inmediato (sin esperar el debounce).
  useEffect(() => {
    setAccounts(null);
    const handle = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, query, token]);

  async function handleEnable(account: AdminAccountSummary) {
    if (!token) return;
    setActingOnId(account.id);
    try {
      await enableAccount(token, account.id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo habilitar la cuenta.');
    } finally {
      setActingOnId(null);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Cuentas</Text>
        <Text style={styles.headerSubtitle}>
          Deshabilitar es reversible — no cancela reservas ni torneos ya en curso.
        </Text>
      </View>

      <View style={styles.tabRow}>
        <Pressable style={[styles.tab, tab === 'coaches' && styles.tabActive]} onPress={() => setTab('coaches')}>
          <Text style={[styles.tabLabel, tab === 'coaches' && styles.tabLabelActive]}>Entrenadores</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === 'parents' && styles.tabActive]} onPress={() => setTab('parents')}>
          <Text style={[styles.tabLabel, tab === 'parents' && styles.tabLabelActive]}>Padres</Text>
        </Pressable>
      </View>

      <IconTextInput
        icon="search-outline"
        value={query}
        onChangeText={setQuery}
        placeholder="Buscar por nombre o correo"
        containerStyle={styles.searchBar}
      />

      {error ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      ) : !accounts ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color={colors.courtBlue} />
        </View>
      ) : accounts.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            {query ? 'Nadie coincide con esa búsqueda.' : tab === 'coaches' ? 'Todavía no hay entrenadores.' : 'Todavía no hay padres.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {accounts.map((account) => (
            <View key={account.id} style={styles.card}>
              <View style={styles.cardTopRow}>
                <View style={styles.cardInfo}>
                  <Text style={styles.accountName}>{account.fullName}</Text>
                  <Text style={styles.accountMeta}>{account.email}</Text>
                  <Text style={styles.accountMeta}>Registrado: {formatDate(account.createdAt)}</Text>
                </View>
                {account.disabledAt ? (
                  <View style={styles.disabledBadge}>
                    <Text style={styles.disabledBadgeLabel}>Deshabilitado</Text>
                  </View>
                ) : (
                  account.coachVerificationStatus && (
                    <View style={styles.verificationBadge}>
                      <Text style={styles.verificationBadgeLabel}>
                        {VERIFICATION_STATUS_LABELS[account.coachVerificationStatus]}
                      </Text>
                    </View>
                  )
                )}
              </View>

              {account.disabledAt && account.disabledReason && (
                <Text style={styles.disabledReason}>Motivo: {account.disabledReason}</Text>
              )}

              <Pressable
                style={[styles.actionButton, account.disabledAt ? styles.enableButton : styles.disableButton]}
                onPress={() => (account.disabledAt ? handleEnable(account) : setDisableTarget(account))}
                disabled={actingOnId === account.id}
              >
                {actingOnId === account.id ? (
                  <ActivityIndicator color={account.disabledAt ? colors.courtBlueDeep : colors.lineWhite} size="small" />
                ) : (
                  <>
                    <Ionicons
                      name={account.disabledAt ? 'checkmark-circle-outline' : 'ban-outline'}
                      size={15}
                      color={account.disabledAt ? colors.courtBlueDeep : colors.lineWhite}
                    />
                    <Text style={[styles.actionButtonLabel, account.disabledAt && styles.actionButtonLabelEnable]}>
                      {account.disabledAt ? 'Habilitar' : 'Deshabilitar'}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      {token && (
        <DisableAccountModal
          account={disableTarget}
          authToken={token}
          onClose={() => setDisableTarget(null)}
          onDisabled={() => {
            setDisableTarget(null);
            load();
          }}
        />
      )}
    </SafeAreaView>
  );
}

function DisableAccountModal({
  account,
  authToken,
  onClose,
  onDisabled,
}: {
  account: AdminAccountSummary | null;
  authToken: string;
  onClose: () => void;
  onDisabled: () => void;
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    onClose();
    setTimeout(() => {
      setReason('');
      setError(null);
    }, 300);
  }

  async function handleSubmit() {
    if (!account || reason.trim().length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await disableAccount(authToken, account.id, reason.trim());
      onDisabled();
      setReason('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo deshabilitar la cuenta.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={account !== null} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.sheetTitleRow}>
            <Text style={styles.sheetTitle}>Deshabilitar cuenta</Text>
            <Pressable onPress={handleClose} hitSlop={8}>
              <Text style={styles.sheetCloseLabel}>Cerrar</Text>
            </Pressable>
          </View>
          <Text style={styles.sheetSubtitle}>{account?.fullName}</Text>
          <IconTextInput
            icon="alert-circle-outline"
            style={styles.reasonInput}
            placeholder="Motivo (queda registrado)"
            value={reason}
            onChangeText={setReason}
            multiline
          />
          {error && <Text style={styles.sheetErrorText}>{error}</Text>}
          <Pressable
            style={[styles.confirmDisableButton, (submitting || reason.trim().length === 0) && styles.confirmDisableButtonDisabled]}
            onPress={handleSubmit}
            disabled={submitting || reason.trim().length === 0}
          >
            {submitting ? (
              <ActivityIndicator color={colors.lineWhite} />
            ) : (
              <Text style={styles.confirmDisableLabel}>Deshabilitar</Text>
            )}
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
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tabActive: {
    backgroundColor: colors.ballLime,
  },
  tabLabel: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
  },
  tabLabelActive: {
    color: colors.courtBlueDeep,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderRadius: radius,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 20,
    marginTop: 14,
    gap: 8,
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
    gap: 12,
  },
  card: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardInfo: {
    flex: 1,
    marginRight: 8,
  },
  accountName: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 3,
  },
  accountMeta: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 1,
  },
  disabledBadge: {
    backgroundColor: withOpacity(colors.errorCoral, 0.16),
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  disabledBadgeLabel: {
    color: colors.errorCoral,
    fontSize: 10,
    fontWeight: '800',
  },
  verificationBadge: {
    backgroundColor: withOpacity(colors.courtBlue, 0.16),
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  verificationBadgeLabel: {
    color: colors.courtBlue,
    fontSize: 10,
    fontWeight: '800',
  },
  disabledReason: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    paddingVertical: 10,
    marginTop: 12,
  },
  disableButton: {
    backgroundColor: colors.errorCoral,
  },
  enableButton: {
    backgroundColor: colors.ballLime,
  },
  actionButtonLabel: {
    color: colors.lineWhite,
    fontSize: 13,
    fontWeight: '700',
  },
  actionButtonLabelEnable: {
    color: colors.courtBlueDeep,
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
  sheetSubtitle: {
    fontSize: 12,
    color: colors.textDim,
    marginTop: 4,
    marginBottom: 16,
  },
  reasonInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  sheetErrorText: {
    color: colors.errorCoral,
    fontSize: 12,
    marginTop: 10,
  },
  confirmDisableButton: {
    backgroundColor: colors.errorCoral,
    borderRadius: radius,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  confirmDisableButtonDisabled: {
    backgroundColor: withOpacity(colors.errorCoral, 0.3),
  },
  confirmDisableLabel: {
    color: colors.lineWhite,
    fontSize: 14,
    fontWeight: '800',
  },
});
