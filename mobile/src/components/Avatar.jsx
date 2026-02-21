import { useEffect, useRef, useState } from 'react';
import { View, Text, Animated } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useBuddy } from '../context/BuddyProvider';
import { AVATAR_PRESETS } from '../assets/avatarPresets';

const AVATAR_SIZE = 48;

export default function Avatar() {
  const { colors } = useTheme();
  const { state } = useBuddy();
  const { isTalking } = state.avatar;
  const { text, visible } = state.subtitle;
  const { isProcessing } = state.input;

  const [mouthOpen, setMouthOpen] = useState(false);
  const [thinkingDots, setThinkingDots] = useState('.');
  const bobAnim = useRef(new Animated.Value(0)).current;

  // Mouth toggle while talking
  useEffect(() => {
    if (!isTalking) {
      setMouthOpen(false);
      return;
    }
    const interval = setInterval(() => setMouthOpen((o) => !o), 150);
    return () => clearInterval(interval);
  }, [isTalking]);

  // Bob animation (continuous loop)
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bobAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(bobAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [bobAnim]);

  // Thinking dots animation
  useEffect(() => {
    if (isProcessing && !visible) {
      const interval = setInterval(() => {
        setThinkingDots((prev) => {
          if (prev === '.') return '..';
          if (prev === '..') return '...';
          return '.';
        });
      }, 500);
      return () => clearInterval(interval);
    }
    setThinkingDots('.');
  }, [isProcessing, visible]);

  const translateY = bobAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -4],
  });

  const avatarId = state.agent.avatar || 'buddy';
  const preset = AVATAR_PRESETS[avatarId] || AVATAR_PRESETS.buddy;
  const AvatarSvg = mouthOpen ? preset.talking : preset.idle;

  const showSubtitle = visible && text;
  const showThinking = isProcessing && !visible;

  return (
    <View className="flex-row items-center gap-3 px-4 py-2">
      <Animated.View style={{ transform: [{ translateY }] }}>
        <AvatarSvg width={AVATAR_SIZE} height={AVATAR_SIZE} />
      </Animated.View>
      {showSubtitle ? (
        <View
          className="flex-1 rounded-2xl px-4 py-2"
          style={{
            backgroundColor: colors.bgSurface,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text
            className="text-sm"
            style={{ color: colors.textPrimary }}
            numberOfLines={3}
          >
            {text}
          </Text>
        </View>
      ) : showThinking ? (
        <View
          className="rounded-2xl px-4 py-2"
          style={{
            backgroundColor: colors.bgSurface,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text
            className="text-sm font-medium"
            style={{ color: colors.textMuted }}
          >
            {thinkingDots}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
