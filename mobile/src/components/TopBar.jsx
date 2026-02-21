import { useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { useBuddy } from '../context/BuddyProvider';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { getApi } from '../lib/api';
import Svg, { Circle, Path, Line, Polyline } from 'react-native-svg';

export default function TopBar() {
  const insets = useSafeAreaInsets();
  const { colors, isDark, toggleTheme } = useTheme();
  const { state, dispatch } = useBuddy();
  const { user, logout } = useAuth();
  const navigation = useNavigation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [agents, setAgents] = useState([]);

  async function openPicker() {
    try {
      const api = getApi();
      const list = await api('/api/agents');
      setAgents(list);
    } catch {
      setAgents([]);
    }
    setPickerOpen(true);
  }

  function switchAgent(agent) {
    setPickerOpen(false);
    if (agent.id === state.agent.id) return;
    dispatch({ type: 'SET_AGENT', payload: { id: agent.id, name: agent.name, avatar: agent.avatar || 'buddy' } });
    dispatch({ type: 'CLEAR_SUBTITLE' });
    dispatch({ type: 'CANVAS_SET_MODE', payload: { mode: 'clear' } });
  }

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
      {/* Left: agent name (tappable) + connection dot */}
      <Pressable
        onPress={openPicker}
        className="flex-row items-center gap-2"
      >
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
        {/* Chevron */}
        <Svg
          width={12}
          height={12}
          viewBox="0 0 24 24"
          fill="none"
          stroke={colors.textMuted}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Polyline points="6 9 12 15 18 9" />
        </Svg>
      </Pressable>

      {/* Agent picker modal */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable
          className="flex-1 justify-start"
          style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
          onPress={() => setPickerOpen(false)}
        >
          <View
            style={{
              marginTop: insets.top + 48,
              marginLeft: 12,
              backgroundColor: colors.bgSurface,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              minWidth: 180,
              maxWidth: 260,
              maxHeight: 300,
              overflow: 'hidden',
            }}
          >
            <ScrollView>
              {agents.map((a) => (
                <Pressable
                  key={a.id}
                  onPress={() => switchAgent(a)}
                  className="px-4 py-3"
                  style={{
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <View className="flex-row items-center gap-2">
                    <Text
                      className="text-sm"
                      style={{
                        color: a.id === state.agent.id ? colors.accent : colors.textPrimary,
                        fontWeight: a.id === state.agent.id ? '600' : '400',
                      }}
                    >
                      {a.name}
                    </Text>
                    {!a.user_id && (
                      <Text
                        className="text-xs"
                        style={{ color: colors.textMuted }}
                      >
                        (shared)
                      </Text>
                    )}
                  </View>
                </Pressable>
              ))}
              {agents.length === 0 && (
                <Text
                  className="px-4 py-3 text-sm"
                  style={{ color: colors.textMuted }}
                >
                  No agents found
                </Text>
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

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
