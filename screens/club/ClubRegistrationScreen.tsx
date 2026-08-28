import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DocumentRow from '../../components/coach/DocumentRow';
import IconTextInput from '../../components/shared/IconTextInput';
import { useAuth } from '../../context/AuthContext';
import { ApiError, Club, CountryCode, registerClub, updateClub, uploadClubIdentityDocument } from '../../lib/api';
import { CLUB_TYPE_ARTICLE, CLUB_TYPE_LABELS, CLUB_TYPE_LABELS_LOWER } from '../../lib/clubType';
import { colors, radius, withOpacity } from '../../lib/theme';
import { isValidEmail } from '../../lib/validation';
import { COUNTRY_LABELS, COUNTRY_OPTIONS, DocumentItem } from '../../mock/coachFlow';

const TYPE_OPTIONS: { value: 'club' | 'federation'; label: string }[] = [
  { value: 'club', label: CLUB_TYPE_LABELS.club },
  { value: 'federation', label: CLUB_TYPE_LABELS.federation },
];

/** null antes de elegir tipo — club es masculino ("el club"), federación es femenino ("la
 * federación"), así que no alcanza con pegar la palabra: hace falta el artículo correcto. Sin
 * tipo todavía, se evita la construcción "el/la X" (género ambiguo) con una frase genérica. */
function identityDoc(type: 'club' | 'federation' | null): DocumentItem {
  const phrase = type ? `${CLUB_TYPE_ARTICLE[type]} ${CLUB_TYPE_LABELS_LOWER[type]}` : 'tu cuenta';
  return {
    id: 'identity',
    title: `Identificación oficial de quien registra ${phrase}`,
    subtitle: `INE, pasaporte o cédula — obligatoria para poder aprobar ${phrase}`,
    status: 'pending',
  };
}

export default function ClubRegistrationScreen({
  club,
  onSuccess,
  onBack,
  tabBar,
}: {
  /** Si viene seteado, la pantalla edita este club (PUT) en vez de crear uno nuevo (POST). */
  club?: Club;
  onSuccess?: (club: Club) => void;
  onBack?: () => void;
  tabBar?: React.ReactNode;
}) {
  const { token } = useAuth();
  const [name, setName] = useState(club?.name ?? '');
  const [type, setType] = useState<'club' | 'federation' | null>(club?.type ?? null);
  const [city, setCity] = useState(club?.city ?? '');
  const [country, setCountry] = useState<CountryCode | null>(club?.country ?? null);
  const [contactEmail, setContactEmail] = useState(club?.contactEmail ?? '');
  const [contactPhone, setContactPhone] = useState(club?.contactPhone ?? '');
  // Solo aplica al alta (club === undefined) — editar un club ya existente no vuelve a pedir
  // identidad, mismo criterio que ClubRegistrationScreen "Editar perfil" no toca documentos de
  // coach tampoco (ver decisión #43 en db/schema.sql).
  const [identityDocState, setIdentityDocState] = useState<Pick<DocumentItem, 'status' | 'fileUrl'>>({ status: 'pending' });
  const [uploadingIdentityDoc, setUploadingIdentityDoc] = useState(false);
  const [identityDocError, setIdentityDocError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "club o federación" antes de elegir tipo; la palabra exacta ya elegida (alta) o del registro
  // existente (edición) en cuanto se sabe.
  const typeLabelLower = type ? CLUB_TYPE_LABELS_LOWER[type] : 'club o federación';
  const doc = identityDoc(type);
  const identityDocValue: DocumentItem = { ...doc, ...identityDocState };

  const canSubmit =
    name.trim().length > 0 &&
    type !== null &&
    city.trim().length > 0 &&
    !!country &&
    (!!club || (identityDocState.status === 'uploaded' && !!identityDocState.fileUrl)) &&
    !submitting;

  /** Sube el archivo real de identidad a R2 antes de marcarlo "subido" — se llama antes de que el
   * club exista, así que el server lo guarda bajo el propio usuario autenticado (ver
   * clubService.uploadIdentityDocumentFile). */
  async function handlePickIdentityDocument() {
    if (!token) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso necesario', 'Activa el acceso a tus fotos para subir este documento.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];

    setIdentityDocError(null);
    setUploadingIdentityDoc(true);
    try {
      const { fileUrl } = await uploadClubIdentityDocument(token, {
        uri: asset.uri,
        name: asset.fileName ?? 'documento.jpg',
        type: asset.mimeType ?? 'image/jpeg',
        file: asset.file,
      });
      setIdentityDocState({ status: 'uploaded', fileUrl });
    } catch (err) {
      setIdentityDocError(err instanceof ApiError ? err.message : 'No se pudo subir el documento. Intenta de nuevo.');
    } finally {
      setUploadingIdentityDoc(false);
    }
  }

  async function handleSubmit() {
    if (!token || !type || !country) {
      setError('No hay una sesión activa.');
      return;
    }
    if (contactEmail.trim() && !isValidEmail(contactEmail.trim())) {
      setError('Correo de contacto inválido.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const params = {
      name: name.trim(),
      type,
      city: city.trim(),
      country,
      contactEmail: contactEmail.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
      identityDocumentUrl: identityDocState.fileUrl ?? '',
    };
    try {
      const result = club ? await updateClub(token, club.id, params) : await registerClub(token, params);
      onSuccess?.(result);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : `No se pudo ${club ? 'guardar los cambios' : `registrar tu ${typeLabelLower}`}. Intenta de nuevo.`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        {club && onBack && (
          <Pressable style={styles.backButton} onPress={onBack}>
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
        )}
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{club ? `Editar ${typeLabelLower}` : 'Registra tu club o federación'}</Text>
          <Text style={styles.headerSubtitle}>
            {club
              ? `Actualiza los datos de tu ${typeLabelLower}.`
              : 'Crea el perfil de tu club o federación para invitar entrenadores y organizar torneos.'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>Tipo</Text>
        <View style={styles.typeRow}>
          {TYPE_OPTIONS.map((opt) => {
            const active = type === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => setType(opt.value)}
                style={[styles.typeChip, active && styles.typeChipActive]}
              >
                <Text style={[styles.typeChipLabel, active && styles.typeChipLabelActive]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <IconTextInput icon="business-outline" placeholder="Nombre del club o federación" value={name} onChangeText={setName} />
        <IconTextInput icon="location-outline" placeholder="Ciudad" value={city} onChangeText={setCity} />

        <Text style={styles.sectionLabel}>País</Text>
        <View style={styles.typeRow}>
          {COUNTRY_OPTIONS.map((option) => {
            const active = country === option;
            return (
              <Pressable
                key={option}
                onPress={() => setCountry(option)}
                style={[styles.typeChip, active && styles.typeChipActive]}
              >
                <Text style={[styles.typeChipLabel, active && styles.typeChipLabelActive]}>
                  {COUNTRY_LABELS[option]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {!club && (
          <>
            <Text style={styles.sectionLabel}>Identidad</Text>
            <DocumentRow doc={identityDocValue} uploading={uploadingIdentityDoc} onPressUpload={handlePickIdentityDocument} />
            {identityDocError && <Text style={styles.errorText}>{identityDocError}</Text>}
          </>
        )}

        <IconTextInput
          icon="mail-outline"
          placeholder="Correo de contacto (opcional)"
          value={contactEmail}
          onChangeText={setContactEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <IconTextInput
          icon="call-outline"
          placeholder="Teléfono de contacto (opcional)"
          value={contactPhone}
          onChangeText={setContactPhone}
          keyboardType="phone-pad"
        />

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
              <Ionicons name={club ? 'checkmark-outline' : 'business-outline'} size={18} color={colors.courtBlueDeep} />
              <Text style={styles.submitLabel}>{club ? 'Guardar cambios' : `Crear ${typeLabelLower}`}</Text>
            </View>
          )}
        </Pressable>
      </ScrollView>
      {tabBar}
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
  sectionLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  typeChip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  typeChipActive: {
    backgroundColor: colors.ballLime,
  },
  typeChipLabel: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
  },
  typeChipLabelActive: {
    color: colors.courtBlueDeep,
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
});
