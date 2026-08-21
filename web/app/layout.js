import "./globals.css";

export const metadata = {
  title: "WordBoost — TOEIC 700点 英単語アプリ",
  description: "AIコーチが「なぜ間違えたか」まで教えてくれる、社会人のためのスキマ英単語アプリ",
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
