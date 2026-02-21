import { View, Text } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export default function ProgressBar({
  label,
  percent = 0,
  status = 'active',
  color,
}) {
  const { colors } = useTheme();
  const clampedPercent = Math.max(0, Math.min(100, percent));

  const barColor =
    status === 'complete'
      ? '#10B981'
      : status === 'error'
        ? '#EF4444'
        : color || colors.accent;

  const statusText =
    status === 'complete'
      ? ' — Complete'
      : status === 'error'
        ? ' — Error'
        : '';

  return (
    <View
      className="rounded-2xl p-6"
      style={{
        backgroundColor: colors.bgSurface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {label ? (
        <Text
          className="text-sm font-semibold mb-3"
          style={{ color: colors.textPrimary }}
        >
          {label}
        </Text>
      ) : null}
      <View
        className="rounded-full overflow-hidden"
        style={{ height: 12, backgroundColor: colors.bgRaised }}
      >
        <View
          className="rounded-full"
          style={{
            width: `${clampedPercent}%`,
            height: '100%',
            backgroundColor: barColor,
          }}
        />
      </View>
      <Text className="text-xs mt-2" style={{ color: colors.textMuted }}>
        {clampedPercent}%{statusText}
      </Text>
    </View>
  );
}
