import { ScrollView, View, Text } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useBuddy } from '../context/BuddyProvider';

export default function Canvas() {
  const { colors } = useTheme();
  const { state } = useBuddy();
  const { elements } = state.canvas;

  if (!elements.length) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text style={{ color: colors.textMuted }}>
          Send a message to get started
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 p-4" contentContainerStyle={{ gap: 12 }}>
      {elements.map((el) => (
        <View
          key={el.id}
          className="rounded-xl p-4"
          style={{ backgroundColor: colors.bgSurface }}
        >
          <Text style={{ color: colors.textPrimary }}>
            {el.type}: {el.title || el.id}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}
