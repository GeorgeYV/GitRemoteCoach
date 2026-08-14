import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { Pressable, StyleProp, StyleSheet, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { colors } from '../../lib/theme';

/** Text input with a leading icon, same visual treatment (pill, panel background)
 * as the plain inputs it replaces — just with an icon for faster scanning.
 * secureTextEntry fields also get a trailing eye toggle to reveal what was typed. */
export default function IconTextInput({
  icon,
  style,
  containerStyle,
  secureTextEntry,
  ...props
}: TextInputProps & { icon: React.ComponentProps<typeof Ionicons>['name']; containerStyle?: StyleProp<ViewStyle> }) {
  const [revealed, setRevealed] = useState(false);
  const isPasswordField = secureTextEntry === true;

  return (
    <View style={[styles.wrapper, containerStyle]}>
      <Ionicons name={icon} size={18} color={colors.textDim} style={styles.icon} />
      <TextInput
        style={[styles.input, style]}
        placeholderTextColor={colors.textDim}
        secureTextEntry={isPasswordField ? !revealed : secureTextEntry}
        {...props}
      />
      {isPasswordField && (
        <Pressable onPress={() => setRevealed((v) => !v)} hitSlop={8}>
          <Ionicons name={revealed ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textDim} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
    paddingHorizontal: 14,
  },
  icon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    color: colors.lineWhite,
    fontSize: 14,
  },
});
