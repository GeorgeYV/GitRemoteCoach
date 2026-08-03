import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, withOpacity } from '../../lib/theme';
import { DocumentItem } from '../../mock/coachFlow';

/** Upload row for a single verification document, used on the coach registration form. */
export default function DocumentRow({ doc, onPressUpload }: { doc: DocumentItem; onPressUpload: () => void }) {
  const uploaded = doc.status === 'uploaded';

  return (
    <View style={styles.row}>
      <View style={[styles.iconBadge, uploaded && styles.iconBadgeDone]}>
        <Text style={[styles.iconGlyph, uploaded && styles.iconGlyphDone]}>{uploaded ? '✓' : '+'}</Text>
      </View>
      <View style={styles.textWrap}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{doc.title}</Text>
          {doc.optional && <Text style={styles.optionalTag}>Opcional</Text>}
        </View>
        <Text style={styles.subtitle}>{doc.subtitle}</Text>
      </View>
      <Pressable style={[styles.uploadButton, uploaded && styles.uploadButtonDone]} onPress={onPressUpload}>
        <Text style={[styles.uploadLabel, uploaded && styles.uploadLabelDone]}>{uploaded ? 'Subido' : 'Subir'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withOpacity(colors.textDim, 0.16),
    marginRight: 12,
  },
  iconBadgeDone: {
    backgroundColor: colors.ballLime,
  },
  iconGlyph: {
    color: colors.textSoft,
    fontSize: 14,
    fontWeight: '800',
  },
  iconGlyphDone: {
    color: colors.courtBlueDeep,
  },
  textWrap: {
    flex: 1,
    marginRight: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    color: colors.lineWhite,
    fontSize: 13,
    fontWeight: '700',
  },
  optionalTag: {
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  subtitle: {
    color: colors.textDim,
    fontSize: 11,
    marginTop: 2,
  },
  uploadButton: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: withOpacity(colors.ballLime, 0.14),
  },
  uploadButtonDone: {
    backgroundColor: 'transparent',
  },
  uploadLabel: {
    color: colors.ballLime,
    fontSize: 12,
    fontWeight: '800',
  },
  uploadLabelDone: {
    color: colors.textDim,
  },
});
