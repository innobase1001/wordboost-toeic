// 学習進捗を端末(localStorage)に保存し、数値で可視化するためのヘルパー
//
// 英検4級は「筆記35問 + リスニング30問」で、リスニングが3分の1近くを占める。
// そのため進捗も語彙・筆記・リスニングの3本立てで持ち、
// 合格到達度もこの3つの合成として出す（詳しくは getStats のコメント）。
import { TOTAL_WORDS } from './modes';
import { ERROR_TYPES } from './errorTypes';

const KEY = 'eiken4_progress_v1';

// モード別の集計キー。画面の「技能別の仕上がり」と1対1で対応する。
export const MODE_KEYS = ['word', 'blank', 'talk', 'order', 'reading', 'listening'];

// 合格到達度の計算に使う区分
const WRITTEN_MODES = ['word', 'blank', 'talk', 'order', 'reading'];
const LISTENING_MODES = ['listening'];

const emptyModes = () =>
  Object.fromEntries(MODE_KEYS.map((k) => [k, { answered: 0, correct: 0 }]));

const empty = {
  learnedIds: [], // 一度でも正解した単語ID
  reviewIds: [], // 間違えたまま、まだ正解し直していない単語ID（復習キュー）
  errorTypes: {}, // 誤答タイプ別の累計 { confusion: 3, pos: 1, ... }
  modes: {}, // モード別の解答数・正解数（loadProgress で必ず埋める）
  totalAnswered: 0,
  totalCorrect: 0,
  sessions: 0,
  lastDate: null,
  streak: 0,
};

const asIdArray = (v) => (Array.isArray(v) ? v.filter((n) => Number.isInteger(n)) : []);
const asCount = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);

/**
 * 保存済みの進捗を読む。
 * localStorage の中身はユーザーが書き換えられるうえ、旧スキーマが残ることもあるため、
 * 形が違う値は捨てて初期値に寄せる（1問ごとの書き込みで落ちないようにするため）。
 */
export function loadProgress() {
  const blank = { ...empty, learnedIds: [], reviewIds: [], errorTypes: {}, modes: emptyModes() };
  if (typeof window === 'undefined') return blank;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return blank;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return blank;

    const errorTypes = {};
    if (saved.errorTypes && typeof saved.errorTypes === 'object') {
      for (const key of Object.keys(ERROR_TYPES)) {
        errorTypes[key] = asCount(saved.errorTypes[key]);
      }
    }

    const modes = emptyModes();
    if (saved.modes && typeof saved.modes === 'object') {
      for (const key of MODE_KEYS) {
        const m = saved.modes[key];
        if (m && typeof m === 'object') {
          modes[key] = { answered: asCount(m.answered), correct: asCount(m.correct) };
        }
      }
    }

    return {
      learnedIds: asIdArray(saved.learnedIds),
      reviewIds: asIdArray(saved.reviewIds),
      errorTypes,
      modes,
      totalAnswered: asCount(saved.totalAnswered),
      totalCorrect: asCount(saved.totalCorrect),
      sessions: asCount(saved.sessions),
      lastDate: typeof saved.lastDate === 'string' ? saved.lastDate : null,
      streak: asCount(saved.streak),
    };
  } catch {
    return blank;
  }
}

function save(p) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/**
 * 1問回答するたびに呼ぶ。
 * 正解 → 学習済みに追加し、復習キューから外す
 * 不正解 → 復習キューに追加し、誤答タイプを累計する
 * @param {number|null} wordId 語彙系モード（word / blank）のみ。それ以外は null
 * @param {boolean} correct
 * @param {string|null} errorType 語彙系モードのみ
 * @param {string} mode MODE_KEYS のいずれか
 */
export function recordAnswer(wordId, correct, errorType, mode = 'word') {
  const p = loadProgress();
  p.totalAnswered += 1;
  if (correct) p.totalCorrect += 1;

  if (MODE_KEYS.includes(mode)) {
    p.modes[mode].answered += 1;
    if (correct) p.modes[mode].correct += 1;
  }

  // 単語IDを持つモードだけが、学習済みと復習キューを動かす
  if (Number.isInteger(wordId)) {
    if (correct) {
      if (!p.learnedIds.includes(wordId)) p.learnedIds.push(wordId);
      p.reviewIds = p.reviewIds.filter((id) => id !== wordId); // 克服した
    } else {
      if (!p.reviewIds.includes(wordId)) p.reviewIds.push(wordId);
      if (errorType) p.errorTypes[errorType] = (p.errorTypes[errorType] || 0) + 1;
    }
  }

  save(p);
  return p;
}

// 端末のローカル日付を YYYY-MM-DD で返す
// （toISOString() はUTCになり、日本時間だと日付の境目が朝9時にずれてしまう）
function localDate(ts = Date.now()) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// セッション終了時に呼ぶ（連続学習日数を更新）
export function recordSessionDone() {
  const p = loadProgress();
  p.sessions += 1;
  const today = localDate();
  if (p.lastDate !== today) {
    const yesterday = localDate(Date.now() - 86400000);
    p.streak = p.lastDate === yesterday ? (p.streak || 0) + 1 : 1;
    p.lastDate = today;
  } else if (!p.streak) {
    p.streak = 1;
  }
  save(p);
  return p;
}

/** 弱点プロフィール（誤答タイプの内訳と1位） */
export function getWeakness(errorTypes = {}) {
  const items = Object.keys(ERROR_TYPES).map((key) => ({
    key,
    label: ERROR_TYPES[key].label,
    emoji: ERROR_TYPES[key].emoji,
    advice: ERROR_TYPES[key].advice,
    count: errorTypes[key] || 0,
  }));
  const total = items.reduce((s, i) => s + i.count, 0);
  const sorted = [...items].sort((a, b) => b.count - a.count);
  const top = total > 0 ? sorted[0] : null;
  return {
    items: sorted,
    total,
    topKey: top?.key || null,
    topLabel: top?.label || null,
    topEmoji: top?.emoji || null,
    topAdvice: top?.advice || null,
  };
}

const rate = (correct, answered) => (answered > 0 ? Math.round((correct / answered) * 100) : 0);

function groupRate(modes, keys) {
  const answered = keys.reduce((s, k) => s + (modes[k]?.answered || 0), 0);
  const correct = keys.reduce((s, k) => s + (modes[k]?.correct || 0), 0);
  return { answered, correct, rate: rate(correct, answered) };
}

// 表示用の集計値
export function getStats() {
  const p = loadProgress();
  const learned = p.learnedIds.length;
  const accuracy = rate(p.totalCorrect, p.totalAnswered);
  // 語彙のカバー率（学習済み単語の割合）
  const mastery = Math.round((learned / TOTAL_WORDS) * 100);

  const written = groupRate(p.modes, WRITTEN_MODES);
  const listening = groupRate(p.modes, LISTENING_MODES);

  // 4級合格到達度 = 語彙カバー率40% + 筆記の正解率35% + リスニングの正解率25%
  // 本番の配点（筆記35問・リスニング30問）に、語彙はすべての土台という点を加味した重み。
  // まだ解いていない区分は0として扱うので、練習した分だけ数字が伸びる。
  const readiness = Math.round(mastery * 0.4 + written.rate * 0.35 + listening.rate * 0.25);

  const modeStats = Object.fromEntries(
    MODE_KEYS.map((k) => [k, { ...p.modes[k], rate: rate(p.modes[k].correct, p.modes[k].answered) }])
  );

  return {
    learned,
    total: TOTAL_WORDS,
    accuracy,
    sessions: p.sessions,
    streak: p.streak || 0,
    mastery,
    readiness,
    written,
    listening,
    modeStats,
    learnedIds: p.learnedIds,
    reviewIds: p.reviewIds,
    reviewCount: p.reviewIds.length,
    weakness: getWeakness(p.errorTypes),
  };
}

/** 進捗をすべて消す（デモ・動作確認用） */
export function resetProgress() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
