// 誤答タイプの定義（サーバー側の判定とクライアント側の表示で共通利用する）
// ※ この定数だけを独立させることで、クライアントに例文データを同梱せずに済む
export const ERROR_TYPES = {
  confusion: { label: '類似語の混同', emoji: '🌀', advice: '似た意味の語をペアで比べて覚える' },
  pos: { label: '品詞の取り違え', emoji: '🔤', advice: '語尾（-tion / -ive / -ly）から品詞を判断する' },
  scene: { label: '場面イメージ違い', emoji: '🏢', advice: '単語をビジネスの場面ごと覚え直す' },
  memory: { label: '記憶がまだ薄い', emoji: '💤', advice: '翌日にもう一度会って記憶を上書きする' },
};

export const ERROR_TYPE_KEYS = Object.keys(ERROR_TYPES);
