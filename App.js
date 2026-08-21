import React, { useState, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { setAudioModeAsync } from 'expo-audio';
import { colors } from './src/theme';
import { SPEEDS } from './src/speech';
import HomeScreen from './src/screens/HomeScreen';
import FlashcardScreen from './src/screens/FlashcardScreen';
import QuizScreen from './src/screens/QuizScreen';

export default function App() {
  // シンプルな画面切り替え（'home' | 'flashcard' | 'quiz'）
  const [screen, setScreen] = useState('home');
  // 読み上げ速度（アプリ全体で共有。初期値は「ふつう」）
  const [speedIndex, setSpeedIndex] = useState(1);

  // iOSのマナーモード中でも読み上げ音声が鳴るようにする
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  const goHome = () => setScreen('home');
  const cycleSpeed = () => setSpeedIndex((i) => (i + 1) % SPEEDS.length);

  const speechProps = { speedIndex, onCycleSpeed: cycleSpeed };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <ExpoStatusBar style="dark" />
        {screen === 'home' && <HomeScreen onSelectMode={setScreen} />}
        {screen === 'flashcard' && <FlashcardScreen onBack={goHome} {...speechProps} />}
        {screen === 'quiz' && <QuizScreen onBack={goHome} {...speechProps} />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
