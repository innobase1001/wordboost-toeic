import "./globals.css";

export const metadata = {
  title: "WordBoost 4級 — 英検4級 合格のための英単語アプリ",
  description: "AIコーチが「なぜ間違えたか」まで教えてくれる、英検4級合格のためのスキマ英単語アプリ",
};

export const viewport = {
  themeColor: "#ff6b6b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
