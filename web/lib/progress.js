// 学習進捗を端末(localStorage)に保存し、数値で可視化するためのヘルパー
import { TOTAL_WORDS } from './words';
import { ERROR_TYPES } from './errorTypes';

const KEY = 'toeic_progress_v2';

const empty = {
  learnedIds: [], // 一度でも正解した単語ID
  reviewIds: [], // 間違えたまま、まだ正解し直していない単語ID（復習キュー）
  errorTypes: {}, // 誤答タイプ別の累計 { confusion: 3, pos: 1, ... }
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
  if (typeof window === 'undefined') return { ...empty };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...empty };
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return { ...empty };

    const errorTypes = {};
    if (saved.errorTypes && typeof saved.errorTypes === 'object') {
      for (const key of Object.keys(ERROR_TYPES)) {
        errorTypes[key] = asCount(saved.errorTypes[key]);
      }
    }

    return {
      learnedIds: asIdArray(saved.learnedIds),
      reviewIds: asIdArray(saved.reviewIds),
      errorTypes,
      totalAnswered: asCount(saved.totalAnswered),
      totalCorrect: asCount(saved.totalCorrect),
      sessions: asCount(saved.sessions),
      lastDate: typeof saved.lastDate === 'string' ? saved.lastDate : null,
      streak: asCount(saved.streak),
    };
  } catch {
    return { ...empty };
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
 */
export function recordAnswer(wordId, correct, errorType) {
  const p = loadProgress();
  p.totalAnswered += 1;
  if (correct) {
    p.totalCorrect += 1;
    if (!p.learnedIds.includes(wordId)) p.learnedIds.push(wordId);
    p.reviewIds = p.reviewIds.filter((id) => id !== wordId); // 克服した
  } else {
    if (!p.reviewIds.includes(wordId)) p.reviewIds.push(wordId);
    if (errorType) p.errorTypes[errorType] = (p.errorTypes[errorType] || 0) + 1;
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

// 表示用の集計値
export function getStats() {
  const p = loadProgress();
  const learned = p.learnedIds.length;
  const accuracy = p.totalAnswered > 0 ? Math.round((p.totalCorrect / p.totalAnswered) * 100) : 0;
  // 学習量の可視化（学習済み単語の割合）
  const mastery = Math.round((learned / TOTAL_WORDS) * 100);
  // 700点到達度 = 学習カバー率7割 + 定着度（正解率）3割 の合成指標
  const readiness = Math.round(mastery * 0.7 + accuracy * 0.3);

  return {
    learned,
    total: TOTAL_WORDS,
    accuracy,
    sessions: p.sessions,
    streak: p.streak || 0,
    mastery,
    readiness,
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
