import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../lib/theme';
import PlatformAdminPaymentsScreen from './PlatformAdminPaymentsScreen';
import PlatformAdminPayoutsScreen from './PlatformAdminPayoutsScreen';
import PlatformAdminReviewScreen from './PlatformAdminReviewScreen';
import PlatformAdminTournamentScreen from './PlatformAdminTournamentScreen';

type Tab = 'documents' | 'payments' | 'payouts' | 'tournaments';

/** Home del platform_admin: revisión de documentos de coaches (flujo original), verificación de
 * pagos manuales entrantes y reporte de pagos salientes a entrenadores (fase 1 sin Stripe, ver
 * paymentService.submitPaymentProof/verifyPayment y settlementService.settleTournamentCoachPayouts)
 * y sembrar torneos sin club (ver decisión #36 en db/schema.sql). Responsabilidades sin relación
 * entre sí, así que van en pantallas separadas detrás de un selector simple, no mezcladas en una. */
export default function PlatformAdminFlow() {
  const [tab, setTab] = useState<Tab>('documents');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBarScroll}
        contentContainerStyle={styles.tabBar}
      >
        <Pressable style={[styles.tab, tab === 'documents' && styles.tabActive]} onPress={() => setTab('documents')}>
          <Text style={[styles.tabLabel, tab === 'documents' && styles.tabLabelActive]}>Documentos</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === 'payments' && styles.tabActive]} onPress={() => setTab('payments')}>
          <Text style={[styles.tabLabel, tab === 'payments' && styles.tabLabelActive]}>Pagos</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === 'payouts' && styles.tabActive]} onPress={() => setTab('payouts')}>
          <Text style={[styles.tabLabel, tab === 'payouts' && styles.tabLabelActive]}>Liquidaciones</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === 'tournaments' && styles.tabActive]} onPress={() => setTab('tournaments')}>
          <Text style={[styles.tabLabel, tab === 'tournaments' && styles.tabLabelActive]}>Torneos</Text>
        </Pressable>
      </ScrollView>

      <View style={styles.body}>
        {tab === 'documents' ? (
          <PlatformAdminReviewScreen />
        ) : tab === 'payments' ? (
          <PlatformAdminPaymentsScreen />
        ) : tab === 'payouts' ? (
          <PlatformAdminPayoutsScreen />
        ) : (
          <PlatformAdminTournamentScreen />
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
  tabBarScroll: {
    flexGrow: 0,
  },
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
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
  body: {
    flex: 1,
  },
});
