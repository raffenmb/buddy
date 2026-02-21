import { useState, useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useBuddy } from '../context/BuddyProvider';

const STATUS_BORDER_COLORS = {
  pending: '#F59E0B',
  approved: '#10B981',
  denied: '#EF4444',
};

const STATUS_ICONS = {
  pending: '\u26A0\uFE0F',
  approved: '\u2705',
  denied: '\u274C',
};

const STATUS_MESSAGES = {
  approved: 'Approved — executing command.',
  denied: 'Denied — command cancelled.',
};

export default function ActionConfirm({ id, title, command, reason, context }) {
  const { colors } = useTheme();
  const { wsRef } = useBuddy();
  const [status, setStatus] = useState('pending');

  const handleResponse = useCallback(
    (approved) => {
      setStatus(approved ? 'approved' : 'denied');
      try {
        const ws = wsRef.current?.ws;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'confirm_response', id, approved }));
        }
      } catch (err) {
        console.error('ActionConfirm: failed to send response', err);
      }
    },
    [id, wsRef]
  );

  const borderColor = STATUS_BORDER_COLORS[status];
  const icon = STATUS_ICONS[status];

  return (
    <View
      className="rounded-2xl p-6"
      style={{
        backgroundColor: colors.bgSurface,
        borderWidth: 1,
        borderColor: colors.border,
        borderLeftWidth: 4,
        borderLeftColor: borderColor,
      }}
    >
      <View className="flex-row items-start gap-3">
        <Text className="text-xl flex-shrink-0">{icon}</Text>
        <View className="flex-1">
          <Text
            className="text-lg font-semibold"
            style={{ color: colors.textPrimary }}
          >
            {title || 'Confirm Action'}
          </Text>

          {reason ? (
            <Text
              className="text-sm mt-2"
              style={{ color: colors.textSecondary }}
            >
              {reason}
            </Text>
          ) : null}

          <View
            className="rounded-lg px-4 py-3 mt-3"
            style={{ backgroundColor: colors.bgRaised }}
          >
            <Text
              className="text-sm"
              style={{
                color: colors.textPrimary,
                fontFamily: 'monospace',
              }}
            >
              {command}
            </Text>
          </View>

          {context ? (
            <Text
              className="text-xs mt-2"
              style={{ color: colors.textMuted }}
            >
              {context}
            </Text>
          ) : null}

          {status === 'pending' ? (
            <View className="flex-row gap-3 mt-4">
              <Pressable
                className="rounded-xl px-5 py-2"
                style={{ backgroundColor: '#10B981' }}
                onPress={() => handleResponse(true)}
              >
                <Text className="text-sm font-semibold text-white">
                  Approve
                </Text>
              </Pressable>
              <Pressable
                className="rounded-xl px-5 py-2"
                style={{ backgroundColor: '#EF4444' }}
                onPress={() => handleResponse(false)}
              >
                <Text className="text-sm font-semibold text-white">Deny</Text>
              </Pressable>
            </View>
          ) : (
            <Text
              className="text-sm font-medium mt-4"
              style={{
                color: status === 'approved' ? '#10B981' : '#EF4444',
              }}
            >
              {STATUS_MESSAGES[status]}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}
