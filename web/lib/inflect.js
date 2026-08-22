// =====================================================================
//  語形変化の照合
//
//  例文の中から出題語を見つけて「空所」にするために使う。
//  英検4級は不規則動詞の過去形（bought / went / wrote …）が出題範囲なので、
//  例文でもそれらを積極的に使っている。単純な前方一致では拾えないため、
//  「その語が取りうる形」を先に作ってから、語として完全一致で探す。
//
//  ※ 旧実装（語幹の前方一致）は cry→cried や save→saving を拾えないうえ、
//    無関係な語（play が player を隠す等）まで隠す危険があった。
// =====================================================================

// 英検4級の範囲で出てくる不規則動詞（原形: [過去形, 過去分詞]）
const IRREGULAR = {
  become: ['became', 'become'],
  begin: ['began', 'begun'],
  break: ['broke', 'broken'],
  bring: ['brought', 'brought'],
  build: ['built', 'built'],
  buy: ['bought', 'bought'],
  catch: ['caught', 'caught'],
  choose: ['chose', 'chosen'],
  come: ['came', 'come'],
  cost: ['cost', 'cost'],
  draw: ['drew', 'drawn'],
  drink: ['drank', 'drunk'],
  drive: ['drove', 'driven'],
  eat: ['ate', 'eaten'],
  feel: ['felt', 'felt'],
  find: ['found', 'found'],
  fly: ['flew', 'flown'],
  forget: ['forgot', 'forgotten'],
  get: ['got', 'gotten'],
  give: ['gave', 'given'],
  go: ['went', 'gone'],
  grow: ['grew', 'grown'],
  hear: ['heard', 'heard'],
  hit: ['hit', 'hit'],
  keep: ['kept', 'kept'],
  know: ['knew', 'known'],
  learn: ['learned', 'learnt'],
  leave: ['left', 'left'],
  lend: ['lent', 'lent'],
  lose: ['lost', 'lost'],
  make: ['made', 'made'],
  meet: ['met', 'met'],
  pay: ['paid', 'paid'],
  put: ['put', 'put'],
  read: ['read', 'read'],
  ride: ['rode', 'ridden'],
  run: ['ran', 'run'],
  say: ['said', 'said'],
  see: ['saw', 'seen'],
  sell: ['sold', 'sold'],
  send: ['sent', 'sent'],
  sing: ['sang', 'sung'],
  sleep: ['slept', 'slept'],
  speak: ['spoke', 'spoken'],
  spend: ['spent', 'spent'],
  stand: ['stood', 'stood'],
  swim: ['swam', 'swum'],
  take: ['took', 'taken'],
  teach: ['taught', 'taught'],
  tell: ['told', 'told'],
  think: ['thought', 'thought'],
  throw: ['threw', 'thrown'],
  understand: ['understood', 'understood'],
  wake: ['woke', 'woken'],
  wear: ['wore', 'worn'],
  win: ['won', 'won'],
  write: ['wrote', 'written'],
};

// 不規則な複数形（英検4級で問われるもの）
const IRREGULAR_PLURAL = {
  child: ['children'],
  man: ['men'],
  woman: ['women'],
  foot: ['feet'],
  tooth: ['teeth'],
  person: ['people'],
  leaf: ['leaves'],
  knife: ['knives'],
};

const VOWELS = 'aeiou';

/** 子音+母音+子音で終わる短い語か（stop→stopped のように語尾を重ねる候補） */
function doublesFinal(w) {
  if (w.length < 3 || w.length > 6) return false;
  const [a, b, c] = [w.at(-3), w.at(-2), w.at(-1)];
  if ('wxy'.includes(c)) return false;
  return !VOWELS.includes(a) && VOWELS.includes(b) && !VOWELS.includes(c);
}

/**
 * その語が例文中で取りうる形をすべて返す。
 * 規則変化は機械的に作り、不規則変化だけ表で補う。
 */
export function wordForms(word) {
  const w = String(word || '').toLowerCase();
  if (!w) return [];
  const forms = new Set([w]);
  const add = (s) => s && forms.add(s);

  // 三人称単数・複数形
  if (/(s|x|z|ch|sh)$/.test(w)) add(w + 'es');
  else if (/[^aeiou]y$/.test(w)) add(w.slice(0, -1) + 'ies');
  else add(w + 's');

  // 過去形・過去分詞（規則）
  // stop→stopped のように語尾を重ねるかは、つづりだけでは決めきれない
  // （visit→visited は重ねない）。実際の例文と突き合わせて探す用途なので、
  // 重ねる形・重ねない形の両方を候補に入れ、当たった方を採用する。
  if (w.endsWith('e')) add(w + 'd');
  else if (/[^aeiou]y$/.test(w)) add(w.slice(0, -1) + 'ied');
  else {
    add(w + 'ed');
    if (doublesFinal(w)) add(w + w.at(-1) + 'ed');
  }

  // ing形
  if (w.endsWith('ie')) add(w.slice(0, -2) + 'ying');
  else if (w.endsWith('e') && !w.endsWith('ee')) add(w.slice(0, -1) + 'ing');
  else {
    add(w + 'ing');
    if (doublesFinal(w)) add(w + w.at(-1) + 'ing');
  }

  // 比較級・最上級（形容詞用。名詞・動詞に作っても実際の例文には現れないので無害）
  if (w.endsWith('e')) { add(w + 'r'); add(w + 'st'); }
  else if (/[^aeiou]y$/.test(w)) { add(w.slice(0, -1) + 'ier'); add(w.slice(0, -1) + 'iest'); }

  (IRREGULAR[w] || []).forEach(add);
  (IRREGULAR_PLURAL[w] || []).forEach(add);

  // 長い形から先に試す（goes より going を優先して取り違えないため）
  return [...forms].sort((a, b) => b.length - a.length);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 文の中から出題語（活用形を含む）を1つ見つけ、前後に切り分ける。
 * 見つからなければ null。
 */
export function findWordInSentence(sentence, word) {
  const s = String(sentence || '');
  if (!s) return null;
  for (const form of wordForms(word)) {
    // ハイフンを含む語（e-mail）にも当たるよう、語境界は自前で判定する
    const re = new RegExp(`(^|[^A-Za-z'-])(${escapeRe(form)})(?![A-Za-z'-])`, 'i');
    const m = s.match(re);
    if (m) {
      const start = m.index + m[1].length;
      return {
        before: s.slice(0, start),
        hidden: m[2],
        after: s.slice(start + m[2].length),
      };
    }
  }
  return null;
}

/** 出題語を空所（____）に置きかえた文を返す。作れなければ null。 */
export function toBlank(sentence, word, blank = '(     )') {
  const hit = findWordInSentence(sentence, word);
  if (!hit) return null;
  return { text: `${hit.before}${blank}${hit.after}`, answer: hit.hidden, ...hit };
}
