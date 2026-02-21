import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Svg, { Polyline } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { useAlert } from '../components/AlertModal';
import { getApi } from '../lib/api';

function ToggleSwitch({ checked, onToggle, colors }) {
  return (
    <Pressable
      onPress={onToggle}
      className="rounded-full"
      style={{
        width: 44,
        height: 24,
        backgroundColor: checked ? colors.accent : colors.bgRaised,
        borderWidth: checked ? 0 : 1,
        borderColor: colors.border,
        justifyContent: 'center',
      }}
    >
      <View
        className="rounded-full"
        style={{
          width: 20,
          height: 20,
          backgroundColor: checked ? '#FFFFFF' : colors.textMuted,
          marginLeft: checked ? 22 : 2,
        }}
      />
    </Pressable>
  );
}

export default function ToolSelectorScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { showAlert, showConfirm } = useAlert();
  const navigation = useNavigation();
  const route = useRoute();

  const initialEnabledTools = route.params?.enabledTools;
  const onToolsChange = route.params?.onToolsChange;

  const [skills, setSkills] = useState([]);
  const [enabledTools, setEnabledTools] = useState(initialEnabledTools || []);
  const [editing, setEditing] = useState(null);
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    loadSkills();
  }, []);

  async function loadSkills() {
    try {
      const api = getApi();
      const data = await api('/api/skills');
      setSkills(data);
    } catch (err) {
      console.error('Failed to load skills:', err);
    }
  }

  const selected = enabledTools || [];

  function isChecked(itemName) {
    return selected.includes(itemName);
  }

  function toggle(itemName) {
    let next;
    if (selected.includes(itemName)) {
      next = selected.filter((n) => n !== itemName);
    } else {
      next = [...selected, itemName];
    }
    const result = next.length > 0 ? next : null;
    setEnabledTools(result || []);
    onToolsChange?.(result);
  }

  async function handleDeleteSkill(folderName) {
    const confirmed = await showConfirm(
      `Delete skill "${folderName}"? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      const api = getApi();
      await api(`/api/skills/${folderName}`, { method: 'DELETE' });
      setSkills((prev) => prev.filter((s) => s.folderName !== folderName));

      if (enabledTools && enabledTools.includes(folderName)) {
        const next = enabledTools.filter((n) => n !== folderName);
        const result = next.length > 0 ? next : null;
        setEnabledTools(result || []);
        onToolsChange?.(result);
      }
    } catch (err) {
      showAlert('Failed to delete skill: ' + err.message);
    }
  }

  async function handleEditSkill(folderName) {
    setEditError('');
    try {
      const api = getApi();
      const data = await api(`/api/skills/${folderName}`);
      setEditing({ folderName, content: data.content });
    } catch (err) {
      showAlert('Failed to load skill: ' + err.message);
    }
  }

  async function handleSaveEdit() {
    if (!editing) return;
    setEditSaving(true);
    setEditError('');

    try {
      const api = getApi();
      await api(`/api/skills/${editing.folderName}`, {
        method: 'PUT',
        body: { content: editing.content },
      });
      await loadSkills();
      setEditing(null);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
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
          Skills
        </Text>
      </View>

      <ScrollView className="flex-1 p-4">
        {/* Skills toggle list */}
        {skills.map((s) => (
          <View
            key={s.folderName}
            className="flex-row items-center justify-between py-3 px-1"
            style={{
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <View className="flex-1" style={{ minWidth: 0, marginRight: 12 }}>
              <View className="flex-row items-center" style={{ gap: 8 }}>
                <Text
                  className="text-sm"
                  style={{ color: colors.textPrimary }}
                  numberOfLines={1}
                >
                  {s.name}
                </Text>
                <View
                  className="px-1.5 rounded-full"
                  style={{
                    backgroundColor: colors.accent,
                    paddingVertical: 1,
                  }}
                >
                  <Text className="text-xs text-white">Skill</Text>
                </View>
              </View>
              {s.description ? (
                <Text
                  className="text-xs mt-0.5"
                  style={{ color: colors.textMuted }}
                  numberOfLines={2}
                >
                  {s.description}
                </Text>
              ) : null}
            </View>

            <View className="flex-row items-center" style={{ gap: 8 }}>
              <Pressable onPress={() => handleEditSkill(s.folderName)}>
                <Text className="text-xs" style={{ color: colors.accent }}>
                  Edit
                </Text>
              </Pressable>
              <Pressable onPress={() => handleDeleteSkill(s.folderName)}>
                <Text className="text-xs" style={{ color: '#EF4444' }}>
                  Delete
                </Text>
              </Pressable>
              <ToggleSwitch
                checked={isChecked(s.folderName)}
                onToggle={() => toggle(s.folderName)}
                colors={colors}
              />
            </View>
          </View>
        ))}

        {skills.length === 0 ? (
          <View className="py-8 items-center">
            <Text className="text-sm" style={{ color: colors.textMuted }}>
              No skills installed. Skills can be created by the agent or uploaded via
              the web interface.
            </Text>
          </View>
        ) : null}

        {/* Skill editor */}
        {editing ? (
          <View
            className="mt-4 rounded-xl p-4"
            style={{
              backgroundColor: colors.bgRaised,
              borderWidth: 1,
              borderColor: colors.border,
              gap: 12,
            }}
          >
            <View className="flex-row items-center justify-between">
              <Text
                className="text-sm font-medium"
                style={{ color: colors.textPrimary }}
              >
                {editing.folderName}/SKILL.md
              </Text>
              <Pressable
                onPress={() => {
                  setEditing(null);
                  setEditError('');
                }}
              >
                <Text className="text-xs" style={{ color: colors.textMuted }}>
                  Cancel
                </Text>
              </Pressable>
            </View>
            <TextInput
              value={editing.content}
              onChangeText={(text) =>
                setEditing({ ...editing, content: text })
              }
              multiline
              textAlignVertical="top"
              className="rounded-lg p-3 text-sm"
              style={{
                backgroundColor: colors.bgBase,
                color: colors.textPrimary,
                borderWidth: 1,
                borderColor: colors.border,
                fontFamily: 'monospace',
                minHeight: 200,
              }}
            />
            {editError ? (
              <View
                className="p-3 rounded-xl"
                style={{
                  backgroundColor: '#FEF2F2',
                  borderWidth: 1,
                  borderColor: '#FECACA',
                }}
              >
                <Text className="text-sm" style={{ color: '#DC2626' }}>
                  {editError}
                </Text>
              </View>
            ) : null}
            <Pressable
              onPress={handleSaveEdit}
              disabled={editSaving}
              className="self-end rounded-lg px-4 py-1.5"
              style={{
                backgroundColor: colors.accent,
                opacity: editSaving ? 0.6 : 1,
              }}
            >
              <Text className="text-sm font-medium text-white">
                {editSaving ? 'Saving...' : 'Save'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Bottom spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}
