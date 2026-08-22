// =====================================================================
//  発音（読み上げ）エンジン
//
//  英検4級はリスニングが3分の1（第1部〜第3部で30問）を占めるため、
//  単語も例文も「音」とセットで覚えられるようにする。
//
//  設計方針:
//   - ブラウザ標準の Web Speech API（SpeechSynthesis）を使う。
//     → 追加のAPIキーも通信も不要で、実行時コストは0円。オフラインでも鳴る。
//   - 端末に入っている音声のうち、ネイティブ品質の en-US 音声を優先して選ぶ。
//     （Google US English / Microsoft の Natural 音声 / Apple の Samantha など）
//   - 音声リストは非同期で読み込まれる（初回は空配列が返る）ため、
//     voiceschanged を待ってから選び直す。
//   - 対応していない環境（古いブラウザ等）では静かに何もしない。
// =====================================================================

// 品質の高いネイティブ音声から順に探すための手がかり
// （端末によって入っている音声が違うため、名前の一部で当てにいく）
const PREFERRED_VOICES = [
  'Google US English',
  'Microsoft Ava',
  'Microsoft Aria',
  'Microsoft Andrew',
  'Microsoft Emma',
  'Microsoft Jenny',
  'Microsoft Guy',
  'Samantha',
  'Alex',
  'Allison',
];

let cachedVoice = null;
let cachedVoiceCount = 0;

/** この環境で読み上げが使えるか */
export function isSpeechSupported() {
  return typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';
}

/**
 * 使う音声を1つ選ぶ。
 * 優先度: 名前が既知のネイティブ音声 > en-US > en-GB > その他の英語
 */
export function pickVoice() {
  if (!isSpeechSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  // 音声リストは後から増えるので、増えたら選び直す
  if (cachedVoice && voices.length === cachedVoiceCount) return cachedVoice;
  cachedVoiceCount = voices.length;

  const english = voices.filter((v) => /^en(-|_|$)/i.test(v.lang || ''));
  const pool = english.length ? english : voices;

  const byName = PREFERRED_VOICES.map((name) =>
    pool.find((v) => (v.name || '').toLowerCase().includes(name.toLowerCase()))
  ).find(Boolean);

  cachedVoice =
    byName ||
    pool.find((v) => /^en[-_]US$/i.test(v.lang || '')) ||
    pool.find((v) => /^en[-_]GB$/i.test(v.lang || '')) ||
    pool[0] ||
    null;

  return cachedVoice;
}

/** 音声リストの読み込み完了を待つ（初回クリック時に一度だけ効く） */
export function warmUpVoices() {
  if (!isSpeechSupported()) return;
  const synth = window.speechSynthesis;
  if (synth.getVoices().length) {
    pickVoice();
    return;
  }
  const onChange = () => {
    pickVoice();
    synth.removeEventListener('voiceschanged', onChange);
  };
  synth.addEventListener('voiceschanged', onChange);
}

/**
 * 英文を読み上げる。
 * @param {string} text 読み上げる英文
 * @param {object} opts rate: 速さ（1.0が標準／英検4級のリスニングは少しゆっくり）
 *                      onEnd: 読み終わったときに呼ばれる
 * @returns {boolean} 読み上げを開始できたか
 */
export function speak(text, { rate = 0.9, pitch = 1, onEnd, onError } = {}) {
  if (!isSpeechSupported() || !text) return false;
  const synth = window.speechSynthesis;
  try {
    const wasSpeaking = synth.speaking || synth.pending;
    // 連打されたときに前の読み上げが残らないようにする
    synth.cancel();

    const u = new SpeechSynthesisUtterance(String(text));
    const voice = pickVoice();
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = 'en-US';
    }
    u.rate = rate;
    u.pitch = pitch;

    const finish = (e) => {
      stopKeepAlive();
      if (e && e.error && onError) onError(e);
      else if (onEnd) onEnd(e);
    };
    u.onend = finish;
    // 読み上げが途中で切られた場合も「終わった」として扱わないと、
    // 画面が待機状態のまま固まってしまう
    u.onerror = finish;

    const go = () => {
      synth.speak(u);
      // Chrome は15秒ほどで読み上げが勝手に止まる既知の不具合があるため、
      // 長文（大問4の音読）に備えて定期的に resume して繋ぎ止める
      startKeepAlive();
    };
    // cancel() の直後に speak() を呼ぶと発話が落ちることがある（Chrome）
    if (wasSpeaking) setTimeout(go, 120);
    else go();
    return true;
  } catch {
    return false;
  }
}

// ---- Chrome の「長文が途中で止まる」対策 ----
let keepAliveTimer = null;

function startKeepAlive() {
  stopKeepAlive();
  keepAliveTimer = setInterval(() => {
    const synth = window.speechSynthesis;
    if (!synth.speaking) {
      stopKeepAlive();
      return;
    }
    synth.pause();
    synth.resume();
  }, 10000);
}

function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

/** ゆっくり読み上げる（聞き取れなかったときの2回目用） */
export function speakSlow(text, opts = {}) {
  return speak(text, { ...opts, rate: 0.65 });
}

/** 読み上げを止める */
export function stopSpeaking() {
  stopKeepAlive();
  if (!isSpeechSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}
