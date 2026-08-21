import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, spacing, radius, shadow } from '../theme';
import { words } from '../data/words';
import { speak, SPEEDS } from '../speech';
import SpeedToggle from '../components/SpeedToggle';

// 配列をシャッフル
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 各問題に4択の選択肢を用意（正解＋ダミー3つ）
function buildQuestions() {
  return shuffle(words).map((q) => {
    const distractors = shuffle(words.filter((w) => w.id !== q.id)).slice(0, 3);
    const options = shuffle([q, ...distractors]);
    return { ...q, options };
  });
}

export default function QuizScreen({ onBack, speedIndex, onCycleSpeed }) {
  const rate = SPEEDS[speedIndex].rate;
  const [quiz, setQuiz] = useState(() => buildQuestions());
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  const current = quiz[index];
  const answered = selected !== null;

  const choose = (opt) => {
    if (answered) return;
    setSelected(opt);
    if (opt.id === current.id) setScore((s) => s + 1);
  };

  const next = () => {
    if (index + 1 >= quiz.length) {
      setDone(true);
      return;
    }
    setSelected(null);
    setIndex(index + 1);
  };

  const restart = () => {
    setQuiz(buildQuestions());
    setIndex(0);
    setSelected(null);
    setScore(0);
    setDone(false);
  };

  if (done) {
    const perfect = score === quiz.length;
    const good = score >= quiz.length * 0.7;
    return (
      <View style={styles.container}>
        <TopBar onBack={onBack} index={quiz.length} total={quiz.length} score={score} />
        <View style={styles.resultBox}>
          <Text style={styles.resultEmoji}>{perfect ? '🏆' : good ? '🎉' : '💪'}</Text>
          <Text style={styles.resultTitle}>
            {perfect ? 'パーフェクト！' : good ? 'よくできました！' : 'もう一歩！'}
          </Text>
          <Text style={styles.resultScore}>
            {quiz.length}問中 <Text style={{ color: colors.secondary }}>{score}</Text> 問 正解
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
      <TopBar onBack={onBack} index={index + 1} total={quiz.length} score={score} />

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${(index / quiz.length) * 100}%` }]} />
      </View>

      <View style={styles.questionCard}>
        <Text style={styles.questionLabel}>この単語の意味は？</Text>
        <Text style={styles.questionWord}>{current.word}</Text>
        <View style={styles.controlRow}>
          <TouchableOpacity
            style={styles.speakBtn}
            onPress={() => speak(current.word, rate)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.speakEmoji}>🔊 発音</Text>
          </TouchableOpacity>
          <SpeedToggle speedIndex={speedIndex} onCycle={onCycleSpeed} />
        </View>
      </View>

      <View style={styles.options}>
        {current.options.map((opt) => {
          const isCorrect = opt.id === current.id;
          const isPicked = selected && selected.id === opt.id;
          let state = 'idle';
          if (answered) {
            if (isCorrect) state = 'correct';
            else if (isPicked) state = 'wrong';
            else state = 'dim';
          }
          return (
            <TouchableOpacity
              key={opt.id}
              activeOpacity={0.9}
              onPress={() => choose(opt)}
              style={[styles.option, stateStyles[state], shadow]}
            >
              <Text style={[styles.optionText, state === 'correct' || state === 'wrong' ? { color: '#fff' } : null]}>
                {opt.meaning}
              </Text>
              {answered && isCorrect && <Text style={styles.mark}>✓</Text>}
              {answered && isPicked && !isCorrect && <Text style={styles.mark}>✕</Text>}
            </TouchableOpacity>
          );
        })}
      </View>

      {answered && (
        <TouchableOpacity style={[styles.nextBtn, shadow]} onPress={next}>
          <Text style={styles.nextBtnText}>
            {index + 1 >= quiz.length ? '結果を見る' : '次の問題へ'} →
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function TopBar({ onBack, index, total, score }) {
  return (
    <View style={styles.topBar}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn}>
        <Text style={styles.backText}>← ホーム</Text>
      </TouchableOpacity>
      <View style={styles.scorePill}>
        <Text style={styles.scoreText}>⭐ {score}</Text>
      </View>
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
  scorePill: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  scoreText: { color: colors.ink, fontWeight: '900', fontSize: 14 },
  progressTrack: {
    height: 10,
    backgroundColor: colors.line,
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  progressFill: { height: '100%', backgroundColor: colors.secondary, borderRadius: 5 },
  questionCard: {
    backgroundColor: colors.secondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
    ...shadow,
  },
  questionLabel: { color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: 14, marginBottom: spacing.xs },
  questionWord: { color: '#fff', fontWeight: '900', fontSize: 40 },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  speakBtn: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  speakEmoji: { color: '#fff', fontWeight: '800', fontSize: 14 },
  options: { gap: spacing.sm },
  option: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 3,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionText: { color: colors.ink, fontWeight: '800', fontSize: 18 },
  mark: { color: '#fff', fontWeight: '900', fontSize: 20 },
  nextBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  nextBtnText: { color: '#fff', fontWeight: '900', fontSize: 17 },
  // 結果
  resultBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  resultEmoji: { fontSize: 64, marginBottom: spacing.sm },
  resultTitle: { fontSize: 24, fontWeight: '900', color: colors.ink, marginBottom: spacing.xs },
  resultScore: { fontSize: 18, fontWeight: '800', color: colors.ink, marginBottom: spacing.lg },
  primaryBtn: {
    backgroundColor: colors.secondary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  primaryBtnText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  ghostBtn: { paddingVertical: spacing.sm },
  ghostBtnText: { color: colors.sub, fontWeight: '800', fontSize: 14 },
});

// 選択肢の状態別スタイル
const stateStyles = StyleSheet.create({
  idle: {},
  correct: { backgroundColor: colors.green, borderColor: colors.green },
  wrong: { backgroundColor: colors.red, borderColor: colors.red },
  dim: { opacity: 0.5 },
});
