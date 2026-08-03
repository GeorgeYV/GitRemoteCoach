import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../../lib/theme';
import { CoachReview } from '../../mock/coachFlow';
import InitialAvatar from '../shared/InitialAvatar';

export default function ReviewCard({ review }: { review: CoachReview }) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <InitialAvatar initial={review.parentInitial} size={32} />
        <View style={styles.headerText}>
          <Text style={styles.name}>{review.parentName}</Text>
          <Text style={styles.stars}>{'★'.repeat(review.stars)}</Text>
        </View>
        <Text style={styles.date}>{review.date}</Text>
      </View>
      <Text style={styles.quote}>“{review.quote}”</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerText: {
    flex: 1,
    marginLeft: 10,
  },
  name: {
    color: colors.lineWhite,
    fontSize: 13,
    fontWeight: '700',
  },
  stars: {
    color: colors.ballLime,
    fontSize: 12,
    marginTop: 1,
  },
  date: {
    color: colors.textDim,
    fontSize: 11,
  },
  quote: {
    color: colors.textSoft,
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 19,
  },
});
