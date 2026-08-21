import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Pressable } from 'react-native';
import { colors, spacing, radius, shadow } from '../theme';
import { words } from '../data/words';
import { speak, SPEEDS } from '../speech';
import SpeedToggle from '../components/SpeedToggle';

// 🔊 発音ボタン（カードのタップ＝めくりとは別動作）
function SpeakButton({ text, rate, style }) {
  return (
    <TouchableOpacity
      onPress={() => speak(text, rate)}
      style={[styles.speakBtn, style]}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Text style={styles.speakEmoji}>🔊</Text>
    </TouchableOpacity>
  );
}

export default function FlashcardScreen({ onBack, speedIndex, onCycleSpeed }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(0);
  const [done, setDone] = useState(false);
  const flip = useRef(new Animated.Value(0)).current;
  const rate = SPEEDS[speedIndex].rate;

  const current = words[index];

  const flipCard = () => {
    Animated.spring(flip, {
      toValue: flipped ? 0 : 1,
      useNativeDriver: true,
      friction: 8,
      tension: 10,
    }).start();
    setFlipped(!flipped);
  };

  const next = (remembered) => {
    if (remembered) setKnown((k) => k + 1);
    if (index + 1 >= words.length) {
      setDone(true);
      return;
    }
    // カードを表に戻してから次へ
    flip.setValue(0);
    setFlipped(false);
    setIndex(index + 1);
  };

  const restart = () => {
    setIndex(0);
    setKnown(0);
    setFlipped(false);
    setDone(false);
    flip.setValue(0);
  };

  const frontRotate = flip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotate = flip.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  if (done) {
    return (
      <View style={styles.container}>
        <TopBar onBack={onBack} index={words.length} total={words.length} speedIndex={speedIndex} onCycleSpeed={onCycleSpeed} />
        <View style={styles.resultBox}>
          <Text style={styles.resultEmoji}>🎉</Text>
          <Text style={styles.resultTitle}>おつかれさまでした！</Text>
          <Text style={styles.resultScore}>
            {words.length}語中 <Text style={{ color: colors.purple }}>{known}</Text> 語 覚えた！
          </Text>
          <TouchableOpacity style={[styles.primaryBtn, shadow]} onPress={restart}>
            <Text style={styles.primaryBtnText}>もう一度やる 🔁</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={onBack}>
            <Text style={styles.ghostBtnText}>ホームに戻る</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TopBar onBack={onBack} index={index + 1} total={words.length} speedIndex={speedIndex} onCycleSpeed={onCycleSpeed} />

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${((index) / words.length) * 100}%` }]} />
      </View>

      <View style={styles.cardArea}>
        <Pressable onPress={flipCard} style={styles.cardWrap}>
          {/* 表：英単語 */}
          <Animated.View
            style={[styles.card, styles.cardFront, shadow, { transform: [{ rotateY: frontRotate }] }]}
          >
            <Text style={styles.tapHint}>タップでめくる</Text>
            <Text style={styles.word}>{current.word}</Text>
            <SpeakButton text={current.word} rate={rate} style={styles.speakBtnFront} />
            <Text style={styles.faceLabel}>英単語</Text>
          </Animated.View>
          {/* 裏：意味＋例文 */}
          <Animated.View
            style={[styles.card, styles.cardBack, shadow, { transform: [{ rotateY: backRotate }] }]}
          >
            <Text style={styles.meaning}>{current.meaning}</Text>
            <View style={styles.exampleBox}>
              <View style={styles.exampleHeader}>
                <Text style={styles.example}>{current.example}</Text>
                <SpeakButton text={current.example} rate={rate} style={styles.speakBtnBack} />
              </View>
              <Text style={styles.exampleJa}>{current.exampleJa}</Text>
            </View>
          </Animated.View>
        </Pressable>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.actionBtn, styles.stillBtn]} onPress={() => next(false)}>
          <Text style={styles.actionEmoji}>🤔</Text>
          <Text style={[styles.actionText, { color: colors.red }]}>まだ</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.knownBtn]} onPress={() => next(true)}>
          <Text style={styles.actionEmoji}>✅</Text>
          <Text style={[styles.actionText, { color: colors.green }]}>覚えた</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function TopBar({ onBack, index, total, speedIndex, onCycleSpeed }) {
  return (
    <View style={styles.topBar}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn}>
        <Text style={styles.backText}>← ホーム</Text>
      </TouchableOpacity>
      <SpeedToggle speedIndex={speedIndex} onCycle={onCycleSpeed} />
      <Text style={styles.counter}>{index} / {total}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.md, paddingTop: spacing.xl },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  backBtn: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.line,
  },
  backText: { color: colors.ink, fontWeight: '800', fontSize: 14 },
  counter: { color: colors.sub, fontWeight: '800', fontSize: 15 },
  progressTrack: {
    height: 10,
    backgroundColor: colors.line,
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.purple,
    borderRadius: 5,
  },
  cardArea: {
    flex: 1,
    marginVertical: spacing.md,
    minHeight: 220,
  },
  cardWrap: {
    flex: 1,
    width: '100%',
  },
  card: {
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backfaceVisibility: 'hidden',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cardFront: { backgroundColor: colors.surface, borderWidth: 3, borderColor: colors.purple },
  cardBack: { backgroundColor: colors.purple },
  tapHint: {
    position: 'absolute',
    top: spacing.md,
    color: colors.sub,
    fontSize: 12,
    fontWeight: '700',
  },
  word: { fontSize: 40, fontWeight: '900', color: colors.ink },
  speakBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakEmoji: { fontSize: 22 },
  speakBtnFront: {
    marginTop: spacing.sm,
    backgroundColor: '#F3ECFF',
  },
  speakBtnBack: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    width: 36,
    height: 36,
    borderRadius: 18,
    marginLeft: spacing.xs,
  },
  exampleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  faceLabel: {
    position: 'absolute',
    bottom: spacing.md,
    color: colors.purple,
    fontWeight: '800',
    fontSize: 13,
  },
  meaning: { fontSize: 36, fontWeight: '900', color: '#fff', marginBottom: spacing.md },
  exampleBox: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.md,
    padding: spacing.md,
    width: '100%',
  },
  example: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '700' },
  exampleJa: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '600' },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 3,
  },
  stillBtn: { borderColor: colors.red },
  knownBtn: { borderColor: colors.green },
  actionEmoji: { fontSize: 24, marginBottom: 2 },
  actionText: { fontWeight: '900', fontSize: 16 },
  // 結果
  resultBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultEmoji: { fontSize: 64, marginBottom: spacing.sm },
  resultTitle: { fontSize: 24, fontWeight: '900', color: colors.ink, marginBottom: spacing.xs },
  resultScore: { fontSize: 18, fontWeight: '800', color: colors.ink, marginBottom: spacing.lg },
  primaryBtn: {
    backgroundColor: colors.purple,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  primaryBtnText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  ghostBtn: { paddingVertical: spacing.sm },
  ghostBtnText: { color: colors.sub, fontWeight: '800', fontSize: 14 },
});
