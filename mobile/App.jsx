import './global.css';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './src/theme/ThemeProvider';
import { AlertProvider } from './src/components/AlertModal';
import { AuthProvider } from './src/context/AuthContext';
import { BuddyProvider } from './src/context/BuddyProvider';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AlertProvider>
          <AuthProvider>
            <BuddyProvider>
              <AppNavigator />
            </BuddyProvider>
          </AuthProvider>
        </AlertProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
