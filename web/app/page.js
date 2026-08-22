'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { buildSession, MODES, MODE_MAP, COUNTS, BLANK_POOL_SIZE } from '@/lib/modes';
import { recordAnswer, recordSessionDone, getStats, resetProgress } from '@/lib/progress';
import { ERROR_TYPES } from '@/lib/errorTypes';
import { findWordInSentence } from '@/lib/inflect';
import { isSpeechSupported, speak, speakSlow, stopSpeaking, warmUpVoices } from '@/lib/speech';

const LEVELS = [
  { value: 0, label: 'ミックス', hint: '全レベルから' },
  { value: 1, label: '基礎 L1', hint: '中1でならう語' },
  { value: 2, label: '標準 L2', hint: '4級の中心' },
  { value: 3, label: '合格ライン L3', hint: '4級で差がつく語' },
];

// レベル選択が意味を持つのは語彙をあつかうモードだけ
const LEVEL_MODES = ['word', 'blank'];

// 技能別の仕上がりに並べるモード（実戦ミニ模試は中身が他モードなので出さない）
const SKILL_ORDER = ['word', 'blank', 'talk', 'order', 'reading', 'listening'];

/** 読み上げボタン（音声が使えない環境では何も出さない） */
function SpeakButton({ text, label = '🔊', slow = false, className = 'speakBtn' }) {
  if (!text) return null;
  return (
    <button
      type="button"
      className={className}
      aria-label={slow ? 'ゆっくり読み上げる' : '読み上げる'}
      onClick={(e) => {
        e.stopPropagation();
        (slow ? speakSlow : speak)(text);
      }}
    >
      {label}
    </button>
  );
}

export default function Home() {
  const [screen, setScreen] = useState('home');
  const [mode, setMode] = useState('word');
  const [level, setLevel] = useState(0);
  const [stats, setStats] = useState(null);
  const [speechOn, setSpeechOn] = useState(false);

  // クイズ状態
  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [fbLoading, setFbLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [showJa, setShowJa] = useState(false);
  const [picked, setPicked] = useState([]); // 並べかえモードで選んだ語句
  const [results, setResults] = useState([]);
  // セッションを識別する連番。回答中に「やめる」→新セッション開始された場合に
  // 前セッションの遅れて返ってきた回答を捨てるために使う
  const sessionRef = useRef(0);

  // 結果画面
  const [summary, setSummary] = useState(null);
  const [sumLoading, setSumLoading] = useState(false);

  useEffect(() => {
    setStats(getStats());
    setSpeechOn(isSpeechSupported());
    warmUpVoices();
    return () => stopSpeaking();
  }, []);

  const current = questions[qIndex];
  const modeConf = MODE_MAP[mode];

  // 問題が変わったら音声を止め、その問題用の一時状態を初期化する
  useEffect(() => {
    stopSpeaking();
    setShowJa(false);
    setPicked([]);
  }, [qIndex, screen]);

  function start(nextMode = mode) {
    sessionRef.current += 1;
    stopSpeaking();
    const s = getStats();
    const qs = buildSession({
      mode: nextMode,
      level,
      learnedIds: s.learnedIds,
      reviewIds: s.reviewIds,
    });
    if (!qs.length) return;
    setMode(nextMode);
    setQuestions(qs);
    setQIndex(0);
    setSelected(null);
    setFeedback(null);
    setRevealed(false);
    setShowJa(false);
    setPicked([]);
    setResults([]);
    setSummary(null);
    setScreen('quiz');
  }

  /** 1問ぶんの結果を記録して、解説を用意する */
  const commit = useCallback(
    async (item, correct, chosen) => {
      const session = sessionRef.current;
      setFbLoading(true);
      setFeedback(null);
      setRevealed(false);

      // 語彙をあつかうモード（単語・空所補充）だけ、AIコーチの誤答分析にかける。
      // それ以外のモードは問題データ自身が解説を持っているので、待ち時間ゼロで返す。
      const isVocab = item.mode === 'word' || item.mode === 'blank';
      let fb;
      if (isVocab) {
        const w = item.word;
        try {
          const res = await fetch('/api/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              wordId: w.id,
              word: w.word,
              pos: w.pos,
              meaning: w.meaning,
              level: w.level,
              exampleScene: w.example_scene,
              similar: w.similar,
              chosenMeaning: item.mode === 'word' ? chosen?.text : chosen?.meaning,
              chosenWord: item.mode === 'word' ? chosen?.word : chosen?.text,
              chosenPos: chosen?.pos,
              chosenScene: chosen?.scene,
              chosenSimilar: chosen?.similar,
              correct,
              isReview: item.isReview,
              weaknessLabel: stats?.weakness?.topLabel || null,
            }),
          });
          fb = await res.json();
        } catch {
          fb = {
            reason: correct ? '' : `${w.word} の意味は「${w.meaning}」です。`,
            error_type: correct ? null : 'memory',
            example_en: '',
            example_ja: '',
            tip: '',
            ai: false,
          };
        }
      } else {
        fb = {
          reason: correct ? '' : item.explain || '',
          error_type: null,
          example_en: '',
          example_ja: '',
          tip: '',
          ai: false,
          local: true,
        };
      }

      // 応答を待っている間に別セッションが始まっていたら、この回答は捨てる
      if (sessionRef.current !== session) return;

      const errorType = isVocab && !correct ? fb?.error_type || 'memory' : null;
      recordAnswer(isVocab ? item.word.id : null, correct, errorType, item.mode);
      setStats(getStats());

      setResults((r) => [
        ...r,
        {
          mode: item.mode,
          examLabel: item.examLabel,
          label: isVocab ? item.word.word : `${item.examLabel}（${item.scene || ''}）`,
          word: isVocab ? item.word.word : null,
          meaning: isVocab ? item.word.meaning : null,
          chosenMeaning: isVocab ? (item.mode === 'word' ? chosen?.text : chosen?.meaning) : null,
          similar: isVocab ? item.word.similar : null,
          correct,
          isReview: !!item.isReview,
          errorType,
          errorTypeLabel: errorType ? ERROR_TYPES[errorType]?.label : null,
        },
      ]);

      setFeedback(fb);
      setFbLoading(false);
    },
    [stats]
  );

  async function choose(opt) {
    if (selected || !current) return;
    setSelected(opt);
    await commit(current, !!opt.correct, opt);
  }

  /** 並べかえモード: 組み立てた文を判定する */
  async function submitOrder() {
    if (selected || !current) return;
    const built = picked.join(' ');
    const correct = built === current.order.correct.join(' ');
    setSelected({ text: built, correct });
    await commit(current, correct, null);
  }

  function next() {
    stopSpeaking();
    if (qIndex + 1 < questions.length) {
      setQIndex(qIndex + 1);
      setSelected(null);
      setFeedback(null);
      setRevealed(false);
      return;
    }
    // セッション終了 → 結果画面へ
    recordSessionDone();
    const s = getStats();
    setStats(s);
    setScreen('result');
    fetchSummary(s);
  }

  async function fetchSummary(s) {
    const correctCount = results.filter((r) => r.correct).length;
    setSumLoading(true);
    try {
      const res = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modeLabel: modeConf?.label,
          modeExam: modeConf?.exam,
          total: results.length,
          correctCount,
          results,
          learnedTotal: s.learned,
          overallAccuracy: s.accuracy,
          readiness: s.readiness,
          weakness: s.weakness,
        }),
      });
      setSummary(await res.json());
    } catch {
      setSummary(null);
    } finally {
      setSumLoading(false);
    }
  }

  function handleReset() {
    resetProgress();
    setStats(getStats());
  }

  // ---------------- ホーム ----------------
  if (screen === 'home') {
    const weakness = stats?.weakness;
    const showLevels = LEVEL_MODES.includes(mode);
    return (
      <main className="wrap">
        <header className="hero">
          <p className="eyebrow">英検4級 合格 · 中学生のためのスキマ英語アプリ</p>
          <h1 className="title">Word<span className="accent">Boost</span> 4級 🎯</h1>
          <p className="lead">
            単語・筆記・リスニングを1回数分ずつ。AIコーチが「なぜ間違えたか」をタイプ別に教えてくれる、
            英検4級専用の対策アプリです。
          </p>
        </header>

        {stats && (
          <section className="dashboard">
            <div className="statCard">
              <span className="statNum">{stats.readiness}<span className="statDenom">%</span></span>
              <span className="statLabel">4級合格到達度（語彙4割＋筆記3.5割＋リスニング2.5割）</span>
              <div className="bar"><div className="barFill" style={{ width: `${stats.readiness}%` }} /></div>
              <span className="statNote">目安: 70%を超えたら合格ラインです</span>
              <div className="skillRow">
                <div className="skillCell"><b>{stats.mastery}%</b><span>語彙カバー</span></div>
                <div className="skillCell"><b>{stats.written.rate}%</b><span>筆記の正解率</span></div>
                <div className="skillCell"><b>{stats.listening.rate}%</b><span>リスニング正解率</span></div>
              </div>
            </div>
            <div className="statRow">
              <div className="miniStat"><b>{stats.learned}<small>/{stats.total}</small></b><span>覚えた単語</span></div>
              <div className="miniStat"><b>{stats.accuracy}%</b><span>累計正解率</span></div>
              <div className="miniStat"><b>{stats.streak}日</b><span>連続学習</span></div>
            </div>
          </section>
        )}

        {stats && weakness && (
          <section className="weakCard">
            <div className="weakHead">
              <span className="fbTag">あなたの弱点プロフィール</span>
              {weakness.total > 0 ? (
                <b>{weakness.topEmoji} {weakness.topLabel}</b>
              ) : (
                <b>🔍 まだ分析中</b>
              )}
            </div>
            {weakness.total > 0 ? (
              <>
                <div className="weakBars">
                  {weakness.items.map((it) => (
                    <div className="weakRow" key={it.key}>
                      <span className="weakLabel">{it.emoji} {it.label}</span>
                      <div className="weakTrack">
                        <div
                          className="weakFill"
                          style={{ width: `${Math.round((it.count / weakness.total) * 100)}%` }}
                        />
                      </div>
                      <span className="weakNum">{it.count}</span>
                    </div>
                  ))}
                </div>
                <p className="weakAdvice">👉 次にやること: {weakness.topAdvice}</p>
              </>
            ) : (
              <p className="weakAdvice">単語モードを10問解くと、間違え方を4タイプに分類して弱点を可視化します。</p>
            )}
          </section>
        )}

        {stats?.reviewCount > 0 && (
          <p className="reviewNote">📌 復習待ちが <b>{stats.reviewCount}語</b> あります。単語・空所補充の先頭に自動で登場します。</p>
        )}

        <section className="levelBlock">
          <h2 className="h2">今日やることを選ぶ</h2>
          <div className="modeGrid">
            {MODES.map((m) => {
              const st = stats?.modeStats?.[m.key];
              return (
                <button
                  key={m.key}
                  className={`modeBtn ${mode === m.key ? 'on' : ''}`}
                  onClick={() => setMode(m.key)}
                >
                  <span className="modeTop">
                    <span className="modeEmoji">{m.emoji}</span>
                    <b>{m.label}</b>
                    <span className="modeExam">{m.exam}</span>
                  </span>
                  <span className="modeDesc">{m.desc}</span>
                  <span className="modeMeta">
                    {m.count}問{st?.answered ? ` · これまでの正解率 ${st.rate}%` : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {showLevels && (
          <section className="levelBlock">
            <h2 className="h2">レベルを選ぶ</h2>
            <div className="levelGrid">
              {LEVELS.map((l) => (
                <button
                  key={l.value}
                  className={`levelBtn ${level === l.value ? 'on' : ''}`}
                  onClick={() => setLevel(l.value)}
                >
                  <b>{l.label}</b>
                  <span>{l.hint}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <button className="cta" onClick={() => start(mode)}>
          {modeConf.emoji} {modeConf.label}を始める（{modeConf.count}問）→
        </button>

        {stats && (
          <section className="weakCard">
            <span className="fbTag">技能別の仕上がり</span>
            <div className="weakBars">
              {SKILL_ORDER.map((k) => {
                const st = stats.modeStats[k];
                const m = MODE_MAP[k];
                return (
                  <div className="weakRow" key={k}>
                    <span className="weakLabel">{m.emoji} {m.label}</span>
                    <div className="weakTrack">
                      <div className="weakFill" style={{ width: `${st.answered ? st.rate : 0}%` }} />
                    </div>
                    <span className="weakNum">{st.answered ? `${st.rate}%` : '—'}</span>
                  </div>
                );
              })}
            </div>
            <p className="weakAdvice">
              まだ解いていない技能は「—」です。合格到達度は語彙・筆記・リスニングの3本から計算しています。
            </p>
          </section>
        )}

        <p className="note">
          収録: 英検4級レベル単語{COUNTS.words}語（空所補充に使える語 {BLANK_POOL_SIZE}語） ·
          会話{COUNTS.conversations}問 · 語句整序{COUNTS.ordering}問 ·
          長文{COUNTS.reading}題{COUNTS.readingQuestions}問 · リスニング{COUNTS.listening}問
          <br />
          発音: {speechOn
            ? 'この端末のネイティブ英語音声で読み上げます（通信・費用なし）'
            : 'この環境では読み上げに対応していません'} · コーチ: Claude
          <br />
          <button className="linkBtn" onClick={handleReset}>進捗をリセット</button>
        </p>
      </main>
    );
  }

  // ---------------- クイズ ----------------
  if (screen === 'quiz' && current) {
    const answered = !!selected;
    const isOrder = current.kind === 'order';
    const isVocab = current.mode === 'word' || current.mode === 'blank';
    const errType = feedback?.error_type ? ERROR_TYPES[feedback.error_type] : null;
    // 解説の例文から出題語を伏せて「穴埋め」にする（覚えた→使えるへの橋渡し）
    const cloze =
      current.mode === 'word' && feedback?.example_en
        ? findWordInSentence(feedback.example_en, current.word.word)
        : null;
    const correctOption = current.options?.find((o) => o.correct);

    return (
      <main className="wrap">
        <div className="quizTop">
          <button className="back" onClick={() => { stopSpeaking(); setScreen('home'); }}>← やめる</button>
          <span className="counter">{qIndex + 1} / {questions.length}</span>
        </div>
        <div className="track"><div className="trackFill" style={{ width: `${(qIndex / questions.length) * 100}%` }} /></div>

        <p className="examTag">{current.examLabel}</p>

        {/* 長文（大問4）: 本文を先に読む */}
        {current.passage && (
          <section className="passage">
            <div className="passageHead">
              <b>{current.passage.title}</b>
              <span className="passageType">{current.passage.type}</span>
            </div>
            <pre className="passageBody">{current.passage.body}</pre>
            <div className="rowBtns">
              <SpeakButton text={current.audio} label="🔊 音読を聞く" className="miniBtn" />
              <button className="miniBtn" onClick={() => setShowJa((v) => !v)}>
                {showJa ? '訳をとじる' : '訳を見る'}
              </button>
            </div>
            {showJa && <p className="exJa">{current.passage.ja}</p>}
          </section>
        )}

        {/* リスニング第2部・第3部: 本文は見せず、音声だけで解く */}
        {current.hideScript && (
          <section className="audioCard">
            <p className="audioHint">🎧 音声を聞いて答えましょう（本文は出ません）</p>
            <div className="rowBtns center">
              <button className="playBtn" onClick={() => speak(current.audio)}>▶ 聞く</button>
              <button className="miniBtn" onClick={() => speakSlow(current.audio)}>🐢 ゆっくり</button>
            </div>
          </section>
        )}

        {/* 会話（大問2 / リスニング第1部） */}
        {current.dialog && !current.hideScript && (
          <section className="dialogCard">
            {current.dialog.map((l, i) => {
              // 第1部は、空所より後ろの発話を流さない＝画面にも出さない（答えのヒントになるため）
              const afterBlank = current.audioOnly && current.blankIndex >= 0 && i > current.blankIndex;
              if (afterBlank && !answered) return null;
              return (
                <p className="dialogLine" key={i}>
                  <span className="sp">{l.sp}:</span>{' '}
                  {l.text === null ? (
                    <span className="blank">{answered ? correctOption.text : '(                )'}</span>
                  ) : current.audioOnly && !answered ? (
                    <em className="hiddenLine">（音声で流れます）</em>
                  ) : (
                    l.text
                  )}
                </p>
              );
            })}
            <div className="rowBtns">
              <SpeakButton text={current.audio} label="🔊 聞く" className="miniBtn" />
              <SpeakButton text={current.audio} label="🐢 ゆっくり" className="miniBtn" slow />
            </div>
          </section>
        )}

        {/* 出題本体 */}
        {!isOrder && (
          <section className="qCard">
            {current.isReview && <span className="reviewBadge">📌 復習</span>}
            {current.scene && <span className="qMeta">{current.scene}</span>}
            {current.head && (
              <h2 className={current.mode === 'word' ? 'qWord' : 'qSentence'}>{current.head}</h2>
            )}
            {/* 空所補充の音声は答えを含む文なので、解答後だけ出す */}
            {speechOn && current.mode !== 'reading' && !current.hideScript && !current.dialog
              && (current.mode !== 'blank' || answered) && (
              <div className="rowBtns center">
                <SpeakButton
                  text={current.mode === 'blank' ? current.answerSentence : current.audio}
                  label={current.mode === 'blank' ? '🔊 文を聞く' : '🔊 発音を聞く'}
                  className="miniBtn ghostMini"
                />
              </div>
            )}
            <p className="qAsk">{current.ask}</p>
          </section>
        )}

        {/* 並べかえ（大問3） */}
        {isOrder && (
          <>
            <section className="qCard">
              <span className="qMeta">{current.scene}</span>
              <h2 className="qSentence">{current.order.ja}</h2>
              <p className="qAsk">{current.ask}</p>
            </section>
            <section className="orderBox">
              <p className="orderLine">
                <b>{current.order.prefix}</b>{' '}
                {picked.length ? picked.join(' ') : <span className="ph">…</span>}{' '}
                <b>{current.order.suffix}</b>
              </p>
              <div className="chunks">
                {current.order.chunks.map((c, i) => {
                  // 同じ語句が2つある場合に備え、選んだ数と出した数で使用済みを判定する
                  const usedCount = picked.filter((p) => p === c).length;
                  const totalCount = current.order.chunks.filter((x) => x === c).length;
                  const indexAmongSame = current.order.chunks
                    .slice(0, i)
                    .filter((x) => x === c).length;
                  const used = indexAmongSame < usedCount;
                  return (
                    <button
                      key={`${c}-${i}`}
                      className={`chunk ${used ? 'used' : ''}`}
                      disabled={used || answered || usedCount >= totalCount}
                      onClick={() => setPicked((p) => [...p, c])}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
              {!answered && (
                <div className="rowBtns">
                  <button className="miniBtn" onClick={() => setPicked((p) => p.slice(0, -1))} disabled={!picked.length}>
                    ← 1つ戻す
                  </button>
                  <button className="miniBtn" onClick={() => setPicked([])} disabled={!picked.length}>
                    やり直す
                  </button>
                  <button
                    className="miniBtn primary"
                    onClick={submitOrder}
                    disabled={picked.length !== current.order.chunks.length}
                  >
                    答え合わせ
                  </button>
                </div>
              )}
            </section>
          </>
        )}

        {/* 選択肢 */}
        {!isOrder && (
          <div className="options">
            {current.options.map((opt, i) => {
              let cls = 'opt';
              if (answered) {
                if (opt.correct) cls += ' correct';
                else if (opt === selected) cls += ' wrong';
                else cls += ' dim';
              }
              // リスニング第1部は、選択肢も音声だけで判断する（本番と同じ形式）
              const hidden = current.audioOnly && !answered;
              return (
                <button key={i} className={cls} onClick={() => choose(opt)} disabled={answered}>
                  {hidden ? (
                    <span className="optAudio">
                      <b>{i + 1}</b>
                      <span
                        className="optPlay"
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => { e.stopPropagation(); speak(opt.text); }}
                      >
                        🔊 聞く
                      </span>
                    </span>
                  ) : (
                    opt.text
                  )}
                  {answered && opt.correct && <span className="mk">✓</span>}
                  {answered && opt === selected && !opt.correct && <span className="mk">✕</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* 解説 */}
        {answered && (
          <section className="fb">
            {fbLoading && <p className="fbLoading">🧠 コーチが解説を組み立てています…</p>}
            {feedback && !fbLoading && (
              <>
                {isOrder ? (
                  <div className={`fbBlock ${selected.correct ? 'ok' : 'warn'}`}>
                    <span className="fbTag">{selected.correct ? '正解！' : '正しい語順はこちら'}</span>
                    <p className="exEn">
                      {current.order.answer} <SpeakButton text={current.order.answer} />
                    </p>
                    {!selected.correct && (
                      <p className="exJa">
                        あなたの答え: {current.order.prefix} {selected.text} {current.order.suffix}
                      </p>
                    )}
                  </div>
                ) : feedback.reason ? (
                  <div className="fbBlock warn">
                    <span className="fbTag">
                      なぜ間違えた？{errType && <em className="typeChip">{errType.emoji} {errType.label}</em>}
                    </span>
                    <p>{feedback.reason}</p>
                  </div>
                ) : (
                  <div className="fbBlock ok">
                    <span className="fbTag">正解！</span>
                    <p>その調子です。下の解説で「なぜそうなるか」も確認しておきましょう。</p>
                  </div>
                )}

                {/* 会話・リスニングは、スクリプトと訳で答え合わせをする */}
                {(current.dialog || current.passageText) && (
                  <div className="fbBlock ex">
                    <span className="fbTag">スクリプトと訳</span>
                    {current.dialog &&
                      current.dialog.map((l, i) => (
                        <p className="exEn" key={i}>
                          {l.sp ? `${l.sp}: ` : ''}
                          {l.text === null ? correctOption.text : l.text}
                        </p>
                      ))}
                    {current.passageText && <p className="exEn">{current.passageText}</p>}
                    <p className="exJa">{current.ja}</p>
                    <SpeakButton
                      text={current.fullAudio || current.audio}
                      label="🔊 もう一度聞く"
                      className="miniBtn"
                    />
                  </div>
                )}

                {/* 空所補充: 完成した文を音でも確認する */}
                {current.mode === 'blank' && (
                  <div className="fbBlock ex">
                    <span className="fbTag">完成した文</span>
                    <p className="exEn">
                      {current.answerSentence} <SpeakButton text={current.answerSentence} />
                    </p>
                    <p className="exJa">{current.ja}</p>
                  </div>
                )}

                {/* 単語モード: 例文を空所にして「使える」かを確認する（大問1と同じ形） */}
                {current.mode === 'word' && feedback.example_en && (
                  <div className="fbBlock ex">
                    <span className="fbTag">4級の空所補充と同じ形で「使える」チェック</span>
                    {cloze && !revealed ? (
                      <>
                        <p className="exEn">
                          {cloze.before}<span className="blank">______</span>{cloze.after}
                        </p>
                        <button className="revealBtn" onClick={() => setRevealed(true)}>
                          空欄に入る形を見る 👀
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="exEn">
                          {cloze ? (
                            <>{cloze.before}<mark className="hit">{cloze.hidden}</mark>{cloze.after}</>
                          ) : (
                            feedback.example_en
                          )}{' '}
                          <SpeakButton text={feedback.example_en} />
                        </p>
                        <p className="exJa">{feedback.example_ja}</p>
                      </>
                    )}
                  </div>
                )}

                {isVocab && feedback.tip && (
                  <div className="fbBlock tip"><span className="fbTag">💡 コーチのヒント</span><p>{feedback.tip}</p></div>
                )}

                {!isVocab && current.explain && (
                  <div className="fbBlock tip">
                    <span className="fbTag">💡 {isOrder ? '文法のポイント' : '解き方のポイント'}</span>
                    <p>{current.explain}</p>
                  </div>
                )}

                <p className="fbNote">
                  {feedback.ai
                    ? '⚡ Claude API がこの1問に合わせて生成'
                    : feedback.local
                      ? '📦 問題データに同梱の解説（APIコスト0）'
                      : '📦 Claude 事前生成コーチパック（APIコスト0）'}
                </p>

                {/* 解説が出てから「次へ」を表示（取得中の誤操作・レースを防止） */}
                <button className="cta" onClick={next}>
                  {qIndex + 1 < questions.length ? '次の問題へ →' : '結果を見る →'}
                </button>
              </>
            )}
          </section>
        )}
      </main>
    );
  }

  // ---------------- 結果 ----------------
  if (screen === 'result') {
    const correctCount = results.filter((r) => r.correct).length;
    const rate = Math.round((correctCount / Math.max(results.length, 1)) * 100);
    const wrong = results.filter((r) => !r.correct);
    return (
      <main className="wrap">
        <section className="resultHead">
          <div className="ring" style={{ '--p': rate }}>
            <span>{rate}<small>%</small></span>
          </div>
          <p className="resultScore">
            {modeConf.emoji} {modeConf.label} — {results.length}問中 <b>{correctCount}</b>問 正解
          </p>
        </section>

        <section className="summary">
          {sumLoading && <p className="fbLoading">🧠 コーチが今日の学習を振り返っています…</p>}
          {summary && !sumLoading && (
            <>
              <h2 className="sumHead">{summary.headline}</h2>
              <div className="fbBlock ok"><span className="fbTag">今日の good</span><p>{summary.good}</p></div>
              <div className="fbBlock tip"><span className="fbTag">次への一言</span><p>{summary.advice}</p></div>
              <div className="fbBlock ex"><span className="fbTag">次に復習したい</span><p>{summary.focus}</p></div>
              <p className="fbNote">
                {summary.ai ? '⚡ Claude API による総括' : '📦 ローカルコーチによる総括（APIコスト0）'}
              </p>
            </>
          )}
        </section>

        {wrong.length > 0 && (
          <section className="weakCard">
            <span className="fbTag">まちがえた問題</span>
            <ul className="wrongList">
              {wrong.map((r, i) => (
                <li key={i}>
                  <span className="wrongTag">{r.examLabel}</span>
                  {r.word ? (
                    <>
                      <b>{r.word}</b>（{r.meaning}） <SpeakButton text={r.word} />
                    </>
                  ) : (
                    <span className="wrongLabel">{r.label}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {stats && (
          <section className="dashboard tight">
            <div className="statRow">
              <div className="miniStat"><b>{stats.readiness}%</b><span>4級合格到達度</span></div>
              <div className="miniStat"><b>{stats.learned}<small>/{stats.total}</small></b><span>覚えた単語</span></div>
              <div className="miniStat"><b>{stats.reviewCount}</b><span>復習待ち</span></div>
            </div>
            {stats.weakness?.total > 0 && (
              <p className="reviewNote">
                弱点タイプ1位: <b>{stats.weakness.topEmoji} {stats.weakness.topLabel}</b> — {stats.weakness.topAdvice}
              </p>
            )}
          </section>
        )}

        <button className="cta" onClick={() => start(mode)}>もう1セットやる 🔁</button>
        <button className="ghost" onClick={() => { stopSpeaking(); setScreen('home'); }}>ホームに戻る</button>
      </main>
    );
  }

  return null;
}
