import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useBuddy } from '../context/BuddyProvider';

export default function Checklist({ id, title, items: externalItems }) {
  const { colors } = useTheme();
  const { wsRef } = useBuddy();
  const [items, setItems] = useState(externalItems || []);
  const lastLocalUpdate = useRef(0);

  // Sync when the agent updates items externally
  useEffect(() => {
    if (Date.now() - lastLocalUpdate.current < 2000) return;
    if (externalItems) setItems(externalItems);
  }, [externalItems]);

  const toggleItem = (index) => {
    const newItems = items.map((item, i) =>
      i === index ? { ...item, checked: !item.checked } : item
    );
    lastLocalUpdate.current = Date.now();
    setItems(newItems);

    const ws = wsRef.current?.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'canvas_element_update',
          id,
          updates: { items: newItems },
        })
      );
    }
  };

  const checkedCount = items.filter((item) => item.checked).length;

  return (
    <View
      className="rounded-2xl p-6"
      style={{
        backgroundColor: colors.bgSurface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {title ? (
        <Text
          className="text-lg font-semibold mb-4"
          style={{ color: colors.textPrimary }}
        >
          {title}
        </Text>
      ) : null}

      <View style={{ gap: 12 }}>
        {items.map((item, i) => (
          <Pressable
            key={i}
            className="flex-row items-center gap-3"
            onPress={() => toggleItem(i)}
          >
            {/* Toggle switch */}
            <View
              className="rounded-full"
              style={{
                width: 40,
                height: 24,
                backgroundColor: item.checked ? '#10B981' : colors.border,
                position: 'relative',
              }}
            >
              <View
                className="rounded-full"
                style={{
                  width: 20,
                  height: 20,
                  backgroundColor: '#fff',
                  position: 'absolute',
                  top: 2,
                  left: item.checked ? 18 : 2,
                }}
              />
            </View>
            <Text
              className="text-sm flex-1"
              style={{
                color: item.checked
                  ? colors.textMuted
                  : colors.textPrimary,
                textDecorationLine: item.checked ? 'line-through' : 'none',
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text className="text-xs mt-4" style={{ color: colors.textMuted }}>
        {checkedCount} of {items.length} completed
      </Text>
    </View>
  );
}
