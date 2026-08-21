// =====================================================================
//  「紛らわしさ」の判定ロジック（誤答選択肢の生成と、誤答タイプの分類で共用）
//
//  支給データの表記ゆれに耐えるため、素朴な文字列一致ではなくトークン集合で扱う:
//   - 意味     「供給・提供する」「提供する・与える」→ 「提供する」が共通 ＝ 紛らわしい
//   - 品詞     「名詞/動詞」と「動詞/名詞」→ 同じ品詞として扱う
//   - 場面     「メール・報告」「メール・荷物」→ 「メール」が共通
// =====================================================================
import wordlist from '@/data/toeic_wordlist.json';

/** 「A・B、C」のような列挙文字列をトークン配列にする */
export function tokens(s) {
  return String(s || '')
    .split(/[・、,／/]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

/** 品詞「名詞/動詞」を {名詞, 動詞} の集合にする */
export function posSet(pos) {
  return new Set(
    String(pos || '')
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

/** 2つの集合に共通要素があるか */
export function intersects(a, b) {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

// ---------------------------------------------------------------------
// ビジネス場面タグの出現頻度
// 「財務」「人事」「契約」のように多くの語で共有されるタグは、
// 一致しても「同じ場面で混同した」根拠として弱いので除外する。
// しきい値5は、支給300語での分布シミュレーションで
// 誤答タイプが4種に偏りなく分かれる値として決定した。
// ---------------------------------------------------------------------
const SCENE_TAG_MAX_FREQ = 5;

const sceneTagFreq = new Map();
for (const w of wordlist) {
  for (const t of tokens(w.example_scene)) {
    sceneTagFreq.set(t, (sceneTagFreq.get(t) || 0) + 1);
  }
}

/** 汎用的すぎるタグを除いた、その語に固有な場面タグの集合 */
export function sceneTags(scene) {
  return new Set(tokens(scene).filter((t) => (sceneTagFreq.get(t) || 0) <= SCENE_TAG_MAX_FREQ));
}

/** 意味が部分的に重なるか（「供給・提供する」⇔「提供する・与える」） */
export function meaningsOverlap(a, b) {
  return intersects(new Set(tokens(a)), new Set(tokens(b)));
}

/** 品詞がまったく重ならないか（「動詞」⇔「名詞」= true、「名詞/動詞」⇔「動詞/名詞」= false） */
export function posDiffers(a, b) {
  const sa = posSet(a);
  const sb = posSet(b);
  if (!sa.size || !sb.size) return false;
  return !intersects(sa, sb);
}

/** 固有な場面タグが重なるか */
export function scenesOverlap(a, b) {
  return intersects(sceneTags(a), sceneTags(b));
}

/** 一方の「混同しやすい類似語」リストに、他方の単語が載っているか */
export function listedAsSimilar(wordA, similarA, wordB, similarB) {
  const a = tokens(similarA);
  const b = tokens(similarB);
  return a.includes(String(wordB).toLowerCase()) || b.includes(String(wordA).toLowerCase());
}
