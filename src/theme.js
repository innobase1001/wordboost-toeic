// 明るくポップな英単語帳アプリのデザインテーマ
export const colors = {
  bg: '#FFF7ED',        // あたたかいクリーム背景
  surface: '#FFFFFF',   // カード面
  primary: '#FF6B6B',   // コーラル（メイン）
  secondary: '#4ECDC4', // ティール
  accent: '#FFD93D',    // イエロー
  purple: '#A66CFF',    // パープル
  green: '#5AD67D',     // 正解グリーン
  red: '#FF7B7B',       // 不正解レッド
  ink: '#2D2A32',       // 濃い文字
  sub: '#8A8594',       // サブ文字
  line: '#F0E9DE',      // 罫線
};

// モードごとのアクセントカラー（ポップに色分け）
export const modeColors = {
  flashcard: colors.purple,
  quiz: colors.secondary,
};

export const spacing = {
  xs: 6,
  sm: 12,
  md: 20,
  lg: 28,
  xl: 40,
};

export const radius = {
  sm: 14,
  md: 22,
  lg: 32,
};

// ポップな浮き上がり感を出す共通シャドウ
export const shadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.12,
  shadowRadius: 12,
  elevation: 5,
};
