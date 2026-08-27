import * as Clipboard from 'expo-clipboard';
import Ionicons from '@expo/vector-icons/Ionicons';
import QRCode from 'qrcode';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { dateRangeLabel } from '../../lib/dateSlots';
import { buildTournamentShareMessage, buildTournamentShareUrl } from '../../lib/shareLinks';
import { TournamentSummary } from '../../lib/api';
import { colors, radius } from '../../lib/theme';

/** Publicidad para atraer padres nuevos a un torneo puntual: enlace + QR + texto listo para
 * copiar en WhatsApp/correo. El enlace (ver lib/shareLinks.ts) lleva al inicio de la app en
 * general, no a una pantalla de este torneo puntual — todavía no existe esa pantalla pública. */
export default function ClubTournamentShareScreen({
  tournament,
  onBack,
}: {
  tournament: TournamentSummary;
  onBack: () => void;
}) {
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const shareUrl = buildTournamentShareUrl(tournament.id);
  const message = buildTournamentShareMessage({
    tournamentName: tournament.name,
    venue: tournament.venue,
    dateRangeLabel: dateRangeLabel(tournament.startDate, tournament.endDate),
    shareUrl,
  });

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(shareUrl, { type: 'svg', margin: 1, color: { dark: '#101828', light: '#ffffff' } })
      .then((svg) => {
        if (!cancelled) setQrSvg(svg);
      })
      .catch(() => {
        if (!cancelled) setQrSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [shareUrl]);

  async function copyLink() {
    try {
      await Clipboard.setStringAsync(shareUrl);
      setCopyError(null);
      setCopiedLink(true);
      setCopiedMessage(false);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setCopyError('No se pudo copiar. Selecciona el texto manualmente.');
    }
  }

  async function copyMessage() {
    try {
      await Clipboard.setStringAsync(message);
      setCopyError(null);
      setCopiedMessage(true);
      setCopiedLink(false);
      setTimeout(() => setCopiedMessage(false), 2000);
    } catch {
      setCopyError('No se pudo copiar. Selecciona el texto manualmente.');
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Compartir torneo</Text>
          <Text style={styles.headerSubtitle}>
            Para atraer padres nuevos: pega el enlace en un correo, mándalo por WhatsApp, o imprime el QR en un afiche.
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {copyError && <Text style={styles.copyErrorText}>{copyError}</Text>}

        <View style={styles.card}>
          <Text style={styles.tournamentName}>{tournament.name}</Text>
          <Text style={styles.tournamentMeta}>{tournament.venue}</Text>
          <Text style={styles.tournamentMeta}>{dateRangeLabel(tournament.startDate, tournament.endDate)}</Text>
        </View>

        <View style={styles.qrBox}>
          {qrSvg ? <SvgXml xml={qrSvg} width={200} height={200} /> : <View style={styles.qrPlaceholder} />}
        </View>

        <Text style={styles.sectionLabel}>Enlace</Text>
        <View style={styles.linkRow}>
          <Text style={styles.linkText} numberOfLines={1}>
            {shareUrl}
          </Text>
        </View>
        <Pressable style={styles.copyButton} onPress={copyLink}>
          <View style={styles.buttonContent}>
            <Ionicons
              name={copiedLink ? 'checkmark-outline' : 'copy-outline'}
              size={16}
              color={colors.courtBlueDeep}
            />
            <Text style={styles.copyButtonLabel}>{copiedLink ? 'Copiado' : 'Copiar enlace'}</Text>
          </View>
        </Pressable>

        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>Mensaje para WhatsApp o correo</Text>
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>{message}</Text>
        </View>
        <Pressable style={[styles.copyButton, styles.copyButtonSecondary]} onPress={copyMessage}>
          <View style={styles.buttonContent}>
            <Ionicons
              name={copiedMessage ? 'checkmark-outline' : 'copy-outline'}
              size={16}
              color={colors.lineWhite}
            />
            <Text style={[styles.copyButtonLabel, styles.copyButtonLabelSecondary]}>
              {copiedMessage ? 'Copiado' : 'Copiar mensaje'}
            </Text>
          </View>
        </Pressable>
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  backButton: {
    paddingRight: 12,
    paddingTop: 2,
  },
  backIcon: {
    color: colors.lineWhite,
    fontSize: 20,
  },
  headerText: {
    flex: 1,
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
  copyErrorText: {
    color: colors.errorCoral,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 14,
  },
  card: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  tournamentName: {
    color: colors.lineWhite,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  tournamentMeta: {
    color: colors.textDim,
    fontSize: 12,
    marginBottom: 2,
  },
  qrBox: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lineWhite,
    borderRadius: radius,
    padding: 16,
    marginBottom: 20,
  },
  qrPlaceholder: {
    width: 200,
    height: 200,
  },
  sectionLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  sectionLabelSpaced: {
    marginTop: 20,
  },
  linkRow: {
    backgroundColor: colors.panelLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  linkText: {
    color: colors.courtBlue,
    fontSize: 13,
  },
  messageBox: {
    backgroundColor: colors.panelLight,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  messageText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  copyButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 13,
    alignItems: 'center',
  },
  copyButtonSecondary: {
    backgroundColor: colors.panelLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  copyButtonLabel: {
    color: colors.courtBlueDeep,
    fontSize: 14,
    fontWeight: '800',
  },
  copyButtonLabelSecondary: {
    color: colors.lineWhite,
  },
});
