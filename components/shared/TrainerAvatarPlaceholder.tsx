import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { colors } from '../../lib/theme';

/** Foto real del entrenador si ya subió una (coach_profiles.photo_url, ver
 * CoachRegistrationScreen "Agregar foto de perfil"); si no, el placeholder de rayas de
 * siempre. Mismo componente en ambos casos para no tener que tocar cada call site. */
export default function TrainerAvatarPlaceholder({ size = 60, photoUrl }: { size?: number; photoUrl?: string | null }) {
  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.panelLight }}
      />
    );
  }

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
