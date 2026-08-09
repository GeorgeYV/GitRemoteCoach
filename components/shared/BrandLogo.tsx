import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../lib/theme';

/** App wordmark for dark-background headers (LoginScreen, RegisterScreen) — uses the
 * transparent icon-only mark plus a Text wordmark in lineWhite/ballLime, since the source
 * logo's navy "Remote" text isn't legible against the app's dark background. */
export default function BrandLogo({ size = 40 }: { size?: number }) {
  return (
    <View style={styles.row}>
      <Image source={require('../../assets/logo-mark.png')} style={{ width: size, height: size }} resizeMode="contain" />
      <Text style={styles.wordmark}>
        Remote<Text style={styles.wordmarkAccent}>Coach</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wordmark: {
    color: colors.lineWhite,
    fontSize: 20,
    fontWeight: '800',
  },
  wordmarkAccent: {
    color: colors.ballLime,
  },
});
