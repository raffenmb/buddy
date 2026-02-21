import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen({ navigation }) {
  const { colors } = useTheme();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) return;
    setLoading(true);
    setError('');
    try {
      await login(username.trim(), password);
      navigation.replace('Main');
    } catch (e) {
      setError('Invalid username or password');
    }
    setLoading(false);
  };

  return (
    <View className="flex-1 justify-center p-8" style={{ backgroundColor: colors.bgBase }}>
      <View
        className="rounded-2xl p-8"
        style={{
          backgroundColor: colors.bgSurface,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <View className="items-center mb-6">
          <Text
            className="text-2xl font-bold mb-1"
            style={{ color: colors.textPrimary }}
          >
            Buddy
          </Text>
          <Text className="text-sm" style={{ color: colors.textMuted }}>
            Sign in to continue
          </Text>
        </View>

        <TextInput
          className="rounded-xl px-4 py-3 mb-4 text-sm"
          style={{
            backgroundColor: colors.bgRaised,
            color: colors.textPrimary,
            borderWidth: 1,
            borderColor: colors.border,
          }}
          placeholder="Username"
          placeholderTextColor={colors.textMuted}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          className="rounded-xl px-4 py-3 mb-4 text-sm"
          style={{
            backgroundColor: colors.bgRaised,
            color: colors.textPrimary,
            borderWidth: 1,
            borderColor: colors.border,
          }}
          placeholder="Password"
          placeholderTextColor={colors.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {error ? (
          <Text className="text-sm mb-4" style={{ color: '#EF4444' }}>
            {error}
          </Text>
        ) : null}

        <Pressable
          className="rounded-xl px-4 py-3 items-center"
          style={{
            backgroundColor: colors.accent,
            opacity: loading ? 0.5 : 1,
          }}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-semibold text-sm">Sign In</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
