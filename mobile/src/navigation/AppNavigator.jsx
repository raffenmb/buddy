import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getServerUrl } from '../lib/storage';

import ServerSetupScreen from '../screens/ServerSetupScreen';
import LoginScreen from '../screens/LoginScreen';
import MainScreen from '../screens/MainScreen';
import AdminDashboardScreen from '../screens/AdminDashboardScreen';
import AgentEditorScreen from '../screens/AgentEditorScreen';
import ToolSelectorScreen from '../screens/ToolSelectorScreen';
import UserListScreen from '../screens/UserListScreen';

const Stack = createStackNavigator();

function RootNavigator() {
  const { user, loading: authLoading } = useAuth();
  const [hasServer, setHasServer] = useState(null);

  useEffect(() => {
    getServerUrl().then(url => setHasServer(!!url));
  }, []);

  if (hasServer === null || authLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  const initialRoute = !hasServer ? 'ServerSetup' : !user ? 'Login' : 'Main';

  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName={initialRoute}
    >
      <Stack.Screen name="ServerSetup" component={ServerSetupScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Main" component={MainScreen} />
      <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
      <Stack.Screen name="AgentEditor" component={AgentEditorScreen} />
      <Stack.Screen name="ToolSelector" component={ToolSelectorScreen} />
      <Stack.Screen name="UserList" component={UserListScreen} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <RootNavigator />
    </NavigationContainer>
  );
}
