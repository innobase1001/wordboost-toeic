import * as Speech from 'expo-speech';

// 読み上げ速度の段階（ボタンで切り替え）
export const SPEEDS = [
  { key: 'slow', label: '🐢 ゆっくり', rate: 0.55 },
  { key: 'normal', label: '🚶 ふつう', rate: 0.9 },
  { key: 'fast', label: '🐇 速い', rate: 1.3 },
];

// 英単語・英文を英語音声で読み上げる（rateは再生速度）
export function speak(text, rate = 0.9) {
  if (!text) return;
  // 連続タップ時に前の読み上げを止めてから話す
  Speech.stop();
  Speech.speak(text, {
    language: 'en-US',
    rate,
    pitch: 1.0,
  });
}
