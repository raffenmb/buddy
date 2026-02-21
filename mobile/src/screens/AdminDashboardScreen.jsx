import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Svg, { Path, Polyline } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../context/AuthContext';
import { useAlert } from '../components/AlertModal';
import { getApi, getBaseUrl } from '../lib/api';
import { removeToken } from '../lib/storage';
import { AVATAR_PRESETS } from '../assets/avatarPresets';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function AdminDashboardScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { showAlert, showConfirm } = useAlert();
  const navigation = useNavigation();
  const [agents, setAgents] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [createShared, setCreateShared] = useState(false);

  async function loadAgents() {
    try {
      const api = getApi();
      const data = await api('/api/agents');
      setAgents(data);
    } catch (err) {
      console.error('Failed to load agents:', err);
    }
  }

  // Reload agents when screen comes into focus (e.g. after editing)
  useFocusEffect(
    useCallback(() => {
      loadAgents();
    }, [])
  );

  async function handleCreate() {
    const id = newId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const name = newName.trim();
    if (!id || !name) return;

    try {
      const api = getApi();
      await api('/api/agents', {
        method: 'POST',
        body: { id, name, shared: createShared },
      });
      setNewId('');
      setNewName('');
      setShowCreate(false);
      setCreateShared(false);
      await loadAgents();
      navigation.navigate('AgentEditor', { agentId: id });
    } catch (err) {
      showAlert(err.message);
    }
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bgBase }}>
      {/* Header */}
      <View
        className="flex-row items-center px-4 pb-3"
        style={{
          paddingTop: insets.top + 8,
          backgroundColor: colors.bgSurface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={8}
          className="mr-3"
        >
          <Svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke={colors.textSecondary}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Polyline points="15 18 9 12 15 6" />
          </Svg>
        </Pressable>
        <Text
          className="text-base font-semibold flex-1"
          style={{ color: colors.textPrimary }}
        >
          Agents
        </Text>
        {user?.isAdmin ? (
          <Pressable
            onPress={() => navigation.navigate('UserList')}
            hitSlop={8}
          >
            <Svg
              width={20}
              height={20}
              viewBox="0 0 24 24"
              fill="none"
              stroke={colors.textSecondary}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <Path d="M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
              <Path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </Svg>
          </Pressable>
        ) : null}
      </View>

      <ScrollView className="flex-1 p-4" contentContainerStyle={{ gap: 12 }}>
        {/* Agent cards */}
        {agents.map((a) => {
          const preset = AVATAR_PRESETS[a.avatar] || AVATAR_PRESETS.buddy;
          const AvatarSvg = preset.idle;

          return (
            <Pressable
              key={a.id}
              onPress={() => navigation.navigate('AgentEditor', { agentId: a.id })}
              className="flex-row items-center p-4 rounded-2xl"
              style={{
                backgroundColor: colors.bgSurface,
                borderWidth: 1,
                borderColor: colors.border,
                gap: 16,
              }}
            >
              <View className="rounded-xl overflow-hidden" style={{ width: 48, height: 48 }}>
                <AvatarSvg width={48} height={48} />
              </View>
              <View className="flex-1" style={{ minWidth: 0 }}>
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <Text
                    className="text-sm font-semibold"
                    style={{ color: colors.textPrimary }}
                    numberOfLines={1}
                  >
                    {a.name}
                  </Text>
                  {a.is_shared === 1 && a.userCount >= 2 ? (
                    <View
                      className="px-2 rounded-lg"
                      style={{
                        backgroundColor: colors.bgRaised,
                        borderWidth: 1,
                        borderColor: colors.border,
                        paddingVertical: 2,
                      }}
                    >
                      <Text className="text-xs" style={{ color: colors.textMuted }}>
                        Shared
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
              {/* Chevron */}
              <Svg
                width={20}
                height={20}
                viewBox="0 0 24 24"
                fill="none"
                stroke={colors.textMuted}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Polyline points="9 18 15 12 9 6" />
              </Svg>
            </Pressable>
          );
        })}

        {/* Create agent section */}
        {showCreate ? (
          <View
            className="rounded-2xl p-4"
            style={{
              backgroundColor: colors.bgSurface,
              borderWidth: 1,
              borderColor: colors.border,
              gap: 12,
            }}
          >
            <View
              className="self-start px-2 py-1 rounded-lg"
              style={{ backgroundColor: colors.bgRaised }}
            >
              <Text className="text-xs font-medium" style={{ color: colors.textMuted }}>
                {createShared ? 'Shared Agent' : 'Personal Agent'}
              </Text>
            </View>
            <TextInput
              value={newId}
              onChangeText={setNewId}
              placeholder="agent-id"
              placeholderTextColor={colors.textMuted}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              className="rounded-xl px-3 py-2 text-sm"
              style={{
                backgroundColor: colors.bgRaised,
                borderWidth: 1,
                borderColor: colors.border,
                color: colors.textPrimary,
              }}
            />
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="Display Name"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              onSubmitEditing={handleCreate}
              className="rounded-xl px-3 py-2 text-sm"
              style={{
                backgroundColor: colors.bgRaised,
                borderWidth: 1,
                borderColor: colors.border,
                color: colors.textPrimary,
              }}
            />
            <View className="flex-row" style={{ gap: 8 }}>
              <Pressable
                onPress={handleCreate}
                className="flex-1 rounded-xl px-4 py-2.5 items-center"
                style={{ backgroundColor: colors.accent }}
              >
                <Text className="text-sm font-medium text-white">Create</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setShowCreate(false);
                  setNewId('');
                  setNewName('');
                }}
                className="flex-1 rounded-xl px-4 py-2.5 items-center"
                style={{ backgroundColor: colors.bgRaised }}
              >
                <Text className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                  Cancel
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View className="flex-row" style={{ gap: 8, marginTop: 4 }}>
            <Pressable
              onPress={() => {
                setCreateShared(false);
                setShowCreate(true);
              }}
              className="flex-1 rounded-2xl px-4 py-3.5 items-center"
              style={{
                backgroundColor: colors.bgSurface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                + New Agent
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setCreateShared(true);
                setShowCreate(true);
              }}
              className="flex-1 rounded-2xl px-4 py-3.5 items-center"
              style={{
                backgroundColor: colors.bgSurface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                + Shared Agent
              </Text>
            </Pressable>
          </View>
        )}

        {/* Server info + change server */}
        <View style={{ marginTop: 24, gap: 12 }}>
          <View
            className="rounded-2xl px-4 py-3"
            style={{
              backgroundColor: colors.bgSurface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text className="text-xs" style={{ color: colors.textMuted }}>
              Connected to: {getBaseUrl()}
            </Text>
          </View>
          <Pressable
            onPress={async () => {
              const confirmed = await showConfirm(
                'Disconnect from this server? You will need to enter a new server URL.'
              );
              if (!confirmed) return;
              await removeToken();
              await AsyncStorage.removeItem('buddy_server_url');
              navigation.reset({ index: 0, routes: [{ name: 'ServerSetup' }] });
            }}
            className="rounded-2xl px-4 py-3.5 items-center"
            style={{
              backgroundColor: colors.bgSurface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text className="text-sm font-medium" style={{ color: '#EF4444' }}>
              Change Server
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
