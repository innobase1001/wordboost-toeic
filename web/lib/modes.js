// =====================================================================
//  出題モードの定義と、1セッション分の問題づくり
//
//  英検4級の出題構成にそろえてモードを分けている。
//    筆記 大問1（短文の語句空所補充）  → blank
//    筆記 大問2（会話文の文空所補充）  → talk
//    筆記 大問3（日本文付き語句整序）  → order
//    筆記 大問4（長文の内容一致選択）  → reading
//    リスニング 第1〜3部              → listening
//  これに、すべての土台になる語彙4択（word）と、
//  本番と同じ配分で通しで解く実戦ミニ模試（mock）を加えている。
//
//  画面側が1つの描画ロジックで扱えるよう、どのモードも同じ形の
//  「問題オブジェクト」に正規化して返す（詳しくは buildItem 群のコメント）。
// =====================================================================
import words from '@/data/eiken4_wordlist.json';
import pack from '@/data/coach_pack.json';
import conversations from '@/data/eiken4_conversations.json';
import ordering from '@/data/eiken4_ordering.json';
import listening from '@/data/eiken4_listening.json';
import reading from '@/data/eiken4_reading.json';
import { findWordInSentence } from './inflect';
import { meaningsOverlap, posDiffers, scenesOverlap, tokens } from './similarity';

export const MODES = [
  {
    key: 'word', label: '単語', emoji: '📖',
    exam: '語彙の土台',
    desc: '英単語 → 意味を4択で。AIコーチが誤答タイプを分析します。',
    count: 10,
  },
  {
    key: 'blank', label: '空所補充', emoji: '✏️',
    exam: '筆記 大問1',
    desc: '短い文の空所に入る語を選びます。4級の配点が最も大きい形式です。',
    count: 10,
  },
  {
    key: 'talk', label: '会話', emoji: '💬',
    exam: '筆記 大問2',
    desc: '会話の流れに合う応答を選びます。あいさつ・買い物・道案内が頻出。',
    count: 10,
  },
  {
    key: 'order', label: '並べかえ', emoji: '🔀',
    exam: '筆記 大問3',
    desc: '日本文に合うように語句を並べます。タップで組み立てられます。',
    count: 8,
  },
  {
    key: 'reading', label: '長文', emoji: '📄',
    exam: '筆記 大問4',
    desc: '掲示・Eメール・説明文を読んで3問に答えます。',
    count: 3,
  },
  {
    key: 'listening', label: 'リスニング', emoji: '🎧',
    exam: 'リスニング 第1〜3部',
    desc: '音声を聞いて答えます。4級の3分の1はリスニングです。',
    count: 10,
  },
  {
    key: 'mock', label: '実戦ミニ模試', emoji: '📝',
    exam: '本番と同じ配分',
    desc: '大問1〜4とリスニングを通しで18問。今の実力を測ります。',
    count: 18,
  },
];

export const MODE_MAP = Object.fromEntries(MODES.map((m) => [m.key, m]));

// ---------------------------------------------------------------------
// 共通ユーティリティ
// ---------------------------------------------------------------------
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick(arr, n) {
  return shuffle(arr).slice(0, n);
}

/** 選択肢の並びを混ぜる（正解が何番目に来るかを固定させないため） */
const shuffleOptions = shuffle;

// ---------------------------------------------------------------------
// 語彙4択（word）
// ---------------------------------------------------------------------

// ある単語に対して「紛らわしい」誤答を選ぶ。
// similar には300語リストの外の語も多く含むため、similar 一致だけでは
// 誤答がほぼランダムになる。意味・場面・品詞の重なりも加点して補う。
// 重み付けは英検4級300語でのシミュレーションで、誤答タイプが4種に
// 偏りなく分かれるように決定した（類似語6 / 意味5 / 場面3 / 品詞1）。
function scoreDistractors(target, pool) {
  const sim = tokens(target.similar);
  return pool
    .filter((w) => w.id !== target.id && w.meaning !== target.meaning)
    .map((w) => {
      let score = 0;
      if (sim.includes(w.word.toLowerCase())) score += 6;
      if (meaningsOverlap(w.meaning, target.meaning)) score += 5;
      if (scenesOverlap(w.example_scene, target.example_scene)) score += 3;
      if (!posDiffers(w.pos, target.pos)) score += 1;
      return { w, score: score + Math.random() * 0.9 };
    })
    .sort((a, b) => b.score - a.score);
}

function buildDistractors(target, pool, n = 3, key = 'meaning') {
  const picked = [];
  const used = new Set([target[key]]);
  for (const { w } of scoreDistractors(target, pool)) {
    if (used.has(w[key])) continue;
    used.add(w[key]);
    picked.push(w);
    if (picked.length === n) break;
  }
  return picked;
}

function wordItem(target, isReview) {
  const distractors = buildDistractors(target, words, 3, 'meaning');
  const options = shuffleOptions([
    { text: target.meaning, correct: true, word: target.word, pos: target.pos, scene: target.example_scene, similar: target.similar },
    ...distractors.map((w) => ({
      text: w.meaning, correct: false, word: w.word, pos: w.pos, scene: w.example_scene, similar: w.similar,
    })),
  ]);
  return {
    key: `word-${target.id}`,
    mode: 'word',
    examLabel: '語彙',
    wordId: target.id,
    word: target,
    isReview,
    scene: `${'⭐'.repeat(target.level)} · ${target.pos} · ${target.example_scene}`,
    head: target.word,
    headLang: 'en',
    audio: target.word,
    ask: 'この単語の意味は？',
    options,
  };
}

// ---------------------------------------------------------------------
// 短文の語句空所補充（blank）＝ 筆記 大問1
// ---------------------------------------------------------------------

// 例文の中に「原形そのまま」で出てくる語だけを使う。
// 活用した形（bought / studies）を空所にすると、選択肢も同じ形にそろえる
// 必要があり、機械的に作ると不自然な問題になってしまうため。
const BLANK_POOL = words.filter((w) => {
  const en = pack[String(w.id)]?.en;
  if (!en) return false;
  const hit = findWordInSentence(en, w.word);
  return hit && hit.hidden.toLowerCase() === w.word.toLowerCase();
});

/**
 * 空所補充（大問1）の誤答を選ぶ。
 *
 * 語彙4択とは要件が正反対である点に注意。4択は「意味が近い語」を誤答にするほど良問だが、
 * 空所補充で意味の近い語を入れると **誤答も文として成立してしまう**
 * （"Would you like something to (  )?" に drink と eat の両方が入る）。
 * そこで、品詞はそろえたうえで「類似語・訳語の重なり・同じ場面」をすべて除外し、
 * 文脈で1つに決まる誤答だけを残す。
 */
function blankDistractors(target, stem, n = 3) {
  const targetSim = tokens(target.similar);
  const targetWord = target.word.toLowerCase();

  const usable = (w, level) => {
    if (w.id === target.id) return false;
    if (w.meaning === target.meaning) return false;
    if (posDiffers(w.pos, target.pos)) return false; // 品詞はそろえる
    // すでに問題文に出ている語は誤答にしない（見た目におかしくなる）
    if (findWordInSentence(stem, w.word)) return false;
    // 互いに「混同しやすい類似語」なら、その語も文に入ってしまう可能性が高い
    if (targetSim.includes(w.word.toLowerCase())) return false;
    if (tokens(w.similar).includes(targetWord)) return false;
    if (meaningsOverlap(w.meaning, target.meaning)) return false;
    // 同じ日常場面の語も入れ替わりやすいので、まずは避ける（足りなければ level 1 で許す）
    if (level === 0 && scenesOverlap(w.example_scene, target.example_scene)) return false;
    return true;
  };

  for (const level of [0, 1]) {
    const pool = words.filter((w) => usable(w, level));
    if (pool.length >= n) {
      const out = [];
      const used = new Set([target.word]);
      for (const w of shuffle(pool)) {
        if (used.has(w.word)) continue;
        used.add(w.word);
        out.push(w);
        if (out.length === n) return out;
      }
    }
  }
  // ここに来るのは品詞が特殊な語だけ。最後の手段として品詞条件だけで埋める
  return pick(words.filter((w) => w.id !== target.id && w.meaning !== target.meaning), n);
}

function blankItem(target, isReview) {
  const en = pack[String(target.id)].en;
  const hit = findWordInSentence(en, target.word);
  const stem = `${hit.before}${hit.after}`;
  const distractors = blankDistractors(target, stem, 3);
  // 誤答タイプの判定（類似語・品詞・場面）に使うため、選んだ語の属性も持たせる
  const options = shuffleOptions([
    {
      text: target.word, correct: true, meaning: target.meaning,
      pos: target.pos, scene: target.example_scene, similar: target.similar,
    },
    ...distractors.map((w) => ({
      text: w.word, correct: false, meaning: w.meaning,
      pos: w.pos, scene: w.example_scene, similar: w.similar,
    })),
  ]);
  return {
    key: `blank-${target.id}`,
    mode: 'blank',
    examLabel: '筆記 大問1',
    wordId: target.id,
    word: target,
    isReview,
    scene: `${target.example_scene}`,
    head: `${hit.before}(     )${hit.after}`,
    headLang: 'en',
    ask: '空所に入る語は？',
    options,
    ja: pack[String(target.id)].ja,
    answerSentence: en,
    audio: en,
  };
}

// ---------------------------------------------------------------------
// 会話文の文空所補充（talk）＝ 筆記 大問2
// ---------------------------------------------------------------------
function talkItem(c, { audioOnly = false } = {}) {
  const options = shuffleOptions(
    c.choices.map((text, i) => ({ text, correct: i === c.answer }))
  );
  const blankIndex = c.lines.findIndex((l) => l.text === null);
  // リスニング第1部は「空所より前まで」を流して応答を選ばせる形式なので、
  // 空所のあとに続く発話（答えのヒントになってしまう）は読み上げない。
  const spoken = audioOnly
    ? c.lines.slice(0, blankIndex)
    : c.lines.filter((l) => l.text !== null);
  return {
    key: `talk-${c.id}${audioOnly ? '-l' : ''}`,
    mode: audioOnly ? 'listening' : 'talk',
    examLabel: audioOnly ? 'リスニング 第1部' : '筆記 大問2',
    scene: c.scene,
    dialog: c.lines,
    blankIndex,
    ask: audioOnly ? '会話に続く応答として正しいのは？' : '空所に入る文は？',
    options,
    audioOnly,
    audio: spoken.map((l) => l.text).join(' '),
    // 答え合わせのあとは、空所を正解で埋めた会話全体を聞き直せるようにする
    fullAudio: c.lines.map((l) => (l.text === null ? c.choices[c.answer] : l.text)).join(' '),
    ja: c.ja,
    explain: c.explain,
  };
}

// ---------------------------------------------------------------------
// 日本文付き語句整序（order）＝ 筆記 大問3
// ---------------------------------------------------------------------
function orderItem(o) {
  return {
    key: `order-${o.id}`,
    mode: 'order',
    examLabel: '筆記 大問3',
    kind: 'order',
    scene: o.point,
    ask: '日本文に合うように、語句をタップして並べましょう',
    order: {
      ja: o.ja,
      prefix: o.prefix,
      suffix: o.suffix,
      chunks: shuffle(o.chunks),
      correct: o.chunks,
      answer: o.answer,
    },
    audio: o.answer,
    explain: `【${o.point}】${o.explain}`,
  };
}

// ---------------------------------------------------------------------
// 長文の内容一致選択（reading）＝ 筆記 大問4
// ---------------------------------------------------------------------
function readingItems(p) {
  return p.questions.map((q, i) => ({
    key: `read-${p.id}-${i}`,
    mode: 'reading',
    examLabel: p.typeNote,
    passage: { type: p.type, title: p.title, body: p.body, ja: p.ja },
    showPassage: true,
    scene: p.type,
    head: q.q,
    headLang: 'en',
    ask: '本文に合うものを選びましょう',
    options: shuffleOptions(q.choices.map((text, ci) => ({ text, correct: ci === q.answer }))),
    audio: p.body.replace(/\n+/g, '. '),
    explain: q.explain,
  }));
}

// ---------------------------------------------------------------------
// リスニング 第2部・第3部
// ---------------------------------------------------------------------
function listeningItem(l) {
  return {
    key: `listen-${l.id}`,
    mode: 'listening',
    examLabel: `リスニング 第${l.part}部`,
    scene: l.scene,
    dialog: l.type === 'dialog' ? l.script : null,
    passageText: l.type === 'passage' ? l.script[0].text : null,
    head: l.question,
    headLang: 'en',
    ask: '音声を聞いて答えましょう',
    options: shuffleOptions(l.choices.map((text, i) => ({ text, correct: i === l.answer }))),
    hideScript: true,
    audio: l.script.map((s) => s.text).join(' '),
    ja: l.ja,
    explain: l.explain,
  };
}

// ---------------------------------------------------------------------
// セッション生成
// ---------------------------------------------------------------------

/** レベル指定で語彙プールをしぼる（0 = 全レベル） */
function poolByLevel(pool, level) {
  if (!level) return pool;
  const filtered = pool.filter((w) => w.level === level);
  return filtered.length >= 8 ? filtered : pool;
}

/**
 * 語彙系（word / blank）の出題順を決める。
 *   1. 前回までに間違えた単語（復習キュー）を最大3問、必ず先頭に置く
 *   2. 残りは未習の単語を優先
 *   3. それでも足りなければ既習から補充
 */
function pickWordTargets({ basePool, level, count, learnedIds, reviewIds }) {
  const pool = poolByLevel(basePool, level);
  const learned = new Set(learnedIds);
  const inPool = new Set(basePool.map((w) => w.id));

  const reviewTargets = shuffle(
    reviewIds.filter((id) => inPool.has(id)).map((id) => basePool.find((w) => w.id === id))
  ).slice(0, Math.min(3, count));
  const reviewSet = new Set(reviewTargets.map((w) => w.id));

  const unseen = shuffle(pool.filter((w) => !learned.has(w.id) && !reviewSet.has(w.id)));
  const seen = shuffle(pool.filter((w) => learned.has(w.id) && !reviewSet.has(w.id)));
  const rest = [...unseen, ...seen].slice(0, Math.max(0, count - reviewTargets.length));

  const queue = new Set(reviewIds);
  return [
    ...reviewTargets.map((w) => ({ w, isReview: true })),
    ...shuffle(rest).map((w) => ({ w, isReview: queue.has(w.id) })),
  ];
}

/**
 * 1セッション分の問題を作る。
 * @param {string} mode  MODES の key
 * @param {number} level 0=ミックス / 1..3（語彙系のみ有効）
 * @param {number[]} learnedIds 一度でも正解した単語ID
 * @param {number[]} reviewIds  間違えたまま未克服の単語ID
 */
export function buildSession({ mode = 'word', level = 0, learnedIds = [], reviewIds = [] } = {}) {
  const conf = MODE_MAP[mode] || MODE_MAP.word;

  if (mode === 'word' || mode === 'blank') {
    const basePool = mode === 'blank' ? BLANK_POOL : words;
    const targets = pickWordTargets({ basePool, level, count: conf.count, learnedIds, reviewIds });
    return targets.map(({ w, isReview }) =>
      mode === 'blank' ? blankItem(w, isReview) : wordItem(w, isReview)
    );
  }

  if (mode === 'talk') return pick(conversations, conf.count).map((c) => talkItem(c));

  if (mode === 'order') return pick(ordering, conf.count).map(orderItem);

  if (mode === 'reading') return readingItems(pick(reading, 1)[0]);

  if (mode === 'listening') {
    // 第1部（会話の応答選択）4問 ＋ 第2部・第3部 6問
    const part1 = pick(conversations, 4).map((c) => talkItem(c, { audioOnly: true }));
    const rest = pick(listening, 6).map(listeningItem);
    return [...part1, ...shuffle(rest)];
  }

  if (mode === 'mock') {
    // 本番と同じ流れ: 大問1 → 2 → 3 → 4 → リスニング
    const targets = pickWordTargets({ basePool: BLANK_POOL, level: 0, count: 5, learnedIds, reviewIds });
    // 大問2とリスニング第1部は同じ会話データを使うので、一度に引いてから分ける
    // （別々に引くと、答えを見たあとの会話がリスニングで再登場してしまう）
    const convs = pick(conversations, 5);
    return [
      ...targets.map(({ w, isReview }) => blankItem(w, isReview)),
      ...convs.slice(0, 3).map((c) => talkItem(c)),
      ...pick(ordering, 2).map(orderItem),
      ...readingItems(pick(reading, 1)[0]),
      ...convs.slice(3, 5).map((c) => talkItem(c, { audioOnly: true })),
      ...pick(listening, 3).map(listeningItem),
    ];
  }

  return [];
}

/** 空所補充で出題できる語の数（画面の説明に使う） */
export const BLANK_POOL_SIZE = BLANK_POOL.length;
export const TOTAL_WORDS = words.length;
export const COUNTS = {
  words: words.length,
  conversations: conversations.length,
  ordering: ordering.length,
  listening: listening.length,
  reading: reading.length,
  readingQuestions: reading.reduce((s, p) => s + p.questions.length, 0),
};
