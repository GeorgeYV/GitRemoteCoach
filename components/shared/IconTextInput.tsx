import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import { colors } from '../../lib/theme';

/** Text input with a leading icon, same visual treatment (pill, panel background)
 * as the plain inputs it replaces — just with an icon for faster scanning. */
export default function IconTextInput({
  icon,
  style,
  ...props
}: TextInputProps & { icon: React.ComponentProps<typeof Ionicons>['name'] }) {
  return (
    <View style={styles.wrapper}>
      <Ionicons name={icon} size={18} color={colors.textDim} style={styles.icon} />
      <TextInput style={[styles.input, style]} placeholderTextColor={colors.textDim} {...props} />
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
