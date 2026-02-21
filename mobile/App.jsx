import './global.css';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './src/theme/ThemeProvider';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
