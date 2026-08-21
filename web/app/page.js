'use client';

import { useEffect, useState } from 'react';
import { buildSession } from '@/lib/words';
import { recordAnswer, recordSessionDone, getStats, resetProgress } from '@/lib/progress';
import { ERROR_TYPES } from '@/lib/errorTypes';

const LEVELS = [
  { value: 0, label: 'ミックス', hint: '全レベルから' },
  { value: 1, label: '初級 L1', hint: 'TOEIC500点以下' },
  { value: 2, label: '中級 L2', hint: '500〜700点' },
  { value: 3, label: '上級 L3', hint: '700点突破' },
];

function stars(level) {
  return '⭐'.repeat(level);
}

/**
 * 例文から出題語を伏せて「穴埋め」にする（覚えた→使えるへの橋渡し）。
 * 活用形（provided / increases など）にも当たるよう語幹で照合する。
 */
function toCloze(sentence, word) {
  if (!sentence || !word) return null;
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stem = word.replace(/(e|y)$/i, '');
  const patterns = [
    new RegExp(`\\b${escape(word)}\\b`, 'i'),
    new RegExp(`\\b${escape(stem)}\\w*\\b`, 'i'),
  ];
  for (const re of patterns) {
    const m = sentence.match(re);
    if (m) {
      return {
        before: sentence.slice(0, m.index),
        hidden: m[0],
        after: sentence.slice(m.index + m[0].length),
      };
    }
  }
  return null;
}

export default function Home() {
  const [screen, setScreen] = useState('home');
  const [level, setLevel] = useState(0);
  const [stats, setStats] = useState(null);

  // クイズ状態
  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [fbLoading, setFbLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState([]);

  // 結果画面
  const [summary, setSummary] = useState(null);
  const [sumLoading, setSumLoading] = useState(false);

  useEffect(() => {
    setStats(getStats());
  }, []);

  function start() {
    const s = getStats();
    const qs = buildSession({ level, learnedIds: s.learnedIds, reviewIds: s.reviewIds });
    setQuestions(qs);
    setQIndex(0);
    setSelected(null);
    setFeedback(null);
    setRevealed(false);
    setResults([]);
    setSummary(null);
    setScreen('quiz');
  }

  const current = questions[qIndex];

  async function choose(opt) {
    if (selected || !current) return;
    setSelected(opt);
    setRevealed(false);
    setFbLoading(true);
    setFeedback(null);

    const correct = opt.correct;
    const payload = {
      wordId: current.id,
      word: current.word,
      pos: current.pos,
      meaning: current.meaning,
      level: current.level,
      exampleScene: current.example_scene,
      similar: current.similar,
      chosenMeaning: opt.meaning,
      chosenWord: opt.word,
      chosenPos: opt.pos,
      chosenScene: opt.scene,
      chosenSimilar: opt.similar,
      correct,
      isReview: current.isReview,
      weaknessLabel: stats?.weakness?.topLabel || null,
    };

    let fb;
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      fb = await res.json();
    } catch {
      fb = {
        reason: correct ? '' : `${current.word} の意味は「${current.meaning}」です。`,
        error_type: correct ? null : 'memory',
        example_en: '',
        example_ja: '',
        tip: '',
        ai: false,
      };
    }

    // 誤答タイプまで含めて、1問につき1回だけ進捗に書き込む
    const errorType = correct ? null : fb?.error_type || 'memory';
    recordAnswer(current.id, correct, errorType);
    setStats(getStats());

    setResults((r) => [
      ...r,
      {
        word: current.word,
        meaning: current.meaning,
        chosenMeaning: opt.meaning,
        correct,
        similar: current.similar,
        isReview: !!current.isReview,
        errorType,
        errorTypeLabel: errorType ? ERROR_TYPES[errorType]?.label : null,
      },
    ]);

    setFeedback(fb);
    setFbLoading(false);
  }

  function next() {
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
    return (
      <main className="wrap">
        <header className="hero">
          <p className="eyebrow">TOEIC 700点突破 · 社会人のためのスキマ英単語</p>
          <h1 className="title">Word<span className="accent">Boost</span> 🚀</h1>
          <p className="lead">1回10問・数分で終わる。AIコーチが「なぜ間違えたか」をタイプ別に教えてくれる単語アプリ。</p>
        </header>

        {stats && (
          <section className="dashboard">
            <div className="statCard">
              <span className="statNum">{stats.readiness}<span className="statDenom">%</span></span>
              <span className="statLabel">700点到達度（学習カバー率7割＋正解率3割）</span>
              <div className="bar"><div className="barFill" style={{ width: `${stats.readiness}%` }} /></div>
            </div>
            <div className="statRow">
              <div className="miniStat"><b>{stats.learned}<small>/300</small></b><span>学習済み</span></div>
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
              <p className="weakAdvice">10問解くと、間違え方を4タイプに分類して弱点を可視化します。</p>
            )}
          </section>
        )}

        {stats?.reviewCount > 0 && (
          <p className="reviewNote">📌 復習待ちが <b>{stats.reviewCount}語</b> あります。次のセッションの先頭に自動で登場します。</p>
        )}

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

        <button className="cta" onClick={start}>今日の10問を始める →</button>
        <p className="note">
          出典: 運営配布 TOEIC頻出単語300語 · コーチ: Claude
          <br />
          <button className="linkBtn" onClick={handleReset}>進捗をリセット</button>
        </p>
      </main>
    );
  }

  // ---------------- クイズ ----------------
  if (screen === 'quiz' && current) {
    const answered = !!selected;
    const cloze = feedback ? toCloze(feedback.example_en, current.word) : null;
    const errType = feedback?.error_type ? ERROR_TYPES[feedback.error_type] : null;

    return (
      <main className="wrap">
        <div className="quizTop">
          <button className="back" onClick={() => setScreen('home')}>← やめる</button>
          <span className="counter">{qIndex + 1} / {questions.length}</span>
        </div>
        <div className="track"><div className="trackFill" style={{ width: `${(qIndex / questions.length) * 100}%` }} /></div>

        <section className="qCard">
          {current.isReview && <span className="reviewBadge">📌 復習</span>}
          <span className="qMeta">{stars(current.level)} · {current.pos} · {current.example_scene}</span>
          <h2 className="qWord">{current.word}</h2>
          <p className="qAsk">この単語の意味は？</p>
        </section>

        <div className="options">
          {current.options.map((opt, i) => {
            let cls = 'opt';
            if (answered) {
              if (opt.correct) cls += ' correct';
              else if (opt === selected) cls += ' wrong';
              else cls += ' dim';
            }
            return (
              <button key={i} className={cls} onClick={() => choose(opt)} disabled={answered}>
                {opt.meaning}
                {answered && opt.correct && <span className="mk">✓</span>}
                {answered && opt === selected && !opt.correct && <span className="mk">✕</span>}
              </button>
            );
          })}
        </div>

        {answered && (
          <section className="fb">
            {fbLoading && <p className="fbLoading">🧠 コーチが解説を組み立てています…</p>}
            {feedback && !fbLoading && (
              <>
                {feedback.reason ? (
                  <div className="fbBlock warn">
                    <span className="fbTag">
                      なぜ間違えた？{errType && <em className="typeChip">{errType.emoji} {errType.label}</em>}
                    </span>
                    <p>{feedback.reason}</p>
                  </div>
                ) : (
                  <div className="fbBlock ok"><span className="fbTag">正解！</span><p>その調子です。次は「使える」かを確認しましょう👇</p></div>
                )}

                {feedback.example_en && (
                  <div className="fbBlock ex">
                    <span className="fbTag">ビジネス例文で「使える」チェック</span>
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
                            <>
                              {cloze.before}<mark className="hit">{cloze.hidden}</mark>{cloze.after}
                            </>
                          ) : feedback.example_en}
                        </p>
                        <p className="exJa">{feedback.example_ja}</p>
                      </>
                    )}
                  </div>
                )}

                {feedback.tip && (
                  <div className="fbBlock tip"><span className="fbTag">💡 コーチのヒント</span><p>{feedback.tip}</p></div>
                )}

                <p className="fbNote">
                  {feedback.ai ? '⚡ Claude API がこの1問に合わせて生成' : '📦 Claude 事前生成コーチパック（APIコスト0）'}
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
    return (
      <main className="wrap">
        <section className="resultHead">
          <div className="ring" style={{ '--p': rate }}>
            <span>{rate}<small>%</small></span>
          </div>
          <p className="resultScore">{results.length}問中 <b>{correctCount}</b>問 正解</p>
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

        {stats && (
          <section className="dashboard tight">
            <div className="statRow">
              <div className="miniStat"><b>{stats.readiness}%</b><span>700点到達度</span></div>
              <div className="miniStat"><b>{stats.learned}<small>/300</small></b><span>学習済み</span></div>
              <div className="miniStat"><b>{stats.reviewCount}</b><span>復習待ち</span></div>
            </div>
            {stats.weakness?.total > 0 && (
              <p className="reviewNote">
                弱点タイプ1位: <b>{stats.weakness.topEmoji} {stats.weakness.topLabel}</b> — {stats.weakness.topAdvice}
              </p>
            )}
          </section>
        )}

        <button className="cta" onClick={start}>もう10問やる 🔁</button>
        <button className="ghost" onClick={() => setScreen('home')}>ホームに戻る</button>
      </main>
    );
  }

  return null;
}
