import { useEffect, useRef } from 'react';
import { View, Text, Animated } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

const TYPE_BORDER_COLORS = {
  info: '#3B82F6',
  success: '#5BCCB3',
  warning: '#FFB84D',
  error: '#EF4444',
};

export default function Notification({
  message,
  type = 'info',
  duration_ms = 5000,
  onDismiss,
}) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        if (onDismiss) onDismiss();
      });
    }, duration_ms);

    return () => clearTimeout(timer);
  }, [duration_ms, onDismiss, opacity]);

  const borderColor = TYPE_BORDER_COLORS[type] || TYPE_BORDER_COLORS.info;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 12,
        left: 16,
        right: 16,
        opacity,
        zIndex: 40,
      }}
    >
      <View
        className="rounded-2xl px-4 py-3"
        style={{
          backgroundColor: colors.bgSurface,
          borderWidth: 1,
          borderColor: colors.border,
          borderLeftWidth: 4,
          borderLeftColor: borderColor,
          shadowColor: '#000',
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 4,
        }}
      >
        <Text className="text-sm" style={{ color: colors.textPrimary }}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}
