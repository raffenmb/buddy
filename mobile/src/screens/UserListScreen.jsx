import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path, Circle, Polyline } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { useAlert } from '../components/AlertModal';
import { getApi } from '../lib/api';

export default function UserListScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { showAlert, showConfirm } = useAlert();
  const navigation = useNavigation();
  const [users, setUsers] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      const api = getApi();
      setUsers(await api('/api/admin/users'));
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  }

  async function handleCreate() {
    const username = newUsername.trim().toLowerCase();
    const displayName = newDisplayName.trim();
    const password = newPassword;
    if (!username || !displayName || !password) return;
    try {
      const api = getApi();
      await api('/api/admin/users', {
        method: 'POST',
        body: { username, displayName, password },
      });
      setNewUsername('');
      setNewDisplayName('');
      setNewPassword('');
      setShowCreate(false);
      await loadUsers();
    } catch (err) {
      showAlert(err.message);
    }
  }

  async function toggleAdmin(user) {
    const newVal = user.is_admin ? 0 : 1;
    const action = newVal ? 'Promote' : 'Demote';
    const confirmed = await showConfirm(
      `${action} "${user.display_name}" ${newVal ? 'to' : 'from'} admin?`
    );
    if (!confirmed) return;
    try {
      const api = getApi();
      await api(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        body: { is_admin: newVal },
      });
      await loadUsers();
    } catch (err) {
      showAlert(err.message);
    }
  }

  async function handleDelete(user) {
    const confirmed = await showConfirm(
      `Delete user "${user.display_name}"? All their agents and data will be permanently deleted.`
    );
    if (!confirmed) return;
    try {
      const api = getApi();
      await api(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      await loadUsers();
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
          className="text-base font-semibold"
          style={{ color: colors.textPrimary }}
        >
          Users
        </Text>
      </View>

      <ScrollView className="flex-1 p-4" contentContainerStyle={{ gap: 12 }}>
        {/* User cards */}
        {users.map((u) => (
          <View
            key={u.id}
            className="flex-row items-center p-4 rounded-2xl"
            style={{
              backgroundColor: colors.bgSurface,
              borderWidth: 1,
              borderColor: colors.border,
              gap: 12,
            }}
          >
            {/* User icon */}
            <View
              className="rounded-xl items-center justify-center"
              style={{
                width: 40,
                height: 40,
                backgroundColor: colors.bgRaised,
              }}
            >
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
                <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <Circle cx="12" cy="7" r="4" />
              </Svg>
            </View>

            {/* Name + username */}
            <View className="flex-1" style={{ minWidth: 0 }}>
              <Text
                className="text-sm font-semibold"
                style={{ color: colors.textPrimary }}
                numberOfLines={1}
              >
                {u.display_name}
              </Text>
              <Text
                className="text-xs"
                style={{ color: colors.textMuted }}
                numberOfLines={1}
              >
                @{u.username}
              </Text>
            </View>

            {/* Admin toggle */}
            <Pressable
              onPress={() => toggleAdmin(u)}
              className="px-3 py-1 rounded-lg"
              style={
                u.is_admin
                  ? { backgroundColor: colors.accent }
                  : {
                      backgroundColor: colors.bgRaised,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }
              }
            >
              <Text
                className="text-xs font-medium"
                style={{
                  color: u.is_admin ? '#FFFFFF' : colors.textMuted,
                }}
              >
                {u.is_admin ? 'Admin' : 'User'}
              </Text>
            </Pressable>

            {/* Delete button */}
            <Pressable
              onPress={() => handleDelete(u)}
              className="p-2 rounded-xl"
              hitSlop={4}
            >
              <Svg
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke={colors.textMuted}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Polyline points="3 6 5 6 21 6" />
                <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </Svg>
            </Pressable>
          </View>
        ))}

        {/* Create user section */}
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
            <TextInput
              value={newUsername}
              onChangeText={setNewUsername}
              placeholder="username"
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
              value={newDisplayName}
              onChangeText={setNewDisplayName}
              placeholder="Display Name"
              placeholderTextColor={colors.textMuted}
              className="rounded-xl px-3 py-2 text-sm"
              style={{
                backgroundColor: colors.bgRaised,
                borderWidth: 1,
                borderColor: colors.border,
                color: colors.textPrimary,
              }}
            />
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
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
                  setNewUsername('');
                  setNewDisplayName('');
                  setNewPassword('');
                }}
                className="flex-1 rounded-xl px-4 py-2.5 items-center"
                style={{ backgroundColor: colors.bgRaised }}
              >
                <Text
                  className="text-sm font-medium"
                  style={{ color: colors.textSecondary }}
                >
                  Cancel
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => setShowCreate(true)}
            className="rounded-2xl px-4 py-3.5 items-center"
            style={{
              backgroundColor: colors.bgSurface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              className="text-sm font-medium"
              style={{ color: colors.textSecondary }}
            >
              + New User
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}
