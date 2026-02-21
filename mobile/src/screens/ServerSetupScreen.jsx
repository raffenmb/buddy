import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { setServerUrl } from '../lib/storage';
import { initApi } from '../lib/api';

export default function ServerSetupScreen({ navigation }) {
  const { colors } = useTheme();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);

  const handleConnect = async () => {
    if (!url.trim()) return;
    setTesting(true);
    setError('');
    try {
      await setServerUrl(url.trim());
      const api = await initApi();
      // Use fetch directly — no auth token yet
      const res = await fetch(`${url.trim()}/api/health`);
      if (!res.ok) throw new Error('Server unreachable');
      navigation.replace('Login');
    } catch (e) {
      setError('Cannot reach server. Check the URL and try again.');
    }
    setTesting(false);
  };

  return (
    <View className="flex-1 justify-center p-8" style={{ backgroundColor: colors.bgBase }}>
      <Text
        className="text-2xl font-bold mb-2"
        style={{ color: colors.textPrimary }}
      >
        Connect to Buddy
      </Text>
      <Text className="mb-6" style={{ color: colors.textSecondary }}>
        Enter your Buddy server URL (Tailscale IP)
      </Text>
      <TextInput
        className="rounded-xl p-4 mb-4"
        style={{
          backgroundColor: colors.bgSurface,
          color: colors.textPrimary,
          borderWidth: 1,
          borderColor: colors.border,
        }}
        placeholder="http://100.x.y.z:3001"
        placeholderTextColor={colors.textMuted}
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      {error ? (
        <Text className="mb-4" style={{ color: '#ef4444' }}>
          {error}
        </Text>
      ) : null}
      <Pressable
        className="rounded-xl p-4 items-center"
        style={{
          backgroundColor: colors.accent,
          opacity: testing ? 0.6 : 1,
        }}
        onPress={handleConnect}
        disabled={testing}
      >
        {testing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white font-semibold">Connect</Text>
        )}
      </Pressable>
    </View>
  );
}
