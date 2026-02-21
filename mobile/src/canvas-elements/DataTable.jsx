import { View, Text } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

const ALIGN_STYLES = {
  left: { textAlign: 'left' },
  center: { textAlign: 'center' },
  right: { textAlign: 'right' },
};

export default function DataTable({ title, columns, rows }) {
  const { colors } = useTheme();

  if (!columns || !rows) return null;

  return (
    <View
      className="rounded-2xl p-6"
      style={{
        backgroundColor: colors.bgSurface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {title ? (
        <Text
          className="text-lg font-semibold mb-4"
          style={{ color: colors.textPrimary }}
        >
          {title}
        </Text>
      ) : null}

      {/* Header row */}
      <View
        className="flex-row rounded-xl px-2 py-2.5 mb-1"
        style={{ backgroundColor: colors.bgRaised }}
      >
        {columns.map((col) => (
          <Text
            key={col.key}
            className="flex-1 px-3 text-xs uppercase tracking-wider font-semibold"
            style={{
              color: colors.textMuted,
              ...(ALIGN_STYLES[col.align] || ALIGN_STYLES.left),
            }}
          >
            {col.label}
          </Text>
        ))}
      </View>

      {/* Data rows */}
      {rows.map((row, rowIndex) => (
        <View
          key={rowIndex}
          className="flex-row px-2 py-2.5 rounded-xl"
          style={{
            backgroundColor:
              rowIndex % 2 === 0 ? 'transparent' : colors.bgRaised,
          }}
        >
          {columns.map((col) => (
            <Text
              key={col.key}
              className="flex-1 px-3 text-sm"
              style={{
                color: colors.textSecondary,
                ...(ALIGN_STYLES[col.align] || ALIGN_STYLES.left),
              }}
            >
              {row[col.key]}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}
