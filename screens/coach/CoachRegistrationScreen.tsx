import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DocumentRow from '../../components/coach/DocumentRow';
import TrainerAvatarPlaceholder from '../../components/shared/TrainerAvatarPlaceholder';
import { AgeCategory, ApiError, PlayingLevel, updateCoachTraining } from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';
import { AGE_CATEGORY_OPTIONS, DocumentItem, LEVEL_OPTIONS, mockDocumentChecklist } from '../../mock/coachFlow';
import { mockCarlosMedinaProfile } from '../../mock/parentFlow';

const LEVEL_LABEL_TO_VALUE: Record<string, PlayingLevel> = {
  Recreativo: 'recreativo',
  Competitivo: 'competitivo',
  'Alto rendimiento': 'alto_rendimiento',
};

export default function CoachRegistrationScreen({ onSubmit }: { onSubmit?: () => void }) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [experience, setExperience] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>(mockDocumentChecklist);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(list: string[], value: string, setList: (v: string[]) => void) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function markUploaded(id: string) {
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, status: 'uploaded' } : d)));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await updateCoachTraining(mockCarlosMedinaProfile.trainer.id, {
        ageCategories: categories as AgeCategory[],
        levels: levels.map((label) => LEVEL_LABEL_TO_VALUE[label]),
      });
      onSubmit?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar tu registro. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  const requiredDocsReady = documents.filter((d) => !d.optional).every((d) => d.status === 'uploaded');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Únete como entrenador</Text>
        <Text style={styles.headerSubtitle}>
          Verificamos tu perfil una sola vez para proteger a los jugadores, a sus familias y a ti.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.photoBlock}>
          <View style={styles.photoWrap}>
            <TrainerAvatarPlaceholder size={88} />
            <Pressable style={styles.photoAddButton}>
              <Text style={styles.photoAddIcon}>+</Text>
            </Pressable>
          </View>
          <Text style={styles.photoHint}>Agregar foto de perfil</Text>
        </View>

        <Section label="Datos personales">
          <TextInput
            style={styles.input}
            placeholder="Nombre completo"
            placeholderTextColor={colors.textDim}
            value={name}
            onChangeText={setName}
          />
          <View style={styles.row2}>
            <TextInput
              style={[styles.input, styles.inputHalf]}
              placeholder="Ciudad"
              placeholderTextColor={colors.textDim}
              value={city}
              onChangeText={setCity}
            />
            <TextInput
              style={[styles.input, styles.inputHalf]}
              placeholder="Región / Estado"
              placeholderTextColor={colors.textDim}
              value={region}
              onChangeText={setRegion}
            />
          </View>
          <TextInput
            style={styles.input}
            placeholder="Años de experiencia entrenando"
            placeholderTextColor={colors.textDim}
            value={experience}
            onChangeText={setExperience}
            keyboardType="number-pad"
          />
        </Section>

        <Section label="Categorías de edad">
          <ChipGroup options={AGE_CATEGORY_OPTIONS} selected={categories} onToggle={(v) => toggle(categories, v, setCategories)} />
        </Section>

        <Section label="Nivel de juego">
          <ChipGroup options={LEVEL_OPTIONS} selected={levels} onToggle={(v) => toggle(levels, v, setLevels)} />
        </Section>

        <Section label="Documentos">
          <Text style={styles.trustNote}>
            Solo se usan para verificar tu identidad y experiencia. No se comparten con los padres ni con otros entrenadores.
          </Text>
          <View style={styles.documentsList}>
            {documents.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} onPressUpload={() => markUploaded(doc.id)} />
            ))}
          </View>
        </Section>
      </ScrollView>

      <View style={styles.footer}>
        {error && <Text style={styles.errorText}>{error}</Text>}
        {!requiredDocsReady && (
          <Text style={styles.footerHint}>Sube los documentos obligatorios para continuar</Text>
        )}
        <Pressable
          style={[styles.submitButton, (!requiredDocsReady || submitting) && styles.submitButtonDisabled]}
          disabled={!requiredDocsReady || submitting}
          onPress={handleSubmit}
        >
          {submitting ? (
            <ActivityIndicator color={colors.courtBlueDeep} />
          ) : (
            <Text style={styles.submitLabel}>Enviar para verificación</Text>
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

function ChipGroup({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <Pressable key={option} onPress={() => onToggle(option)} style={[styles.chip, active && styles.chipActive]}>
            <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
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
  photoBlock: {
    alignItems: 'center',
    marginBottom: 26,
  },
  photoWrap: {
    position: 'relative',
  },
  photoAddButton: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.ballLime,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
  },
  photoAddIcon: {
    color: colors.courtBlueDeep,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 18,
  },
  photoHint: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 10,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
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
  row2: {
    flexDirection: 'row',
    gap: 10,
  },
  inputHalf: {
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  chipActive: {
    backgroundColor: colors.ballLime,
  },
  chipLabel: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
  },
  chipLabelActive: {
    color: colors.courtBlueDeep,
  },
  trustNote: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 14,
  },
  documentsList: {
    gap: 0,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.courtBlueDeep,
    padding: 16,
  },
  footerHint: {
    color: colors.textDim,
    fontSize: 11,
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
  },
  submitButtonDisabled: {
    backgroundColor: withOpacity(colors.ballLime, 0.3),
  },
  submitLabel: {
    color: colors.courtBlueDeep,
    fontSize: 15,
    fontWeight: '800',
  },
});
