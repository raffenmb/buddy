import { useCallback } from 'react';
import { ScrollView, View, Text } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useBuddy } from '../context/BuddyProvider';
import { ELEMENT_COMPONENTS } from '../canvas-elements';
import Notification from '../canvas-elements/Notification';

function CanvasElement({ element }) {
  const { colors } = useTheme();
  const Component = ELEMENT_COMPONENTS[element.type];

  if (!Component) {
    return (
      <View
        className="rounded-2xl p-6"
        style={{
          backgroundColor: colors.bgSurface,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text
          className="text-xs uppercase tracking-wider font-semibold mb-2"
          style={{ color: colors.textMuted }}
        >
          {element.type}
        </Text>
        {element.title && (
          <Text
            className="text-lg font-semibold mb-2"
            style={{ color: colors.textPrimary }}
          >
            {element.title}
          </Text>
        )}
        {element.content && (
          <Text className="text-sm" style={{ color: colors.textSecondary }}>
            {element.content}
          </Text>
        )}
      </View>
    );
  }

  return <Component {...element} />;
}

function getLayoutStyle(layout) {
  switch (layout) {
    case 'two-column':
      return { flexDirection: 'row', flexWrap: 'wrap', gap: 12 };
    case 'grid':
      return { flexDirection: 'row', flexWrap: 'wrap', gap: 12 };
    case 'dashboard':
      return { flexDirection: 'row', flexWrap: 'wrap', gap: 12 };
    case 'fullscreen':
      return { flex: 1 };
    case 'single':
    default:
      return { gap: 12 };
  }
}

function getItemStyle(layout, index) {
  switch (layout) {
    case 'two-column':
      return { flexBasis: '48%', flexGrow: 1, minWidth: 200 };
    case 'grid':
      return { flexBasis: '31%', flexGrow: 1, minWidth: 180 };
    case 'dashboard':
      return index === 0
        ? { flexBasis: '100%' }
        : { flexBasis: '48%', flexGrow: 1, minWidth: 200 };
    default:
      return { width: '100%' };
  }
}

export default function Canvas() {
  const { colors } = useTheme();
  const { state, dispatch } = useBuddy();
  const { elements, layout, notification } = state.canvas;

  const handleDismissNotification = useCallback(() => {
    dispatch({ type: 'CANVAS_SHOW_NOTIFICATION', payload: null });
  }, [dispatch]);

  // Separate interactive elements from content
  const interactive = elements.filter(
    (el) => el.type === 'confirmation' || el.type === 'form'
  );
  const content = elements.filter(
    (el) => el.type !== 'confirmation' && el.type !== 'form'
  );

  const showContent =
    state.canvas.mode === 'content' || state.canvas.mode === 'media';
  const showInteractiveOnly = !showContent && interactive.length > 0;

  if (!showContent && !showInteractiveOnly) {
    return (
      <View className="flex-1" style={{ position: 'relative' }}>
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textMuted }}>
            Send a message to get started
          </Text>
        </View>
        {notification && (
          <Notification
            {...notification}
            onDismiss={handleDismissNotification}
          />
        )}
      </View>
    );
  }

  const displayElements = showContent ? elements : interactive;
  const displayLayout = showContent ? layout : 'single';
  const layoutStyle = getLayoutStyle(displayLayout);

  return (
    <View className="flex-1" style={{ position: 'relative' }}>
      <ScrollView className="flex-1 p-4" contentContainerStyle={layoutStyle}>
        {displayElements.map((el, i) => (
          <View key={el.id || i} style={getItemStyle(displayLayout, i)}>
            <CanvasElement element={el} />
          </View>
        ))}
      </ScrollView>
      {notification && (
        <Notification {...notification} onDismiss={handleDismissNotification} />
      )}
    </View>
  );
}
