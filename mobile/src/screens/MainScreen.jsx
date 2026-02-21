import { KeyboardAvoidingView, Platform } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import useWebSocket from '../hooks/useWebSocket';
import useAudioPlayer from '../hooks/useAudioPlayer';
import TopBar from '../components/TopBar';
import Canvas from '../components/Canvas';
import Avatar from '../components/Avatar';
import InputBar from '../components/InputBar';

export default function MainScreen() {
  const { colors } = useTheme();
  useWebSocket();
  useAudioPlayer();

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
