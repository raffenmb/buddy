import { View, KeyboardAvoidingView, Platform } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { BuddyProvider } from '../context/BuddyProvider';
import useWebSocket from '../hooks/useWebSocket';
import TopBar from '../components/TopBar';
import Canvas from '../components/Canvas';
import Avatar from '../components/Avatar';
import InputBar from '../components/InputBar';

function ChatScreen() {
  const { colors } = useTheme();
  useWebSocket();

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ backgroundColor: colors.bgBase }}
    >
      <TopBar />
      <Canvas />
      <Avatar />
      <InputBar />
    </KeyboardAvoidingView>
  );
}

export default function MainScreen() {
  return (
    <BuddyProvider>
      <ChatScreen />
    </BuddyProvider>
  );
}
