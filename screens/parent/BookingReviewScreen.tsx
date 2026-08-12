import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import IconTextInput from '../../components/shared/IconTextInput';
import InitialAvatar from '../../components/shared/InitialAvatar';
import StarRatingInput from '../../components/parent/StarRatingInput';
import { useAuth } from '../../context/AuthContext';
import { ApiError, submitBookingReview } from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';
import { BookingHistoryEntry } from '../../mock/parentFlow';

const RATING_HINTS: Record<number, string> = {
  1: 'Muy mala experiencia',
  2: 'Mala experiencia',
  3: 'Regular',
  4: 'Buena experiencia',
  5: 'Excelente experiencia',
};

export default function BookingReviewScreen({
  booking,
  onBack,
  onSubmit,
}: {
  booking: BookingHistoryEntry;
  onBack: () => void;
  onSubmit: (stars: number, quote: string) => void;
}) {
  const { token } = useAuth();
  const [stars, setStars] = useState(0);
  const [quote, setQuote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = stars > 0 && !submitting;

  async function handleSubmit() {
    if (stars === 0) return;
    if (!token) {
      setError('No hay una sesión activa.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitBookingReview(token, booking.id, {
        rating: stars,
        comment: quote.trim() || undefined,
      });
      onSubmit(stars, quote.trim());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar la reseña. Intenta de nuevo.');
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
        <Text style={styles.headerTitle}>Dejar reseña</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summaryCard}>
          <InitialAvatar initial={booking.trainerInitial} size={44} />
          <View style={styles.summaryInfo}>
            <Text style={styles.trainerName}>{booking.trainerName}</Text>
            <Text style={styles.summaryMeta}>
              {booking.tournamentName} · {booking.date}
            </Text>
          </View>
        </View>

        <Section label="¿Cómo calificarías la sesión?">
          <View style={styles.ratingBlock}>
            <StarRatingInput value={stars} onChange={setStars} />
            <Text style={styles.ratingHint}>{stars > 0 ? RATING_HINTS[stars] : 'Toca una estrella para calificar'}</Text>
          </View>
        </Section>

        <Section label="Cuéntanos más (opcional)">
          <IconTextInput
            icon="create-outline"
            style={styles.quoteInput}
            placeholder={`¿Cómo fue la experiencia de tu hija con ${booking.trainerName.split(' ')[0]}?`}
            value={quote}
            onChangeText={setQuote}
            multiline
          />
        </Section>
      </ScrollView>

      <View style={styles.footer}>
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
              <Text style={styles.submitLabel}>Enviar reseña</Text>
              <Ionicons name="paper-plane-outline" size={17} color={colors.courtBlueDeep} />
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
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 28,
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
  summaryMeta: {
    color: colors.textDim,
    fontSize: 12,
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
  ratingBlock: {
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 22,
  },
  ratingHint: {
    color: colors.textDim,
    fontSize: 13,
    marginTop: 14,
  },
  quoteInput: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.panel,
    padding: 16,
  },
  submitButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: withOpacity(colors.ballLime, 0.3),
  },
  errorText: {
    color: colors.errorCoral,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
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
});
