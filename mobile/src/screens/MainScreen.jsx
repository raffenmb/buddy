import { KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import useWebSocket from '../hooks/useWebSocket';
import useAudioPlayer from '../hooks/useAudioPlayer';
import useNotifications from '../hooks/useNotifications';
import TopBar from '../components/TopBar';
import Canvas from '../components/Canvas';
import Avatar from '../components/Avatar';
import InputBar from '../components/InputBar';

export default function MainScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  useWebSocket();
  useAudioPlayer();
  useNotifications(navigation);

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : -insets.bottom}
      style={{ backgroundColor: colors.bgBase }}
    >
      <TopBar />
      <Canvas />
      <Avatar />
      <InputBar />
    </KeyboardAvoidingView>
  );
}
