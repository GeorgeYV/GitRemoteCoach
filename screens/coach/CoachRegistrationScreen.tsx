import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DocumentRow from '../../components/coach/DocumentRow';
import IconTextInput from '../../components/shared/IconTextInput';
import TrainerAvatarPlaceholder from '../../components/shared/TrainerAvatarPlaceholder';
import { useAuth } from '../../context/AuthContext';
import {
  AgeCategory,
  ApiError,
  CoachProfileWithTraining,
  CountryCode,
  PlayingLevel,
  registerCoachProfile,
  updateCoachProfileDetails,
  updateCoachTraining,
} from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';
import {
  AGE_CATEGORY_OPTIONS,
  COUNTRY_LABELS,
  COUNTRY_OPTIONS,
  DocumentItem,
  LEVEL_OPTIONS,
  VERIFICATION_DOC_CHECKLIST,
} from '../../mock/coachFlow';

/** No hay almacenamiento real de archivos todavía: el checklist sigue siendo interactivo, pero el
 * backend recibe un placeholder en vez de un archivo real por cada documento marcado como subido. */
const PLACEHOLDER_FILE_URL_PREFIX = 'placeholder://';

const LEVEL_LABEL_TO_VALUE: Record<string, PlayingLevel> = {
  Recreativo: 'recreativo',
  Competitivo: 'competitivo',
  'Alto rendimiento': 'alto_rendimiento',
};

const LEVEL_VALUE_TO_LABEL: Record<PlayingLevel, string> = {
  recreativo: 'Recreativo',
  competitivo: 'Competitivo',
  alto_rendimiento: 'Alto rendimiento',
};

export default function CoachRegistrationScreen({
  profile,
  onSubmit,
  onBack,
}: {
  /** Si viene seteado, la pantalla edita este perfil (PUT) en vez de crear uno nuevo (POST) —
   * oculta la sección de documentos, que va por el flujo de verificación aparte. */
  profile?: CoachProfileWithTraining;
  onSubmit?: () => void;
  onBack?: () => void;
}) {
  const { token, user, updateProfile } = useAuth();
  const [name, setName] = useState(profile ? user?.fullName ?? '' : '');
  const [city, setCity] = useState(profile?.profile.city ?? '');
  const [region, setRegion] = useState(profile?.profile.region ?? '');
  const [country, setCountry] = useState<CountryCode | null>(profile?.profile.country ?? null);
  const [experience, setExperience] = useState(profile ? String(profile.profile.yearsExperience) : '');
  const [hourlyRate, setHourlyRate] = useState(profile ? String(Number(profile.profile.hourlyRate)) : '');
  const [categories, setCategories] = useState<string[]>(profile?.ageCategories ?? []);
  const [levels, setLevels] = useState<string[]>(profile?.levels.map((l) => LEVEL_VALUE_TO_LABEL[l]) ?? []);
  const [documents, setDocuments] = useState<DocumentItem[]>(VERIFICATION_DOC_CHECKLIST);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(list: string[], value: string, setList: (v: string[]) => void) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function markUploaded(id: string) {
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, status: 'uploaded' } : d)));
  }

  async function handleSubmit() {
    if (!token) {
      setError('No hay una sesión activa.');
      return;
    }
    if (!country) return;
    setSubmitting(true);
    setError(null);
    try {
      if (profile) {
        const coachId = profile.profile.userId;
        await Promise.all([
          updateProfile({ fullName: name.trim() }),
          updateCoachProfileDetails(token, coachId, {
            city,
            region: region.trim() || undefined,
            country,
            yearsExperience: Number(experience) || 0,
            hourlyRate: Number(hourlyRate) || 0,
            // La pantalla nunca mostró un campo de especialidad para editar — se reenvía tal
            // cual para no perderla si el coach ya la tenía seteada por otra vía.
            specialty: profile.profile.specialty ?? undefined,
          }),
          updateCoachTraining(token, coachId, {
            ageCategories: categories as AgeCategory[],
            levels: levels.map((label) => LEVEL_LABEL_TO_VALUE[label]),
          }),
        ]);
      } else {
        await registerCoachProfile(token, {
          city,
          region: region.trim() || undefined,
          country,
          yearsExperience: Number(experience) || 0,
          hourlyRate: Number(hourlyRate) || 0,
          ageCategories: categories as AgeCategory[],
          levels: levels.map((label) => LEVEL_LABEL_TO_VALUE[label]),
          documents: documents
            .filter((d) => d.status === 'uploaded')
            .map((d) => ({ docType: d.id, fileUrl: `${PLACEHOLDER_FILE_URL_PREFIX}${d.id}` })),
        });
      }
      onSubmit?.();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : `No se pudo ${profile ? 'guardar los cambios' : 'enviar tu registro'}. Intenta de nuevo.`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  const requiredDocsReady = profile ? true : documents.filter((d) => !d.optional).every((d) => d.status === 'uploaded');
  const canSubmit = requiredDocsReady && !!country && !submitting;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        {profile && onBack && (
          <Pressable style={styles.backButton} onPress={onBack}>
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
        )}
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{profile ? 'Editar perfil' : 'Únete como entrenador'}</Text>
          <Text style={styles.headerSubtitle}>
            {profile
              ? 'Actualiza tus datos, tarifa y las categorías/niveles que atiendes.'
              : 'Verificamos tu perfil una sola vez para proteger a los jugadores, a sus familias y a ti.'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.photoBlock}>
          <View style={styles.photoWrap}>
            <TrainerAvatarPlaceholder size={88} />
            <Pressable
              style={styles.photoAddButton}
              onPress={() => Alert.alert('Foto de perfil', 'Próximamente: sube una foto de perfil real.')}
            >
              <Text style={styles.photoAddIcon}>+</Text>
            </Pressable>
          </View>
          <Text style={styles.photoHint}>Agregar foto de perfil</Text>
        </View>

        <Section label="Datos personales">
          <IconTextInput icon="person-outline" placeholder="Nombre completo" value={name} onChangeText={setName} />
          <View style={styles.row2}>
            <IconTextInput
              icon="location-outline"
              containerStyle={styles.inputHalf}
              placeholder="Ciudad"
              value={city}
              onChangeText={setCity}
            />
            <IconTextInput
              icon="map-outline"
              containerStyle={styles.inputHalf}
              placeholder="Región / Estado"
              value={region}
              onChangeText={setRegion}
            />
          </View>
          <IconTextInput
            icon="time-outline"
            placeholder="Años de experiencia entrenando"
            value={experience}
            onChangeText={setExperience}
            keyboardType="number-pad"
          />
          <IconTextInput
            icon="cash-outline"
            placeholder="Tarifa por hora ($)"
            value={hourlyRate}
            onChangeText={setHourlyRate}
            keyboardType="number-pad"
          />
        </Section>

        <Section label="País donde entrenas">
          <View style={styles.chipRow}>
            {COUNTRY_OPTIONS.map((option) => {
              const active = country === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => setCountry(option)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{COUNTRY_LABELS[option]}</Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section label="Categorías de edad">
          <ChipGroup options={AGE_CATEGORY_OPTIONS} selected={categories} onToggle={(v) => toggle(categories, v, setCategories)} />
        </Section>

        <Section label="Nivel de juego">
          <ChipGroup options={LEVEL_OPTIONS} selected={levels} onToggle={(v) => toggle(levels, v, setLevels)} />
        </Section>

        {!profile && (
          <Section label="Documentos">
            <Text style={styles.trustNote}>
              Solo se usan para verificar tu identidad y experiencia. No se comparten con los padres ni con otros
              entrenadores.
            </Text>
            <View style={styles.documentsList}>
              {documents.map((doc) => (
                <DocumentRow key={doc.id} doc={doc} onPressUpload={() => markUploaded(doc.id)} />
              ))}
            </View>
          </Section>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {error && <Text style={styles.errorText}>{error}</Text>}
        {!requiredDocsReady && (
          <Text style={styles.footerHint}>Sube los documentos obligatorios para continuar</Text>
        )}
        {requiredDocsReady && !country && (
          <Text style={styles.footerHint}>Elige tu país para continuar</Text>
        )}
        <Pressable
          style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
          disabled={!canSubmit}
          onPress={handleSubmit}
        >
          {submitting ? (
            <ActivityIndicator color={colors.courtBlueDeep} />
          ) : (
            <View style={styles.submitContent}>
              <Ionicons name={profile ? 'checkmark-outline' : 'shield-checkmark-outline'} size={18} color={colors.courtBlueDeep} />
              <Text style={styles.submitLabel}>{profile ? 'Guardar cambios' : 'Enviar para verificación'}</Text>
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
    backgroundColor: colors.panel,
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
