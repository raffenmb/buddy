import './global.css';
import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './src/theme/ThemeProvider';
import { AlertProvider } from './src/components/AlertModal';
import { AuthProvider } from './src/context/AuthContext';
import { BuddyProvider } from './src/context/BuddyProvider';
import AppNavigator from './src/navigation/AppNavigator';

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded] = useFonts({
    'Figtree-Regular': require('./assets/fonts/Figtree-Regular.ttf'),
    'Figtree-SemiBold': require('./assets/fonts/Figtree-SemiBold.ttf'),
    'Figtree-Bold': require('./assets/fonts/Figtree-Bold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

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
