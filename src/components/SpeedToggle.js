import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '../theme';
import { SPEEDS } from '../speech';

// 読み上げ速度を切り替えるボタン（タップで ゆっくり→ふつう→速い を循環）
export default function SpeedToggle({ speedIndex, onCycle }) {
  const current = SPEEDS[speedIndex];
  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={onCycle}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={styles.text}>{current.label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.line,
  },
  text: { color: colors.ink, fontWeight: '800', fontSize: 13 },
});
