import { View, Text } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

const COLOR_MAP = {
  blue: '#3B82F6',
  green: '#10B981',
  red: '#EF4444',
  yellow: '#F59E0B',
  purple: '#8B5CF6',
  gray: null, // uses textMuted
};

const ICON_MAP = {
  alert: '\u26A0\uFE0F',
  info: '\u2139\uFE0F',
  check: '\u2705',
  star: '\u2B50',
  heart: '\u2764\uFE0F',
  clock: '\uD83D\uDD50',
};

export default function Card({ title, body, color = 'default', icon }) {
  const { colors } = useTheme();
  const borderColor =
    color === 'gray'
      ? colors.textMuted
      : COLOR_MAP[color] || colors.accent;
  const iconEmoji = icon ? ICON_MAP[icon] || icon : null;

  return (
    <View
      className="rounded-2xl p-6"
      style={{
        backgroundColor: colors.bgSurface,
        borderWidth: 1,
        borderColor: colors.border,
        borderLeftWidth: 4,
        borderLeftColor: borderColor,
      }}
    >
      <View className="flex-row items-start gap-3">
        {iconEmoji ? (
          <Text className="text-xl flex-shrink-0">{iconEmoji}</Text>
        ) : null}
        <View className="flex-1">
          {title ? (
            <Text
              className="text-lg font-semibold"
              style={{ color: colors.textPrimary }}
            >
              {title}
            </Text>
          ) : null}
          {body ? (
            <Text
              className="text-sm mt-2"
              style={{ color: colors.textSecondary }}
            >
              {body}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}
