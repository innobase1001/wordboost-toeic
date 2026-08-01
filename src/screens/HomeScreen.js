import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { colors, spacing, radius, shadow, modeColors } from '../theme';
import { words } from '../data/words';

// モード選択カード
function ModeCard({ emoji, title, subtitle, color, onPress }) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[styles.card, { backgroundColor: color }, shadow]}>
      <View style={styles.emojiBadge}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.arrow}>→</Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen({ onSelectMode }) {
  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.hello}>今日も英語、がんばろう！</Text>
        <Text style={styles.title}>
          English <Text style={{ color: colors.primary }}>Quizu</Text> 📚
        </Text>
        <View style={styles.statPill}>
          <Text style={styles.statText}>収録単語 {words.length} 語</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>モードを選ぼう</Text>

      <ModeCard
        emoji="🃏"
        title="フラッシュカード"
        subtitle="カードをめくって暗記しよう"
        color={modeColors.flashcard}
        onPress={() => onSelectMode('flashcard')}
      />
      <ModeCard
        emoji="✏️"
        title="4択クイズ"
        subtitle="意味を当てて定着チェック"
        color={modeColors.quiz}
        onPress={() => onSelectMode('quiz')}
      />

      <View style={styles.tipBox}>
        <Text style={styles.tipTitle}>💡 おすすめの流れ</Text>
        <Text style={styles.tipText}>
          まずフラッシュカードで暗記 → クイズで定着チェック！{'\n'}この2ステップで単語がしっかり身につきますよ。
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  header: {
    marginBottom: spacing.lg,
  },
  hello: {
    color: colors.sub,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: '900',
  },
  statPill: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  statText: {
    color: colors.ink,
    fontWeight: '800',
    fontSize: 13,
  },
  sectionLabel: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  emojiBadge: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  emoji: { fontSize: 28 },
  cardTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
  },
  cardSubtitle: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  arrow: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900',
    marginLeft: spacing.xs,
  },
  tipBox: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: colors.line,
  },
  tipTitle: {
    color: colors.ink,
    fontWeight: '800',
    fontSize: 15,
    marginBottom: 4,
  },
  tipText: {
    color: colors.sub,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  },
});
