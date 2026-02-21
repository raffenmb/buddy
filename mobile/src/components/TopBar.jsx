import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { useBuddy } from '../context/BuddyProvider';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import Svg, { Circle, Path, Line, Polyline } from 'react-native-svg';

export default function TopBar() {
  const insets = useSafeAreaInsets();
  const { colors, isDark, toggleTheme } = useTheme();
  const { state } = useBuddy();
  const { user, logout } = useAuth();
  const navigation = useNavigation();

  return (
    <View
      className="flex-row items-center justify-between px-4 pb-2"
      style={{
        paddingTop: insets.top + 8,
        backgroundColor: colors.bgSurface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      {/* Left: agent name + connection dot */}
      <View className="flex-row items-center gap-2">
        <View
          className="w-2 h-2 rounded-full"
          style={{
            backgroundColor: state.connected
              ? colors.secondary
              : colors.textMuted,
          }}
        />
        <Text
          className="text-base font-semibold"
          style={{ color: colors.textPrimary }}
        >
          {state.agent.name || 'Buddy'}
        </Text>
      </View>

      {/* Right: user name, logout, theme toggle, gear */}
      <View className="flex-row items-center gap-3">
        {user?.displayName ? (
          <Text className="text-xs" style={{ color: colors.textMuted }}>
            {user.displayName}
          </Text>
        ) : null}

        <Pressable onPress={logout} hitSlop={8}>
          <Svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke={colors.textSecondary}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <Polyline points="16 17 21 12 16 7" />
            <Line x1="21" y1="12" x2="9" y2="12" />
          </Svg>
        </Pressable>

        <Pressable onPress={toggleTheme} hitSlop={8}>
          {isDark ? (
            <Svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke={colors.textSecondary}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <Circle cx="12" cy="12" r="5" />
              <Line x1="12" y1="1" x2="12" y2="3" />
              <Line x1="12" y1="21" x2="12" y2="23" />
              <Line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <Line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <Line x1="1" y1="12" x2="3" y2="12" />
              <Line x1="21" y1="12" x2="23" y2="12" />
              <Line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <Line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </Svg>
          ) : (
            <Svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke={colors.textSecondary}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <Path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </Svg>
          )}
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('AdminDashboard')}
          hitSlop={8}
        >
          <Svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke={colors.textSecondary}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Circle cx="12" cy="12" r="3" />
            <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </Svg>
        </Pressable>
      </View>
    </View>
  );
}
