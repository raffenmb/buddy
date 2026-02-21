import { useState } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import Svg, { Line, Polygon } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { useBuddy } from '../context/BuddyProvider';
import { getApi } from '../lib/api';

export default function InputBar() {
  const { colors } = useTheme();
  const { state, dispatch, wsRef } = useBuddy();
  const [text, setText] = useState('');

  const hasText = text.trim().length > 0;

  const handleSend = async () => {
    const prompt = text.trim();
    if (!prompt || state.input.isProcessing) return;

    // Cancel any playing audio
    if (wsRef.current?.cancelAudio) wsRef.current.cancelAudio();

    dispatch({ type: 'CLEAR_SUBTITLE' });
    dispatch({ type: 'SET_PROCESSING', payload: true });
    setText('');

    try {
      const api = getApi();
      await api('/api/prompt', {
        method: 'POST',
        body: { prompt, agent_id: state.agent.id },
      });
    } catch (err) {
      console.error('Failed to send prompt:', err);
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  };

  return (
    <View
      className="px-3 py-3"
      style={{ backgroundColor: colors.bgBase }}
    >
      <View
        className="flex-row items-center gap-2 rounded-full px-4 py-2"
        style={{
          backgroundColor: colors.bgSurface,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <TextInput
          className="flex-1 text-sm"
          style={{ color: colors.textPrimary }}
          placeholder={`Talk to ${state.agent.name}...`}
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          editable={!state.input.isProcessing}
          multiline={false}
        />
        <Pressable
          className="w-8 h-8 rounded-full items-center justify-center"
          style={{
            backgroundColor: hasText ? colors.accent : colors.bgRaised,
            opacity: !hasText || state.input.isProcessing ? 0.4 : 1,
          }}
          onPress={handleSend}
          disabled={!hasText || state.input.isProcessing}
        >
          <Svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke={hasText ? '#FFFFFF' : colors.textMuted}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Line x1="22" y1="2" x2="11" y2="13" />
            <Polygon points="22 2 15 22 11 13 2 9 22 2" />
          </Svg>
        </Pressable>
      </View>
    </View>
  );
}
