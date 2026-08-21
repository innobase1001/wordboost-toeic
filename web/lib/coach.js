// =====================================================================
//  オフラインAIコーチ（APIキーが無くても全機能が動くためのローカル実装）
//
//  設計方針:
//   - ビジネス例文・実践ヒントは Claude（Claude Code）で事前生成し
//     data/coach_pack.json に同梱する（＝実行時のAPI課金ゼロ・待ち時間ゼロ）。
//   - 「なぜ間違えたか」は支給データ（品詞・ビジネス場面・類似語）と
//     ユーザーの誤答から誤答タイプを判定して組み立てる。
//   - APIキーが設定されている場合は、この結果をClaude APIの応答で上書きする。
// =====================================================================
import pack from '@/data/coach_pack.json';
import wordlist from '@/data/toeic_wordlist.json';
import { ERROR_TYPES } from './errorTypes';

const byWord = new Map(wordlist.map((w) => [w.word.toLowerCase(), w]));

export function getPrebaked(wordId) {
  return pack[String(wordId)] || null;
}

function similarList(similar) {
  if (!similar) return [];
  return similar.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/**
 * 誤答タイプを判定する。
 * 優先度: 類似語の混同 > 品詞の取り違え > 場面イメージ違い > 記憶が薄い
 */
export function classifyError({ word, pos, similar, exampleScene, chosenWord, chosenPos, chosenScene }) {
  if (!chosenWord) return 'memory';

  const targetSimilar = similarList(similar);
  const chosen = byWord.get(String(chosenWord).toLowerCase()) || null;
  const chosenSimilar = similarList(chosen?.similar);

  // 互いに「混同しやすい類似語」として登録されていれば混同
  if (
    targetSimilar.includes(chosenWord.toLowerCase()) ||
    chosenSimilar.includes(String(word).toLowerCase())
  ) {
    return 'confusion';
  }
  if (chosenPos && pos && chosenPos !== pos) return 'pos';
  if (chosenScene && exampleScene && chosenScene === exampleScene) return 'scene';
  return 'memory';
}

/** 誤答タイプごとに「なぜ間違えたか」の説明文を組み立てる */
function buildReason(type, p) {
  const { word, meaning, pos, exampleScene, similar, chosenMeaning, chosenWord, chosenPos } = p;
  switch (type) {
    case 'confusion':
      return `${chosenWord ? `${chosenWord}（${chosenMeaning}）` : `「${chosenMeaning}」`}と混同したようです。${word} は「${meaning}」で、${exampleScene}の場面で使われます。特に ${similar} との違いを意識すると迷いが減ります。`;
    case 'pos':
      return `選んだ「${chosenMeaning}」は${chosenPos}の意味でした。${word} は${pos}なので、文の中での働きが違います。品詞から絞り込むと選択肢を2つ減らせます。`;
    case 'scene':
      return `同じ「${exampleScene}」の場面で使われる語どうしの取り違えです。${word} は「${meaning}」という一点で区別しましょう。`;
    default:
      return `${word} =「${meaning}」がまだ定着していないようです。${exampleScene}の場面とセットで、もう一度出会っておきましょう。`;
  }
}

/**
 * 1問分のフィードバック（オフライン版）
 * Claude API が使えない場合のフォールバックであり、単体でも成立する品質を目指す。
 */
export function localFeedback(p) {
  const pre = getPrebaked(p.wordId) || {};
  const errorType = p.correct
    ? null
    : classifyError({
        word: p.word,
        pos: p.pos,
        similar: p.similar,
        exampleScene: p.exampleScene,
        chosenWord: p.chosenWord,
        chosenPos: p.chosenPos,
        chosenScene: p.chosenScene,
      });

  return {
    reason: p.correct ? '' : buildReason(errorType, p),
    error_type: errorType,
    example_en: pre.en || '',
    example_ja: pre.ja || '',
    tip: pre.tip || `${p.similar} との違いを意識すると定着します。`,
    ai: false,
  };
}

/** 10問終了後の総括（オフライン版） */
export function localSummary({ total, correctCount, results, learnedTotal, weakness }) {
  const rate = Math.round((correctCount / Math.max(total, 1)) * 100);
  const wrong = results.filter((r) => !r.correct);
  const right = results.filter((r) => r.correct);

  // 今回の誤答で最も多かったタイプ
  const tally = {};
  wrong.forEach((r) => {
    if (r.errorType) tally[r.errorType] = (tally[r.errorType] || 0) + 1;
  });
  const topType = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
  const top = topType ? ERROR_TYPES[topType] : null;

  const headline =
    rate === 100 ? '全問正解！完璧な10問 🎉'
      : rate >= 80 ? '好調キープ、いい流れです 🔥'
        : rate >= 50 ? '半分以上クリア、前進中 💪'
          : '伸びしろが見つかった10問 🌱';

  const good = right.length
    ? `${total}問中${correctCount}問正解（${rate}%）。特に ${right.slice(0, 3).map((r) => r.word).join(' / ')} は意味をしっかり選べていました。学習済みは累計 ${learnedTotal} 語です。`
    : `今日は${total}問すべてが「初めて出会う手応え」でした。ここで会えた${wrong.length}語が、そのまま伸びしろになります。`;

  const advice = top
    ? `今回の誤答は「${top.label}」が最多（${tally[topType]}件）でした。次回は${top.advice}ところから始めてみましょう。`
    : '間違いゼロでした。次はレベルを1つ上げて、まだ会っていない単語を増やしていきましょう。';

  const focus = wrong.length
    ? `${wrong.slice(0, 3).map((r) => `${r.word}（${r.meaning}）`).join('、')} — 次回の最初の3問に自動で再登場します。`
    : `${right.slice(-2).map((r) => r.word).join('、')} を例文ごと音読して、「使える」状態まで持っていきましょう。`;

  const weakLine = weakness?.topLabel
    ? `これまでの累計でも「${weakness.topLabel}」が弱点タイプの1位です。`
    : '';

  return {
    headline,
    good: good + (weakLine ? ` ${weakLine}` : ''),
    advice,
    focus,
    ai: false,
  };
}
