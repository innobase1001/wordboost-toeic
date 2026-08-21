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
import { ERROR_TYPES } from './errorTypes';
import { listedAsSimilar, meaningsOverlap, posDiffers, scenesOverlap } from './similarity';

export function getPrebaked(wordId) {
  return pack[String(wordId)] || null;
}

/**
 * 誤答タイプを判定する。
 * 優先度: 類似語の混同 > 品詞の取り違え > 場面イメージ違い > 記憶が薄い
 *
 * 判定材料は、選択肢自身が持つ語・品詞・場面・類似語。
 * （同じ綴りで意味違いの見出しが複数あるため、単語名からの逆引きはしない）
 */
export function classifyError({
  word, pos, meaning, similar, exampleScene,
  chosenWord, chosenPos, chosenMeaning, chosenScene, chosenSimilar,
}) {
  if (!chosenWord) return 'memory';

  // 1. 互いに「混同しやすい類似語」として登録されている、
  //    または訳語が部分的に重なる（供給・提供する ⇔ 提供する・与える）
  if (
    listedAsSimilar(word, similar, chosenWord, chosenSimilar) ||
    meaningsOverlap(meaning, chosenMeaning)
  ) {
    return 'confusion';
  }
  // 2. 品詞がまったく重ならない
  if (posDiffers(pos, chosenPos)) return 'pos';
  // 3. 固有性の高いビジネス場面タグが重なる
  if (scenesOverlap(exampleScene, chosenScene)) return 'scene';
  return 'memory';
}

/** 誤答タイプごとに「なぜ間違えたか」の説明文を組み立てる */
function buildReason(type, p) {
  const { word, meaning, pos, exampleScene, similar, chosenMeaning, chosenWord, chosenPos } = p;
  switch (type) {
    case 'confusion': {
      const head = chosenWord ? `${chosenWord}（${chosenMeaning}）` : `「${chosenMeaning}」`;
      const tail = similar
        ? `特に ${similar} との違いを意識すると迷いが減ります。`
        : `訳語が一部重なる語なので、使われる場面ごと区別しましょう。`;
      return `${head}と混同したようです。${word} は「${meaning}」で、${exampleScene}の場面で使われます。${tail}`;
    }
    case 'pos':
      return `選んだ「${chosenMeaning}」は${chosenPos}の意味でした。${word} は${pos}なので、文の中での働きが違います。選択肢の品詞から先に絞り込むと、迷いが減ります。`;
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
        meaning: p.meaning,
        similar: p.similar,
        exampleScene: p.exampleScene,
        chosenWord: p.chosenWord,
        chosenPos: p.chosenPos,
        chosenMeaning: p.chosenMeaning,
        chosenScene: p.chosenScene,
        chosenSimilar: p.chosenSimilar,
      });

  return {
    reason: p.correct ? '' : buildReason(errorType, p),
    error_type: errorType,
    example_en: pre.en || '',
    example_ja: pre.ja || '',
    tip: pre.tip || (p.similar ? `${p.similar} との違いを意識すると定着します。` : `${p.word} は「${p.meaning}」。例文ごと覚えると定着します。`),
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
    ? `${wrong.slice(0, 3).map((r) => `${r.word}（${r.meaning}）`).join('、')} — 復習キューに入ったので、次のセッションで再登場します。`
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
