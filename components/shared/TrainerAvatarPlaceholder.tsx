import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../../lib/theme';

/** Circular placeholder with a diagonal-stripe pattern, used wherever a trainer
 * doesn't have a real profile photo yet. */
export default function TrainerAvatarPlaceholder({ size = 60 }: { size?: number }) {
  const stripeWidth = size * 0.26;
  const stripeCount = 6;
  const stripes = Array.from({ length: stripeCount });

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
      {stripes.map((_, i) => (
        <View
          key={i}
          style={[
            styles.stripe,
            {
              width: stripeWidth,
              height: size * 2,
              left: i * stripeWidth * 1.6 - size * 0.5,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.panelLight,
    overflow: 'hidden',
  },
  stripe: {
    position: 'absolute',
    top: '-50%',
    backgroundColor: colors.panel,
    transform: [{ rotate: '35deg' }],
  },
});
