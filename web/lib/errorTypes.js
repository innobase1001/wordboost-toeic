// 誤答タイプの定義（サーバー側の判定とクライアント側の表示で共通利用する）
// ※ この定数だけを独立させることで、クライアントに例文データを同梱せずに済む
//
// 英検4級（中学中級程度）の学習者がつまずく4パターンに合わせて定義している。
export const ERROR_TYPES = {
  confusion: { label: '似た意味の語と混同', emoji: '🌀', advice: 'borrow / lend のように、まぎらわしい語をペアで比べる' },
  pos: { label: '品詞の取りちがえ', emoji: '🔤', advice: '動詞・名詞・形容詞のどれかを、文の形から先に決める' },
  scene: { label: '場面のイメージちがい', emoji: '🏫', advice: '単語を「学校」「買い物」など場面ごと思い出す' },
  memory: { label: 'まだ覚えきれていない', emoji: '💤', advice: '翌日にもう一度会って記憶を上書きする' },
};

export const ERROR_TYPE_KEYS = Object.keys(ERROR_TYPES);
