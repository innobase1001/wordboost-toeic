// TOEIC単語データの読み込みと出題ロジック
import wordlist from '@/data/toeic_wordlist.json';
import { tokens, meaningsOverlap, scenesOverlap, posDiffers } from './similarity';

export const words = wordlist;
export const TOTAL_WORDS = wordlist.length;

// 配列シャッフル
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ある単語に対して「紛らわしい」誤答（意味）を3つ選ぶ
//
// 支給データの similar は、300語リストの外にある語も多く挙げている
// （860トークン中、リスト内に実在するのは約12%）。そのため similar 一致だけに頼ると
// 誤答がほぼランダムになってしまうので、意味・場面・品詞の重なりも加点する。
// 重み付けは支給300語でのシミュレーションで、誤答タイプが4種に偏りなく
// 分かれるように決定した（類似語6 / 意味5 / 場面3 / 品詞1）。
function buildDistractors(target, pool) {
  const sim = tokens(target.similar);
  const scored = pool
    .filter((w) => w.id !== target.id && w.meaning !== target.meaning)
    .map((w) => {
      let score = 0;
      if (sim.includes(w.word.toLowerCase())) score += 6; // 混同しやすい類似語として明記
      if (meaningsOverlap(w.meaning, target.meaning)) score += 5; // 訳語が部分的に重なる
      if (scenesOverlap(w.example_scene, target.example_scene)) score += 3; // 同じビジネス場面
      if (!posDiffers(w.pos, target.pos)) score += 1; // 品詞が重なる
      // 同スコア内はランダムに散らす
      return { w, score: score + Math.random() * 0.9 };
    })
    .sort((a, b) => b.score - a.score);

  const picked = [];
  const usedMeanings = new Set([target.meaning]);
  for (const { w } of scored) {
    if (usedMeanings.has(w.meaning)) continue;
    usedMeanings.add(w.meaning);
    picked.push(w);
    if (picked.length === 3) break;
  }
  return picked;
}

// 選択肢1つ分（誤答タイプ判定のため、選んだ語の品詞・場面も持たせる）
function toOption(w, correct) {
  return {
    meaning: w.meaning,
    word: w.word,
    pos: w.pos,
    scene: w.example_scene,
    similar: w.similar,
    correct,
  };
}

// 1問分（英単語 → 意味4択）を作る
export function buildQuestion(target, pool, isReview = false) {
  const distractors = buildDistractors(target, pool);
  const options = shuffle([
    toOption(target, true),
    ...distractors.map((w) => toOption(w, false)),
  ]);
  return {
    id: target.id,
    word: target.word,
    pos: target.pos,
    meaning: target.meaning,
    level: target.level,
    example_scene: target.example_scene,
    similar: target.similar,
    isReview,
    options,
  };
}

// レベル指定で出題対象を絞る（0 = 全レベルミックス）
function poolByLevel(level) {
  if (!level) return words;
  const filtered = words.filter((w) => w.level === level);
  return filtered.length >= 4 ? filtered : words;
}

/**
 * 10問セッションを作る。
 * 出題順の設計（間隔反復ライト）:
 *   1. 前回までに間違えた単語（復習キュー）を最大3問、必ず先頭に置く
 *   2. 残りは未習の単語を優先
 *   3. それでも足りなければ既習から補充
 * @param {number} level      0=ミックス / 1..3
 * @param {number} count      出題数（既定10問）
 * @param {number[]} learnedIds 一度でも正解した単語ID
 * @param {number[]} reviewIds  間違えたまま未克服の単語ID
 */
export function buildSession({ level = 0, count = 10, learnedIds = [], reviewIds = [] } = {}) {
  const pool = poolByLevel(level);
  const learned = new Set(learnedIds);

  // 1. 復習キュー（レベル絞り込みは無視して必ず拾う ＝ 苦手は必ず再会させる）
  const reviewTargets = shuffle(
    reviewIds.map((id) => words.find((w) => w.id === id)).filter(Boolean)
  ).slice(0, Math.min(3, count));
  const reviewSet = new Set(reviewTargets.map((w) => w.id));

  // 2. 未習優先 → 3. 既習で補充
  const unseen = shuffle(pool.filter((w) => !learned.has(w.id) && !reviewSet.has(w.id)));
  const seen = shuffle(pool.filter((w) => learned.has(w.id) && !reviewSet.has(w.id)));
  const rest = [...unseen, ...seen].slice(0, Math.max(0, count - reviewTargets.length));

  // 4問目以降にも復習キューの語が紛れ込むことがあるため、
  // 「復習キューに載っている語」はすべて復習扱いにする（バッジ表示・AIへの履歴通知を揃える）
  const inQueue = new Set(reviewIds);

  // 復習問題は先頭に固定、残りはシャッフルして並べる
  const questions = [
    ...reviewTargets.map((t) => buildQuestion(t, words, true)),
    ...shuffle(rest).map((t) => buildQuestion(t, words, inQueue.has(t.id))),
  ];

  return questions;
}
