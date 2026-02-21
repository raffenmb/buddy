import { View, Text } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export default function TextBlock({ title, content, style = 'document' }) {
  const { colors } = useTheme();

  const isCode = style === 'code';
  const isNote = style === 'note';
  const isQuote = style === 'quote';

  const bgColor = isCode ? colors.bgRaised : colors.bgSurface;
  const textColor = isCode
    ? colors.secondary
    : isQuote
      ? colors.textMuted
      : colors.textSecondary;

  const borderLeft =
    isNote
      ? { borderLeftWidth: 4, borderLeftColor: colors.tertiary }
      : isQuote
        ? { borderLeftWidth: 4, borderLeftColor: colors.accent }
        : {};

  return (
    <View
      className="rounded-2xl p-6"
      style={{
        backgroundColor: bgColor,
        borderWidth: 1,
        borderColor: colors.border,
        ...borderLeft,
      }}
    >
      {title ? (
        <Text
          className="text-lg font-semibold mb-3"
          style={{ color: colors.textPrimary }}
        >
          {title}
        </Text>
      ) : null}
      <Text
        className="text-sm"
        style={{
          color: textColor,
          fontFamily: isCode ? 'monospace' : undefined,
          fontStyle: isQuote ? 'italic' : 'normal',
        }}
      >
        {content}
      </Text>
    </View>
  );
}
