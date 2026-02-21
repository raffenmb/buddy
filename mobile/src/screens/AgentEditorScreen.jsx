import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Svg, { Polyline } from 'react-native-svg';
import { Audio } from 'expo-av';
import { useTheme } from '../theme/ThemeProvider';
import { useBuddy } from '../context/BuddyProvider';
import { useAlert } from '../components/AlertModal';
import { getApi } from '../lib/api';
import { AVATAR_PRESETS } from '../assets/avatarPresets';

const MODEL_OPTIONS = [
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
  { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5' },
  { value: 'claude-opus-4-6', label: 'Opus 4.6' },
];

export default function AgentEditorScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { state, dispatch } = useBuddy();
  const { showAlert, showConfirm } = useAlert();
  const navigation = useNavigation();
  const route = useRoute();
  const agentId = route.params?.agentId;

  const [agent, setAgent] = useState(null);
  const [identity, setIdentity] = useState('');
  const [userInfo, setUserInfo] = useState('');
  const [enabledTools, setEnabledTools] = useState(null);
  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [avatar, setAvatar] = useState('buddy');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [voiceProvider, setVoiceProvider] = useState('native');
  const [voiceId, setVoiceId] = useState('');
  const [voiceModelId, setVoiceModelId] = useState('eleven_flash_v2_5');
  const [voices, setVoices] = useState([]);
  const [ttsAvailable, setTtsAvailable] = useState(false);
  const [playingPreview, setPlayingPreview] = useState(null);
  const [previewSound, setPreviewSound] = useState(null);

  useEffect(() => {
    if (!agentId) return;
    loadAgent();
  }, [agentId]);

  useEffect(() => {
    const api = getApi();
    api('/api/tts/voices')
      .then((v) => {
        setVoices(v);
        setTtsAvailable(v.length > 0);
      })
      .catch(() => {
        setVoices([]);
        setTtsAvailable(false);
      });
  }, []);

  // Clean up preview sound on unmount
  useEffect(() => {
    return () => {
      if (previewSound) {
        previewSound.unloadAsync().catch(() => {});
      }
    };
  }, [previewSound]);

  async function loadAgent() {
    try {
      const api = getApi();
      const [agentData, identityData, userInfoData] = await Promise.all([
        api(`/api/agents/${agentId}`),
        api(`/api/agents/${agentId}/files/identity.md`).catch(() => ({ content: '' })),
        api(`/api/agents/${agentId}/files/user.md`).catch(() => ({ content: '' })),
      ]);
      setAgent(agentData);
      setName(agentData.name);
      setModel(agentData.model);
      setAvatar(agentData.avatar || 'buddy');
      // Parse voice config
      if (agentData.voice_config) {
        try {
          const vc =
            typeof agentData.voice_config === 'string'
              ? JSON.parse(agentData.voice_config)
              : agentData.voice_config;
          if (vc.voiceId) {
            setVoiceProvider('elevenlabs');
            setVoiceId(vc.voiceId);
            setVoiceModelId(vc.modelId || 'eleven_flash_v2_5');
          }
        } catch {}
      }
      setIdentity(identityData.content || '');
      setUserInfo(userInfoData.content || '');

      if (agentData.enabled_tools) {
        try {
          const parsed =
            typeof agentData.enabled_tools === 'string'
              ? JSON.parse(agentData.enabled_tools)
              : agentData.enabled_tools;
          setEnabledTools(parsed);
        } catch {
          setEnabledTools(null);
        }
      } else {
        setEnabledTools(null);
      }
    } catch (err) {
      console.error('Failed to load agent:', err);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const api = getApi();
      await Promise.all([
        api(`/api/agents/${agentId}`, {
          method: 'PUT',
          body: {
            name,
            model,
            avatar,
            enabled_tools: enabledTools,
            voice_config:
              voiceProvider === 'elevenlabs' && voiceId
                ? { provider: 'elevenlabs', voiceId, modelId: voiceModelId }
                : {},
          },
        }),
        api(`/api/agents/${agentId}/files/identity.md`, {
          method: 'PUT',
          body: { content: identity },
        }),
        api(`/api/agents/${agentId}/files/user.md`, {
          method: 'PUT',
          body: { content: userInfo },
        }),
      ]);
      // Update chat screen if editing the active agent
      if (agentId === state.agent.id) {
        dispatch({ type: 'SET_AGENT', payload: { name, avatar } });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      showAlert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const isShared = agent.is_shared === 1;
    const isLastUser = isShared && agent.userCount === 1;

    const message =
      isShared && !isLastUser
        ? `Remove "${name}" from your agents? Other users still have access.`
        : isShared && isLastUser
          ? `You're the last user. Delete "${name}" permanently? This cannot be undone.`
          : `Delete agent "${name}"? This cannot be undone.`;

    const confirmed = await showConfirm(message);
    if (!confirmed) return;
    try {
      const api = getApi();
      await api(`/api/agents/${agentId}`, { method: 'DELETE' });
      navigation.goBack();
    } catch (err) {
      showAlert(err.message);
    }
  }

  async function playVoicePreview(previewUrl) {
    if (!previewUrl) return;

    // Stop any existing preview
    if (previewSound) {
      await previewSound.unloadAsync().catch(() => {});
      setPreviewSound(null);
      if (playingPreview) {
        setPlayingPreview(null);
        return;
      }
    }

    try {
      const { sound } = await Audio.Sound.createAsync({ uri: previewUrl });
      setPreviewSound(sound);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          setPlayingPreview(null);
          sound.unloadAsync().catch(() => {});
          setPreviewSound(null);
        }
      });
      await sound.playAsync();
    } catch {
      setPlayingPreview(null);
    }
  }

  if (!agent) {
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: colors.bgBase }}
      >
        <ActivityIndicator color={colors.accent} />
      </View>
    );
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
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} className="mr-3">
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
        <Text className="text-base font-semibold" style={{ color: colors.textPrimary }}>
          Edit Agent
        </Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 24 }}>
        {/* Shared badge */}
        {agent.is_shared === 1 ? (
          <View
            className="flex-row items-center px-4 py-2 rounded-xl"
            style={{
              backgroundColor: colors.bgRaised,
              borderWidth: 1,
              borderColor: colors.border,
              gap: 8,
            }}
          >
            <Text className="text-sm" style={{ color: colors.textMuted }}>
              Shared with {agent.userCount || 1}{' '}
              {agent.userCount === 1 ? 'user' : 'users'} — changes affect everyone
            </Text>
          </View>
        ) : null}

        {/* Name */}
        <View>
          <Text
            className="text-sm font-medium mb-1"
            style={{ color: colors.textSecondary }}
          >
            Name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            className="rounded-xl px-3 py-2 text-sm"
            style={{
              backgroundColor: colors.bgRaised,
              borderWidth: 1,
              borderColor: colors.border,
              color: colors.textPrimary,
            }}
          />
        </View>

        {/* Avatar */}
        <View>
          <Text
            className="text-sm font-medium mb-2"
            style={{ color: colors.textSecondary }}
          >
            Avatar
          </Text>
          <View className="flex-row flex-wrap" style={{ gap: 12 }}>
            {Object.entries(AVATAR_PRESETS).map(([key, preset]) => {
              const AvatarSvg = preset.idle;
              return (
                <Pressable
                  key={key}
                  onPress={() => setAvatar(key)}
                  className="items-center p-2 rounded-xl"
                  style={{
                    borderWidth: 2,
                    borderColor: avatar === key ? colors.accent : colors.border,
                    backgroundColor: avatar === key ? colors.bgRaised : 'transparent',
                    gap: 4,
                  }}
                >
                  <View style={{ width: 60, height: 60 }}>
                    <AvatarSvg width={60} height={60} />
                  </View>
                  <Text className="text-xs" style={{ color: colors.textMuted }}>
                    {preset.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Voice */}
        <View>
          <Text
            className="text-sm font-medium mb-2"
            style={{ color: colors.textSecondary }}
          >
            Voice
          </Text>
          {/* Provider toggle */}
          <View className="flex-row flex-wrap mb-3" style={{ gap: 8 }}>
            <Pressable
              onPress={() => setVoiceProvider('native')}
              className="px-4 py-2 rounded-xl"
              style={{
                backgroundColor:
                  voiceProvider === 'native' ? colors.accent : colors.bgRaised,
                borderWidth: 1,
                borderColor:
                  voiceProvider === 'native' ? colors.accent : colors.border,
              }}
            >
              <Text
                className="text-sm font-medium"
                style={{
                  color: voiceProvider === 'native' ? '#FFFFFF' : colors.textSecondary,
                }}
              >
                Device Voice
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (ttsAvailable) setVoiceProvider('elevenlabs');
              }}
              className="px-4 py-2 rounded-xl"
              style={{
                backgroundColor:
                  voiceProvider === 'elevenlabs' ? colors.accent : colors.bgRaised,
                borderWidth: 1,
                borderColor:
                  voiceProvider === 'elevenlabs' ? colors.accent : colors.border,
                opacity: ttsAvailable ? 1 : 0.5,
              }}
            >
              <Text
                className="text-sm font-medium"
                style={{
                  color:
                    voiceProvider === 'elevenlabs'
                      ? '#FFFFFF'
                      : ttsAvailable
                        ? colors.textSecondary
                        : colors.textMuted,
                }}
              >
                ElevenLabs
              </Text>
            </Pressable>
          </View>

          {voiceProvider === 'native' && !ttsAvailable ? (
            <Text className="text-xs mb-2" style={{ color: colors.textMuted }}>
              ElevenLabs not configured — set ELEVENLABS_API_KEY in server .env
            </Text>
          ) : null}

          {/* ElevenLabs voice list */}
          {voiceProvider === 'elevenlabs' && ttsAvailable ? (
            <>
              <View
                className="rounded-xl mb-3"
                style={{
                  maxHeight: 240,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.bgRaised,
                }}
              >
                <ScrollView nestedScrollEnabled style={{ maxHeight: 240 }}>
                  {voices.map((v) => (
                    <Pressable
                      key={v.voiceId}
                      onPress={() => setVoiceId(v.voiceId)}
                      className="flex-row items-center px-3 py-2.5"
                      style={{
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border,
                        backgroundColor:
                          voiceId === v.voiceId ? colors.accent : 'transparent',
                        gap: 8,
                      }}
                    >
                      <Text
                        className="flex-1 text-sm"
                        style={{
                          color:
                            voiceId === v.voiceId ? '#FFFFFF' : colors.textPrimary,
                        }}
                        numberOfLines={1}
                      >
                        {v.name}
                      </Text>
                      {v.category ? (
                        <View
                          className="px-2 rounded-xl"
                          style={{
                            backgroundColor:
                              voiceId === v.voiceId
                                ? 'rgba(255,255,255,0.2)'
                                : colors.bgBase,
                            paddingVertical: 2,
                          }}
                        >
                          <Text
                            className="text-xs"
                            style={{
                              color:
                                voiceId === v.voiceId ? '#FFFFFF' : colors.textMuted,
                            }}
                          >
                            {v.category}
                          </Text>
                        </View>
                      ) : null}
                      {v.previewUrl ? (
                        <Pressable
                          onPress={() => {
                            setPlayingPreview(
                              playingPreview === v.voiceId ? null : v.voiceId
                            );
                            playVoicePreview(v.previewUrl);
                          }}
                          className="px-2 py-1 rounded-xl"
                          style={{
                            backgroundColor:
                              playingPreview === v.voiceId
                                ? 'rgba(255,255,255,0.3)'
                                : voiceId === v.voiceId
                                  ? 'rgba(255,255,255,0.2)'
                                  : colors.bgBase,
                          }}
                        >
                          <Text
                            className="text-xs font-medium"
                            style={{
                              color:
                                voiceId === v.voiceId
                                  ? '#FFFFFF'
                                  : colors.textSecondary,
                            }}
                          >
                            {playingPreview === v.voiceId ? 'Stop' : 'Play'}
                          </Text>
                        </Pressable>
                      ) : null}
                    </Pressable>
                  ))}
                  {voices.length === 0 ? (
                    <View className="px-3 py-4 items-center">
                      <Text className="text-sm" style={{ color: colors.textMuted }}>
                        No voices available
                      </Text>
                    </View>
                  ) : null}
                </ScrollView>
              </View>

              {/* Voice model toggle */}
              <Text
                className="text-xs font-medium mb-1"
                style={{ color: colors.textMuted }}
              >
                Voice Model
              </Text>
              <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                <Pressable
                  onPress={() => setVoiceModelId('eleven_flash_v2_5')}
                  className="px-4 py-2 rounded-xl"
                  style={{
                    backgroundColor:
                      voiceModelId === 'eleven_flash_v2_5'
                        ? colors.accent
                        : colors.bgRaised,
                    borderWidth: 1,
                    borderColor:
                      voiceModelId === 'eleven_flash_v2_5'
                        ? colors.accent
                        : colors.border,
                  }}
                >
                  <Text
                    className="text-sm font-medium"
                    style={{
                      color:
                        voiceModelId === 'eleven_flash_v2_5'
                          ? '#FFFFFF'
                          : colors.textSecondary,
                    }}
                  >
                    Flash v2.5
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setVoiceModelId('eleven_multilingual_v2')}
                  className="px-4 py-2 rounded-xl"
                  style={{
                    backgroundColor:
                      voiceModelId === 'eleven_multilingual_v2'
                        ? colors.accent
                        : colors.bgRaised,
                    borderWidth: 1,
                    borderColor:
                      voiceModelId === 'eleven_multilingual_v2'
                        ? colors.accent
                        : colors.border,
                  }}
                >
                  <Text
                    className="text-sm font-medium"
                    style={{
                      color:
                        voiceModelId === 'eleven_multilingual_v2'
                          ? '#FFFFFF'
                          : colors.textSecondary,
                    }}
                  >
                    Multilingual v2
                  </Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>

        {/* Model */}
        <View>
          <Text
            className="text-sm font-medium mb-2"
            style={{ color: colors.textSecondary }}
          >
            Model
          </Text>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {MODEL_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setModel(opt.value)}
                className="px-4 py-2 rounded-xl"
                style={{
                  backgroundColor:
                    model === opt.value ? colors.accent : colors.bgRaised,
                  borderWidth: 1,
                  borderColor:
                    model === opt.value ? colors.accent : colors.border,
                }}
              >
                <Text
                  className="text-sm font-medium"
                  style={{
                    color:
                      model === opt.value ? '#FFFFFF' : colors.textSecondary,
                  }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Personality */}
        <View>
          <Text
            className="text-sm font-medium mb-1"
            style={{ color: colors.textSecondary }}
          >
            Personality
          </Text>
          <TextInput
            value={identity}
            onChangeText={setIdentity}
            placeholder="Describe this agent's personality and tone..."
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            className="rounded-xl px-3 py-2 text-sm"
            style={{
              backgroundColor: colors.bgRaised,
              borderWidth: 1,
              borderColor: colors.border,
              color: colors.textPrimary,
              fontFamily: 'monospace',
              minHeight: 120,
            }}
          />
        </View>

        {/* User Info */}
        <View>
          <Text
            className="text-sm font-medium mb-1"
            style={{ color: colors.textSecondary }}
          >
            User Info
          </Text>
          <TextInput
            value={userInfo}
            onChangeText={setUserInfo}
            placeholder="Information about the user this agent should know..."
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            className="rounded-xl px-3 py-2 text-sm"
            style={{
              backgroundColor: colors.bgRaised,
              borderWidth: 1,
              borderColor: colors.border,
              color: colors.textPrimary,
              fontFamily: 'monospace',
              minHeight: 80,
            }}
          />
        </View>

        {/* Tools */}
        <View>
          <View className="flex-row items-center justify-between mb-2">
            <Text
              className="text-sm font-medium"
              style={{ color: colors.textSecondary }}
            >
              Skills
            </Text>
            <Pressable
              onPress={() =>
                navigation.navigate('ToolSelector', {
                  agentId,
                  enabledTools,
                  onToolsChange: (tools) => setEnabledTools(tools),
                })
              }
            >
              <Text className="text-sm" style={{ color: colors.accent }}>
                Manage
              </Text>
            </Pressable>
          </View>
          <View
            className="rounded-xl px-4 py-3"
            style={{
              backgroundColor: colors.bgRaised,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text className="text-sm" style={{ color: colors.textMuted }}>
              {enabledTools && enabledTools.length > 0
                ? `${enabledTools.length} skill${enabledTools.length === 1 ? '' : 's'} enabled`
                : 'No skills enabled'}
            </Text>
          </View>
        </View>

        {/* Actions */}
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingTop: 16,
          }}
        >
          <Pressable
            onPress={handleSave}
            disabled={saving}
            className="rounded-xl px-5 py-3.5 items-center"
            style={{
              backgroundColor: colors.accent,
              opacity: saving ? 0.5 : 1,
            }}
          >
            <Text className="text-white font-semibold">
              {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
            </Text>
          </Pressable>

          {agentId !== 'buddy' ? (
            <Pressable onPress={handleDelete} className="mt-3 items-center py-2">
              <Text
                className="text-sm font-medium"
                style={{
                  color:
                    agent?.is_shared === 1 && agent?.userCount > 1
                      ? colors.textSecondary
                      : '#EF4444',
                }}
              >
                {agent?.is_shared === 1 && agent?.userCount > 1
                  ? 'Leave Agent'
                  : 'Delete Agent'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* Bottom spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}
