import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../lib/theme';

const STAR_VALUES = [1, 2, 3, 4, 5];

export default function StarRatingInput({ value, onChange }: { value: number; onChange: (stars: number) => void }) {
  return (
    <View style={styles.row}>
      {STAR_VALUES.map((star) => (
        <Pressable key={star} onPress={() => onChange(star)} hitSlop={6}>
          <Text style={[styles.star, star <= value && styles.starFilled]}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  star: {
    fontSize: 34,
    color: colors.textDim,
  },
  starFilled: {
    color: colors.ballLime,
  },
});
