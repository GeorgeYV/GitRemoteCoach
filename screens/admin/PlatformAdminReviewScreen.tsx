import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import {
  ApiError,
  CoachVerificationDocumentWithCoachName,
  listPendingVerificationDocuments,
  reviewVerificationDocument,
} from '../../lib/api';
import { colors, radius } from '../../lib/theme';
import { VERIFICATION_DOC_LABELS } from '../../mock/coachFlow';

interface CoachGroup {
  coachId: string;
  coachName: string;
  documents: CoachVerificationDocumentWithCoachName[];
}

function groupByCoach(documents: CoachVerificationDocumentWithCoachName[]): CoachGroup[] {
  const groups = new Map<string, CoachGroup>();
  for (const doc of documents) {
    const existing = groups.get(doc.coachId);
    if (existing) {
      existing.documents.push(doc);
    } else {
      groups.set(doc.coachId, { coachId: doc.coachId, coachName: doc.coachName, documents: [doc] });
    }
  }
  return Array.from(groups.values());
}

export default function PlatformAdminReviewScreen() {
  const { token } = useAuth();
  const [documents, setDocuments] = useState<CoachVerificationDocumentWithCoachName[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actingOnId, setActingOnId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function load() {
    if (!token) {
      setError('No hay una sesión activa.');
      return;
    }
    setError(null);
    listPendingVerificationDocuments(token)
      .then(setDocuments)
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar la cola de revisión.');
      });
  }

  useEffect(load, [token]);

  async function respond(documentId: string, status: 'approved' | 'rejected') {
    if (!token) return;
    setActingOnId(documentId);
    setActionError(null);
    try {
      await reviewVerificationDocument(token, documentId, status);
      setDocuments((prev) => prev?.filter((d) => d.id !== documentId) ?? null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo enviar tu revisión. Intenta de nuevo.');
    } finally {
      setActingOnId(null);
    }
  }

  const groups = documents ? groupByCoach(documents) : null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Revisión de documentos</Text>
        <Text style={styles.headerSubtitle}>Aprueba o rechaza los documentos de verificación pendientes.</Text>
      </View>

      {error ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      ) : !groups ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color={colors.courtBlue} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {actionError && <Text style={styles.actionErrorText}>{actionError}</Text>}

          {groups.length === 0 ? (
            <Text style={styles.emptyText}>No hay documentos pendientes de revisión.</Text>
          ) : (
            groups.map((group) => (
              <View key={group.coachId} style={styles.coachCard}>
                <Text style={styles.coachName}>{group.coachName}</Text>
                <View style={styles.docList}>
                  {group.documents.map((doc) => {
                    const label = VERIFICATION_DOC_LABELS[doc.docType];
                    const acting = actingOnId === doc.id;
                    return (
                      <View key={doc.id} style={styles.docRow}>
                        <View style={styles.docInfo}>
                          <Text style={styles.docTitle}>{label.title}</Text>
                          {label.optional && <Text style={styles.docOptional}>Opcional</Text>}
                        </View>
                        <View style={styles.docActions}>
                          <Pressable
                            style={styles.rejectButton}
                            onPress={() => respond(doc.id, 'rejected')}
                            disabled={acting}
                          >
                            <Ionicons name="close-circle-outline" size={16} color={colors.errorCoral} />
                          </Pressable>
                          <Pressable
                            style={styles.approveButton}
                            onPress={() => respond(doc.id, 'approved')}
                            disabled={acting}
                          >
                            {acting ? (
                              <ActivityIndicator color={colors.courtBlueDeep} size="small" />
                            ) : (
                              <Ionicons name="checkmark-circle-outline" size={16} color={colors.courtBlueDeep} />
                            )}
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
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
    paddingBottom: 16,
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
  content: {
    padding: 20,
    paddingBottom: 24,
    gap: 14,
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
  actionErrorText: {
    color: colors.errorCoral,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 4,
  },
  coachCard: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  coachName: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 12,
  },
  docList: {
    gap: 10,
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.panelLight,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  docInfo: {
    flex: 1,
    marginRight: 8,
  },
  docTitle: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
  },
  docOptional: {
    color: colors.textDim,
    fontSize: 11,
    marginTop: 1,
  },
  docActions: {
    flexDirection: 'row',
    gap: 8,
  },
  rejectButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.errorCoral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.ballLime,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
