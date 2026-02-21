# React Native Mobile App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a React Native mobile app with full web client parity, structured as a monorepo with shared logic.

**Architecture:** Monorepo with three packages — `shared/` (platform-agnostic reducer, API client, command router), `mobile/` (Expo React Native app), and existing `client/` (updated to import from shared). Mobile connects to the Buddy server via Tailscale IP.

**Tech Stack:** Expo (managed), React Navigation (stack), NativeWind, expo-av, expo-speech, expo-notifications, victory-native, AsyncStorage

**Testing:** No automated test framework. Each task includes manual verification steps with exact expected behavior.

**Design doc:** `docs/plans/2026-02-21-react-native-mobile-app-design.md`

---

## Phase 1: Monorepo + Shared Package (Tasks 1-3)

### Task 1: Set Up npm Workspaces

**Files:**
- Modify: `package.json` (root)
- Create: `shared/package.json`

**Step 1: Update root package.json for workspaces**

Replace the root `package.json` with:

```json
{
  "name": "buddy",
  "private": true,
  "workspaces": [
    "client",
    "server",
    "shared",
    "mobile"
  ],
  "scripts": {
    "dev:server": "cd server && node index.js",
    "dev:client": "cd client && npm run dev",
    "dev:mobile": "cd mobile && npx expo start",
    "install:all": "npm install",
    "build": "cd client && npm run build",
    "start": "cd server && NODE_ENV=production node index.js"
  }
}
```

Note: `install:all` simplifies to just `npm install` since workspaces handle cross-package installs.

**Step 2: Create shared/package.json**

```json
{
  "name": "@buddy/shared",
  "version": "1.0.0",
  "private": true,
  "main": "index.js",
  "type": "module"
}
```

**Step 3: Create shared/index.js barrel export**

```js
export { buddyReducer, initialState } from './state/reducer.js';
export { COMMAND_MAP } from './lib/commandRouter.js';
export { apiFetch } from './api/client.js';
export { WS_MESSAGE_TYPES } from './ws/messageTypes.js';
```

**Step 4: Verify**

Run: `npm install` from root
Expected: No errors. `node_modules` created at root with symlinks to workspaces.

**Step 5: Commit**

```bash
git add package.json shared/
git commit -m "feat: set up npm workspaces with shared package"
```

---

### Task 2: Extract Shared Logic from Web Client

**Files:**
- Create: `shared/state/reducer.js`
- Create: `shared/state/initialState.js`
- Create: `shared/lib/commandRouter.js`
- Create: `shared/api/client.js`
- Create: `shared/ws/messageTypes.js`
- Reference: `client/src/context/BuddyState.jsx` (source for reducer)
- Reference: `client/src/lib/commandRouter.js` (source for command map)
- Reference: `client/src/lib/api.js` (source for API client)

**Step 1: Extract initialState to shared/state/initialState.js**

Extract the `initialState` object from `client/src/context/BuddyState.jsx`. Remove any DOM-specific references. The initial state is pure data — no platform dependencies.

```js
export const initialState = {
  avatar: { isTalking: false },
  subtitle: { text: '', visible: false },
  canvas: {
    mode: 'ambient',
    layout: 'single',
    theme: null,
    elements: [],
    notification: null,
  },
  input: { isProcessing: false },
  connection: { isConnected: false },
  agent: { id: null, name: null, avatarId: null },
  adminScreen: null,
};
```

**Step 2: Extract reducer to shared/state/reducer.js**

Extract the `buddyReducer` function from `client/src/context/BuddyState.jsx`. This is pure logic — switch/case on action types, returns new state. Include the element ID deduplication logic.

Import `initialState` from `./initialState.js`.

```js
import { initialState } from './initialState.js';

export { initialState };

export function buddyReducer(state, action) {
  // Copy the full switch/case from BuddyState.jsx
  // This is pure state logic — no DOM, no React, no platform APIs
  switch (action.type) {
    // ... all cases from BuddyState.jsx
  }
}
```

**Step 3: Extract command router to shared/lib/commandRouter.js**

Copy `client/src/lib/commandRouter.js` to `shared/lib/commandRouter.js`. This is already a pure JS object mapping command names to action types.

```js
export const COMMAND_MAP = {
  canvas_set_mode: 'CANVAS_SET_MODE',
  canvas_add_card: 'CANVAS_ADD_CARD',
  // ... rest of mappings
};
```

**Step 4: Extract API client to shared/api/client.js**

Adapt `client/src/lib/api.js` to accept `baseUrl` and `getToken` as parameters instead of reading from `window.location` and `localStorage` directly. This makes it platform-agnostic.

```js
export function createApiClient({ baseUrl, getToken, onUnauthorized }) {
  return async function apiFetch(path, options = {}) {
    const token = await getToken();
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    return res.json();
  };
}
```

**Step 5: Create WS message types at shared/ws/messageTypes.js**

```js
export const WS_MESSAGE_TYPES = {
  // Server → Client
  SUBTITLE: 'subtitle',
  CANVAS_COMMAND: 'canvas_command',
  PROCESSING: 'processing',
  AGENT_SWITCH: 'agent_switch',
  CANVAS_REHYDRATE: 'canvas_rehydrate',
  TTS_START: 'tts_start',
  TTS_END: 'tts_end',
  TTS_FALLBACK: 'tts_fallback',
  // Client → Server
  CONFIRM_RESPONSE: 'confirm_response',
  FORM_RESPONSE: 'form_response',
  CANVAS_ELEMENT_UPDATE: 'canvas_element_update',
  FILE_UPLOAD: 'file_upload',
};
```

**Step 6: Update shared/index.js barrel export**

Ensure all exports are correct and the file matches what was created in Task 1 Step 3.

**Step 7: Verify**

Run from root: `node -e "import('@buddy/shared').then(m => console.log(Object.keys(m)))"`
Expected: Prints array of export names.

**Step 8: Commit**

```bash
git add shared/
git commit -m "feat: extract shared logic (reducer, API client, command router, WS types)"
```

---

### Task 3: Update Web Client to Import from Shared

**Files:**
- Modify: `client/src/context/BuddyState.jsx`
- Modify: `client/src/lib/commandRouter.js`
- Modify: `client/src/lib/api.js`
- Modify: `client/package.json` (add shared dependency)

**Step 1: Add shared dependency to client/package.json**

Add to dependencies: `"@buddy/shared": "*"`

Run `npm install` from root.

**Step 2: Update BuddyState.jsx to import reducer from shared**

Replace the local reducer and initialState with imports from `@buddy/shared`. Keep the React Context provider, useReducer, and wsRef — those are platform-specific (React DOM).

```js
import { buddyReducer, initialState } from '@buddy/shared';
// Remove the local reducer function and initialState object
// Keep: BuddyContext, BuddyProvider, useBuddy
```

**Step 3: Update commandRouter.js to re-export from shared**

```js
export { COMMAND_MAP } from '@buddy/shared';
```

Or update the import site in `useWebSocket.js` to import directly from `@buddy/shared`.

**Step 4: Update api.js to use shared createApiClient**

```js
import { createApiClient } from '@buddy/shared';

const apiFetch = createApiClient({
  baseUrl: '',  // Vite proxy handles /api
  getToken: () => localStorage.getItem('buddy_token'),
  onUnauthorized: () => {
    localStorage.removeItem('buddy_token');
    window.location.reload();
  },
});

export default apiFetch;
```

**Step 5: Verify web client still works**

Run: `cd client && npm run dev`
Open browser, log in, send a message, verify canvas renders, TTS plays.
Expected: Identical behavior to before the refactor.

**Step 6: Commit**

```bash
git add client/ shared/
git commit -m "refactor: update web client to import from shared package"
```

---

## Phase 2: Expo Project Scaffold (Tasks 4-6)

### Task 4: Initialize Expo Project

**Step 1: Create Expo project**

```bash
cd mobile
npx create-expo-app@latest . --template blank
```

If the directory already exists and is empty, this works. Otherwise create in a temp dir and move.

**Step 2: Update mobile/package.json**

Ensure the name is `@buddy/mobile` and add the shared dependency:

```json
{
  "name": "@buddy/mobile",
  "dependencies": {
    "@buddy/shared": "*"
  }
}
```

**Step 3: Run npm install from root**

```bash
cd .. && npm install
```

**Step 4: Verify Expo starts**

```bash
cd mobile && npx expo start
```

Expected: Metro bundler starts, shows QR code and menu options. Press `a` for Android emulator if configured.

**Step 5: Commit**

```bash
git add mobile/ package.json
git commit -m "feat: initialize Expo project in mobile/"
```

---

### Task 5: Install Mobile Dependencies

**Step 1: Install all required packages**

```bash
cd mobile
npx expo install expo-av expo-speech expo-font expo-notifications expo-device expo-constants @react-native-async-storage/async-storage react-native-safe-area-context react-native-screens react-native-gesture-handler
npm install @react-navigation/native @react-navigation/stack victory-native react-native-youtube-iframe react-native-markdown-display react-native-webview react-native-svg
npm install nativewind tailwindcss
```

**Step 2: Verify no install errors**

Expected: All packages install successfully. Check for peer dependency warnings but they're usually non-blocking with Expo.

**Step 3: Commit**

```bash
git add mobile/package.json mobile/package-lock.json
git commit -m "feat: install mobile dependencies"
```

---

### Task 6: Configure NativeWind + Tailwind

**Files:**
- Create: `mobile/tailwind.config.js`
- Create: `mobile/global.css`
- Modify: `mobile/babel.config.js`
- Modify: `mobile/metro.config.js` (create if needed)

**Step 1: Create tailwind.config.js**

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx}', './src/**/*.{js,jsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

**Step 2: Create global.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Step 3: Update babel.config.js**

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
```

**Step 4: Create metro.config.js**

```js
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
```

**Step 5: Update App.jsx to import global.css**

Add at the top of `mobile/App.jsx`:

```js
import './global.css';
```

**Step 6: Verify NativeWind works**

Add a test `<Text className="text-red-500 text-2xl">NativeWind works!</Text>` to App.jsx.
Run: `npx expo start`, open in emulator.
Expected: Red text saying "NativeWind works!"

Remove the test text after verifying.

**Step 7: Commit**

```bash
git add mobile/
git commit -m "feat: configure NativeWind + Tailwind for mobile"
```

---

## Phase 3: Core Infrastructure (Tasks 7-11)

### Task 7: Theme System

**Files:**
- Create: `mobile/src/theme/colors.js`
- Create: `mobile/src/theme/ThemeProvider.jsx`

**Step 1: Create color tokens**

Define light/dark color tokens matching the web client's CSS custom properties in `client/src/index.css`.

```js
// mobile/src/theme/colors.js
export const lightColors = {
  bgBase: '#faf9f7',
  bgSurface: '#ffffff',
  bgRaised: '#f5f3f0',
  textPrimary: '#2d2d2d',
  textSecondary: '#5a5a5a',
  textMuted: '#8a8a8a',
  accent: '#7c6bff',
  secondary: '#4ade80',
  tertiary: '#f59e0b',
  border: '#e8e5e0',
  shadowCard: 'rgba(0,0,0,0.06)',
  shadowElevated: 'rgba(0,0,0,0.12)',
};

export const darkColors = {
  bgBase: '#1a1a2e',
  bgSurface: '#25253e',
  bgRaised: '#2d2d4a',
  textPrimary: '#e8e8e8',
  textSecondary: '#a8a8b8',
  textMuted: '#6a6a7a',
  accent: '#9d8fff',
  secondary: '#4ade80',
  tertiary: '#f59e0b',
  border: '#3a3a5a',
  shadowCard: 'rgba(0,0,0,0.2)',
  shadowElevated: 'rgba(0,0,0,0.4)',
};
```

Cross-reference exact hex values with `client/src/index.css` to ensure parity.

**Step 2: Create ThemeProvider**

```jsx
// mobile/src/theme/ThemeProvider.jsx
import { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors } from './colors';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('buddy-theme').then(val => {
      if (val === 'dark') setIsDark(true);
    });
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    AsyncStorage.setItem('buddy-theme', next ? 'dark' : 'light');
  };

  const colors = isDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ colors, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
```

**Step 3: Verify**

Wrap App.jsx in ThemeProvider. Render a `<View>` with `style={{ backgroundColor: colors.bgBase }}` and a `<Text>` with `style={{ color: colors.textPrimary }}` using `useTheme()`.
Expected: Light theme colors visible. No crashes.

**Step 4: Commit**

```bash
git add mobile/src/theme/
git commit -m "feat: add theme system with light/dark color tokens"
```

---

### Task 8: AsyncStorage Utilities + Server URL

**Files:**
- Create: `mobile/src/lib/storage.js`

**Step 1: Create storage helper**

```js
// mobile/src/lib/storage.js
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  TOKEN: 'buddy_token',
  THEME: 'buddy-theme',
  SERVER_URL: 'buddy_server_url',
};

export async function getToken() {
  return AsyncStorage.getItem(KEYS.TOKEN);
}

export async function setToken(token) {
  return AsyncStorage.setItem(KEYS.TOKEN, token);
}

export async function removeToken() {
  return AsyncStorage.removeItem(KEYS.TOKEN);
}

export async function getServerUrl() {
  return AsyncStorage.getItem(KEYS.SERVER_URL);
}

export async function setServerUrl(url) {
  // Normalize: remove trailing slash
  const normalized = url.replace(/\/+$/, '');
  return AsyncStorage.setItem(KEYS.SERVER_URL, normalized);
}

export { KEYS };
```

**Step 2: Commit**

```bash
git add mobile/src/lib/
git commit -m "feat: add AsyncStorage utility module"
```

---

### Task 9: Navigation Structure

**Files:**
- Create: `mobile/src/navigation/AppNavigator.jsx`
- Modify: `mobile/App.jsx`

**Step 1: Create AppNavigator**

```jsx
// mobile/src/navigation/AppNavigator.jsx
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer } from '@react-navigation/native';

// Screens will be created in later tasks — use placeholder components for now
import ServerSetupScreen from '../screens/ServerSetupScreen';
import LoginScreen from '../screens/LoginScreen';
import MainScreen from '../screens/MainScreen';
import AdminDashboardScreen from '../screens/AdminDashboardScreen';
import AgentEditorScreen from '../screens/AgentEditorScreen';
import ToolSelectorScreen from '../screens/ToolSelectorScreen';
import UserListScreen from '../screens/UserListScreen';

const Stack = createStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="ServerSetup" component={ServerSetupScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Main" component={MainScreen} />
        <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
        <Stack.Screen name="AgentEditor" component={AgentEditorScreen} />
        <Stack.Screen name="ToolSelector" component={ToolSelectorScreen} />
        <Stack.Screen name="UserList" component={UserListScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

**Step 2: Create placeholder screens**

Create minimal placeholder for each screen file in `mobile/src/screens/`:
- `ServerSetupScreen.jsx`
- `LoginScreen.jsx`
- `MainScreen.jsx`
- `AdminDashboardScreen.jsx`
- `AgentEditorScreen.jsx`
- `ToolSelectorScreen.jsx`
- `UserListScreen.jsx`

Each placeholder:
```jsx
import { View, Text } from 'react-native';
export default function ScreenName() {
  return <View className="flex-1 items-center justify-center"><Text>ScreenName</Text></View>;
}
```

**Step 3: Update App.jsx**

```jsx
import './global.css';
import { ThemeProvider } from './src/theme/ThemeProvider';
import AppNavigator from './src/navigation/AppNavigator';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppNavigator />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
```

**Step 4: Verify**

Run: `npx expo start`, open in emulator.
Expected: See "ServerSetupScreen" text centered on screen.

**Step 5: Commit**

```bash
git add mobile/
git commit -m "feat: add React Navigation stack with placeholder screens"
```

---

### Task 10: Auth Context

**Files:**
- Create: `mobile/src/context/AuthContext.jsx`
- Create: `mobile/src/lib/api.js`

**Step 1: Create mobile API client**

Uses the shared `createApiClient` with mobile-specific storage:

```js
// mobile/src/lib/api.js
import { createApiClient } from '@buddy/shared';
import { getToken, getServerUrl, removeToken } from './storage';

let _apiFetch = null;
let _currentBaseUrl = null;

export async function initApi() {
  const baseUrl = await getServerUrl();
  if (!baseUrl) return null;
  _currentBaseUrl = baseUrl;
  _apiFetch = createApiClient({
    baseUrl,
    getToken,
    onUnauthorized: () => removeToken(),
  });
  return _apiFetch;
}

export function getApi() {
  return _apiFetch;
}

export function getBaseUrl() {
  return _currentBaseUrl;
}
```

**Step 2: Create AuthContext**

```jsx
// mobile/src/context/AuthContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getToken, setToken, removeToken } from '../lib/storage';
import { initApi, getApi } from '../lib/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const api = await initApi();
      const token = await getToken();
      if (api && token) {
        try {
          const data = await api('/api/auth/me');
          setUser(data);
        } catch {
          await removeToken();
        }
      }
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async (username, password) => {
    const api = getApi();
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    await setToken(data.token);
    // Re-init API with new token
    await initApi();
    setUser(data.user || data);
    return data;
  }, []);

  const logout = useCallback(async () => {
    await removeToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

**Step 3: Commit**

```bash
git add mobile/src/
git commit -m "feat: add mobile auth context and API client"
```

---

### Task 11: ServerSetup + Login Screens

**Files:**
- Modify: `mobile/src/screens/ServerSetupScreen.jsx`
- Modify: `mobile/src/screens/LoginScreen.jsx`
- Modify: `mobile/src/navigation/AppNavigator.jsx`
- Modify: `mobile/App.jsx`

**Step 1: Build ServerSetupScreen**

```jsx
// mobile/src/screens/ServerSetupScreen.jsx
import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { setServerUrl, getServerUrl } from '../lib/storage';
import { initApi } from '../lib/api';

export default function ServerSetupScreen({ navigation }) {
  const { colors } = useTheme();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);

  const handleConnect = async () => {
    if (!url.trim()) return;
    setTesting(true);
    setError('');
    try {
      await setServerUrl(url.trim());
      const api = await initApi();
      // Test connection by hitting a known endpoint
      await api('/api/tts/status');
      navigation.replace('Login');
    } catch (e) {
      setError('Cannot reach server. Check the URL and try again.');
    }
    setTesting(false);
  };

  return (
    <View className="flex-1 justify-center p-8" style={{ backgroundColor: colors.bgBase }}>
      <Text className="text-2xl font-bold mb-2" style={{ color: colors.textPrimary }}>
        Connect to Buddy
      </Text>
      <Text className="mb-6" style={{ color: colors.textSecondary }}>
        Enter your Buddy server URL (Tailscale IP)
      </Text>
      <TextInput
        className="rounded-xl p-4 mb-4"
        style={{ backgroundColor: colors.bgSurface, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border }}
        placeholder="http://100.x.y.z:3001"
        placeholderTextColor={colors.textMuted}
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      {error ? <Text className="mb-4" style={{ color: '#ef4444' }}>{error}</Text> : null}
      <Pressable
        className="rounded-xl p-4 items-center"
        style={{ backgroundColor: colors.accent, opacity: testing ? 0.6 : 1 }}
        onPress={handleConnect}
        disabled={testing}
      >
        {testing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white font-semibold">Connect</Text>
        )}
      </Pressable>
    </View>
  );
}
```

**Step 2: Build LoginScreen**

Model after `client/src/components/Login.jsx`:

```jsx
// mobile/src/screens/LoginScreen.jsx
import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen({ navigation }) {
  const { colors } = useTheme();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) return;
    setLoading(true);
    setError('');
    try {
      await login(username.trim(), password);
      navigation.replace('Main');
    } catch (e) {
      setError('Invalid username or password');
    }
    setLoading(false);
  };

  return (
    <View className="flex-1 justify-center p-8" style={{ backgroundColor: colors.bgBase }}>
      <Text className="text-2xl font-bold mb-6" style={{ color: colors.textPrimary }}>
        Sign in to Buddy
      </Text>
      <TextInput
        className="rounded-xl p-4 mb-4"
        style={{ backgroundColor: colors.bgSurface, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border }}
        placeholder="Username"
        placeholderTextColor={colors.textMuted}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TextInput
        className="rounded-xl p-4 mb-4"
        style={{ backgroundColor: colors.bgSurface, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border }}
        placeholder="Password"
        placeholderTextColor={colors.textMuted}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      {error ? <Text className="mb-4" style={{ color: '#ef4444' }}>{error}</Text> : null}
      <Pressable
        className="rounded-xl p-4 items-center"
        style={{ backgroundColor: colors.accent, opacity: loading ? 0.6 : 1 }}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white font-semibold">Sign In</Text>
        )}
      </Pressable>
    </View>
  );
}
```

**Step 3: Update AppNavigator with auth-gated routing**

The navigator should check: (1) server URL exists? → if not, ServerSetup. (2) token valid? → if not, Login. (3) else → Main.

```jsx
// Update AppNavigator to wrap in AuthProvider and gate screens
import { useAuth } from '../context/AuthContext';
import { useEffect, useState } from 'react';
import { getServerUrl } from '../lib/storage';
import { ActivityIndicator, View } from 'react-native';

function RootNavigator() {
  const { user, loading: authLoading } = useAuth();
  const [hasServer, setHasServer] = useState(null);

  useEffect(() => {
    getServerUrl().then(url => setHasServer(!!url));
  }, []);

  if (hasServer === null || authLoading) {
    return <View className="flex-1 items-center justify-center"><ActivityIndicator /></View>;
  }

  const initialRoute = !hasServer ? 'ServerSetup' : !user ? 'Login' : 'Main';

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRoute}>
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
```

**Step 4: Update App.jsx to wrap with AuthProvider**

```jsx
import { AuthProvider } from './src/context/AuthContext';
// Wrap inside ThemeProvider:
<AuthProvider>
  <AppNavigator />
</AuthProvider>
```

**Step 5: Verify**

Run in emulator:
1. First launch → see ServerSetup screen
2. Enter server URL → navigates to Login
3. Enter credentials → navigates to Main (placeholder)
Expected: Full auth flow works end-to-end.

**Step 6: Commit**

```bash
git add mobile/
git commit -m "feat: add ServerSetup and Login screens with auth flow"
```

---

## Phase 4: Main Chat Screen (Tasks 12-17)

### Task 12: BuddyProvider (Mobile Context)

**Files:**
- Create: `mobile/src/context/BuddyProvider.jsx`

**Step 1: Create mobile BuddyProvider**

Wraps the shared reducer with mobile-specific React Context and wsRef:

```jsx
// mobile/src/context/BuddyProvider.jsx
import { createContext, useContext, useReducer, useRef } from 'react';
import { buddyReducer, initialState } from '@buddy/shared';

const BuddyContext = createContext();

export function BuddyProvider({ children }) {
  const [state, dispatch] = useReducer(buddyReducer, initialState);
  const wsRef = useRef(null);

  return (
    <BuddyContext.Provider value={{ state, dispatch, wsRef }}>
      {children}
    </BuddyContext.Provider>
  );
}

export const useBuddy = () => useContext(BuddyContext);
```

**Step 2: Commit**

```bash
git add mobile/src/context/
git commit -m "feat: add mobile BuddyProvider using shared reducer"
```

---

### Task 13: WebSocket Hook (Mobile)

**Files:**
- Create: `mobile/src/hooks/useWebSocket.js`
- Reference: `client/src/hooks/useWebSocket.js`

**Step 1: Create mobile useWebSocket**

Adapt the web hook. Key differences: uses `getToken()` + `getBaseUrl()` from storage/api, handles AppState for backgrounding, dispatches to shared reducer via the same action types.

```jsx
// mobile/src/hooks/useWebSocket.js
import { useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import { useBuddy } from '../context/BuddyProvider';
import { getToken } from '../lib/storage';
import { getBaseUrl } from '../lib/api';
import { COMMAND_MAP } from '@buddy/shared';

export default function useWebSocket() {
  const { dispatch, wsRef } = useBuddy();
  const reconnectTimer = useRef(null);
  const reconnectDelay = useRef(1000);
  const appState = useRef(AppState.currentState);

  const connect = useCallback(async () => {
    const token = await getToken();
    const baseUrl = getBaseUrl();
    if (!token || !baseUrl) return;

    const wsUrl = baseUrl.replace(/^http/, 'ws') + '?token=' + token;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      dispatch({ type: 'SET_CONNECTED', connected: true });
      reconnectDelay.current = 1000;
    };

    ws.onmessage = (event) => {
      // Binary data = TTS audio chunk
      if (typeof event.data !== 'string') {
        // Emit custom event for audio player hook
        // Store in a ref or event emitter for useAudioPlayer
        if (wsRef.current?.onAudioChunk) {
          wsRef.current.onAudioChunk(event.data);
        }
        return;
      }

      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case 'subtitle':
          dispatch({ type: 'SET_SUBTITLE', text: msg.text });
          if (wsRef.current?.onSubtitle) wsRef.current.onSubtitle(msg.text);
          break;
        case 'canvas_command': {
          const actionType = COMMAND_MAP[msg.command];
          if (actionType) dispatch({ type: actionType, ...msg.params });
          break;
        }
        case 'processing':
          dispatch({ type: 'SET_PROCESSING', isProcessing: msg.status });
          break;
        case 'agent_switch':
          dispatch({ type: 'SET_AGENT', ...msg.agent });
          if (msg.canvas) dispatch({ type: 'CANVAS_REHYDRATE', elements: msg.canvas });
          break;
        case 'canvas_rehydrate':
          dispatch({ type: 'CANVAS_REHYDRATE', elements: msg.elements });
          break;
        case 'tts_start':
          if (wsRef.current?.onTtsStart) wsRef.current.onTtsStart();
          break;
        case 'tts_end':
          if (wsRef.current?.onTtsEnd) wsRef.current.onTtsEnd();
          break;
        case 'tts_fallback':
          if (wsRef.current?.onTtsFallback) wsRef.current.onTtsFallback(msg.text);
          break;
      }
    };

    ws.onclose = () => {
      dispatch({ type: 'SET_CONNECTED', connected: false });
      // Only reconnect if app is in foreground
      if (appState.current === 'active') {
        reconnectTimer.current = setTimeout(() => {
          reconnectDelay.current = Math.min(reconnectDelay.current * 2, 10000);
          connect();
        }, reconnectDelay.current);
      }
    };

    ws.onerror = () => ws.close();

    wsRef.current = { ...wsRef.current, ws };
  }, [dispatch, wsRef]);

  // Handle app state changes (background/foreground)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        connect(); // Reconnect on foreground
      } else if (nextState.match(/inactive|background/)) {
        wsRef.current?.ws?.close(); // Close on background
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [connect, wsRef]);

  // Initial connect
  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.ws?.close();
    };
  }, [connect]);

  // Send helper
  const send = useCallback((data) => {
    const ws = wsRef.current?.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }, [wsRef]);

  return { send };
}
```

**Step 2: Verify**

Add `useWebSocket()` to MainScreen. Check emulator logs for WS connection.
Expected: `SET_CONNECTED` dispatched on successful connection.

**Step 3: Commit**

```bash
git add mobile/src/hooks/
git commit -m "feat: add mobile WebSocket hook with AppState handling"
```

---

### Task 14: TopBar Component

**Files:**
- Create: `mobile/src/components/TopBar.jsx`
- Reference: `client/src/components/TopBar.jsx`

**Step 1: Create TopBar**

Mobile version of the web TopBar. Shows agent name, connection dot, theme toggle, gear button. Agent picker is a scrollable list instead of a dropdown.

```jsx
// mobile/src/components/TopBar.jsx
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { useBuddy } from '../context/BuddyProvider';
import { useNavigation } from '@react-navigation/native';

export default function TopBar() {
  const insets = useSafeAreaInsets();
  const { colors, isDark, toggleTheme } = useTheme();
  const { state } = useBuddy();
  const navigation = useNavigation();

  return (
    <View
      className="flex-row items-center justify-between px-4 pb-2"
      style={{ paddingTop: insets.top + 8, backgroundColor: colors.bgBase }}
    >
      <View className="flex-row items-center gap-2">
        <View
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: state.connection.isConnected ? colors.secondary : '#ef4444' }}
        />
        <Text className="text-lg font-semibold" style={{ color: colors.textPrimary }}>
          {state.agent.name || 'Buddy'}
        </Text>
      </View>
      <View className="flex-row items-center gap-4">
        <Pressable onPress={toggleTheme}>
          <Text style={{ color: colors.textSecondary, fontSize: 20 }}>
            {isDark ? '☀️' : '🌙'}
          </Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('AdminDashboard')}>
          <Text style={{ color: colors.textSecondary, fontSize: 20 }}>⚙️</Text>
        </Pressable>
      </View>
    </View>
  );
}
```

Note: This is a starting point. The agent picker dropdown (tap agent name to see list) can be added as a modal in a follow-up refinement. For now, agent switching happens in the admin panel.

**Step 2: Commit**

```bash
git add mobile/src/components/
git commit -m "feat: add mobile TopBar component"
```

---

### Task 15: Avatar + Subtitle Component

**Files:**
- Create: `mobile/src/components/Avatar.jsx`
- Copy avatar SVGs to: `mobile/assets/avatars/`
- Reference: `client/src/components/Avatar.jsx`

**Step 1: Copy avatar assets**

Copy SVG files from `client/src/assets/avatars/` to `mobile/assets/avatars/`. For React Native, SVGs need `react-native-svg` — or convert to PNG. Simplest approach: use PNG exports of the SVGs, or use `react-native-svg-transformer`.

Alternative: install `react-native-svg-transformer` to use SVGs directly:

```bash
cd mobile && npm install react-native-svg-transformer
```

Update `metro.config.js` to handle SVG imports (append to existing config).

**Step 2: Create avatar presets**

```js
// mobile/src/assets/avatarPresets.js
// Import SVGs or PNGs for each avatar
import BuddyIdle from '../../assets/avatars/buddy-idle.svg';
import BuddyTalking from '../../assets/avatars/buddy-talking.svg';
import RobotIdle from '../../assets/avatars/robot-idle.svg';
import RobotTalking from '../../assets/avatars/robot-talking.svg';
import OwlIdle from '../../assets/avatars/owl-idle.svg';
import OwlTalking from '../../assets/avatars/owl-talking.svg';

export const AVATAR_PRESETS = {
  buddy: { idle: BuddyIdle, talking: BuddyTalking, label: 'Buddy' },
  robot: { idle: RobotIdle, talking: RobotTalking, label: 'Robot' },
  owl: { idle: OwlIdle, talking: OwlTalking, label: 'Owl' },
};
```

**Step 3: Create Avatar component**

```jsx
// mobile/src/components/Avatar.jsx
import { useEffect, useRef, useState } from 'react';
import { View, Text, Animated } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useBuddy } from '../context/BuddyProvider';
import { AVATAR_PRESETS } from '../assets/avatarPresets';

const AVATAR_SIZE = 48; // Scaled down from web

export default function Avatar() {
  const { colors } = useTheme();
  const { state } = useBuddy();
  const { isTalking } = state.avatar;
  const { text, visible } = state.subtitle;
  const { isProcessing } = state.input;

  const [mouthOpen, setMouthOpen] = useState(false);
  const bobAnim = useRef(new Animated.Value(0)).current;

  // Mouth toggle while talking
  useEffect(() => {
    if (!isTalking) { setMouthOpen(false); return; }
    const interval = setInterval(() => setMouthOpen(o => !o), 150);
    return () => clearInterval(interval);
  }, [isTalking]);

  // Bob animation (continuous sine wave)
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bobAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(bobAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [bobAnim]);

  const translateY = bobAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -4],
  });

  const avatarId = state.agent.avatarId || 'buddy';
  const preset = AVATAR_PRESETS[avatarId] || AVATAR_PRESETS.buddy;
  const AvatarSvg = mouthOpen ? preset.talking : preset.idle;

  const subtitleText = isProcessing ? '...' : (visible ? text : '');

  return (
    <View className="flex-row items-center gap-3 px-4 py-2">
      <Animated.View style={{ transform: [{ translateY }] }}>
        <AvatarSvg width={AVATAR_SIZE} height={AVATAR_SIZE} />
      </Animated.View>
      {subtitleText ? (
        <Text
          className="flex-1 text-sm"
          style={{ color: colors.textPrimary }}
          numberOfLines={3}
        >
          {subtitleText}
        </Text>
      ) : null}
    </View>
  );
}
```

**Step 4: Verify**

Add Avatar to MainScreen. Should see avatar image with bob animation.
Expected: Avatar renders, bobs gently, subtitle area shows when text is present.

**Step 5: Commit**

```bash
git add mobile/
git commit -m "feat: add mobile Avatar component with mouth animation and bob"
```

---

### Task 16: InputBar Component

**Files:**
- Create: `mobile/src/components/InputBar.jsx`
- Reference: `client/src/components/InputBar.jsx`

**Step 1: Create InputBar**

```jsx
// mobile/src/components/InputBar.jsx
import { useState, useRef } from 'react';
import { View, TextInput, Pressable, Text, KeyboardAvoidingView, Platform } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useBuddy } from '../context/BuddyProvider';
import { getApi } from '../lib/api';

export default function InputBar() {
  const { colors } = useTheme();
  const { state, dispatch } = useBuddy();
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  const handleSend = async () => {
    const prompt = text.trim();
    if (!prompt || state.input.isProcessing) return;
    setText('');
    dispatch({ type: 'SET_PROCESSING', isProcessing: true });
    dispatch({ type: 'CLEAR_SUBTITLE' });

    try {
      const api = getApi();
      await api('/api/prompt', {
        method: 'POST',
        body: { prompt, agent_id: state.agent.id },
      });
    } catch (e) {
      dispatch({ type: 'SET_PROCESSING', isProcessing: false });
    }
  };

  return (
    <View className="flex-row items-center gap-2 px-4 py-2" style={{ backgroundColor: colors.bgBase }}>
      <TextInput
        ref={inputRef}
        className="flex-1 rounded-full px-4 py-3"
        style={{
          backgroundColor: colors.bgSurface,
          color: colors.textPrimary,
          borderWidth: 1,
          borderColor: colors.border,
        }}
        placeholder="Ask Buddy..."
        placeholderTextColor={colors.textMuted}
        value={text}
        onChangeText={setText}
        onSubmitEditing={handleSend}
        returnKeyType="send"
        editable={!state.input.isProcessing}
        multiline={false}
      />
      <Pressable
        className="w-10 h-10 rounded-full items-center justify-center"
        style={{
          backgroundColor: text.trim() ? colors.accent : colors.bgRaised,
        }}
        onPress={handleSend}
        disabled={!text.trim() || state.input.isProcessing}
      >
        <Text style={{ color: text.trim() ? '#fff' : colors.textMuted }}>↑</Text>
      </Pressable>
    </View>
  );
}
```

**Step 2: Commit**

```bash
git add mobile/src/components/
git commit -m "feat: add mobile InputBar component"
```

---

### Task 17: Assemble MainScreen

**Files:**
- Modify: `mobile/src/screens/MainScreen.jsx`
- Create: `mobile/src/components/Canvas.jsx` (shell — elements in Phase 5)
- Create: `mobile/src/components/AlertModal.jsx`

**Step 1: Create Canvas shell**

A minimal scrollable container. Canvas elements will be added in Phase 5.

```jsx
// mobile/src/components/Canvas.jsx
import { ScrollView, View, Text } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useBuddy } from '../context/BuddyProvider';

export default function Canvas() {
  const { colors } = useTheme();
  const { state } = useBuddy();
  const { elements } = state.canvas;

  if (!elements.length) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text style={{ color: colors.textMuted }}>Send a message to get started</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 p-4" contentContainerStyle={{ gap: 12 }}>
      {elements.map((el) => (
        <View key={el.id} className="rounded-xl p-4" style={{ backgroundColor: colors.bgSurface }}>
          <Text style={{ color: colors.textPrimary }}>{el.type}: {el.title || el.id}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
```

**Step 2: Create AlertModal**

Port `client/src/components/AlertModal.jsx` for React Native:

```jsx
// mobile/src/components/AlertModal.jsx
import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

const AlertContext = createContext();

export function AlertProvider({ children }) {
  const [alert, setAlert] = useState(null);
  const resolveRef = useRef(null);

  const showAlert = useCallback((message) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setAlert({ message, isConfirm: false });
    });
  }, []);

  const showConfirm = useCallback((message) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setAlert({ message, isConfirm: true });
    });
  }, []);

  const handleOk = () => {
    resolveRef.current?.(true);
    setAlert(null);
  };

  const handleCancel = () => {
    resolveRef.current?.(false);
    setAlert(null);
  };

  return (
    <AlertContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {alert && <AlertOverlay alert={alert} onOk={handleOk} onCancel={handleCancel} />}
    </AlertContext.Provider>
  );
}

function AlertOverlay({ alert, onOk, onCancel }) {
  const { colors } = useTheme();
  return (
    <Modal transparent animationType="fade">
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View className="rounded-2xl p-6 mx-8" style={{ backgroundColor: colors.bgSurface, maxWidth: 320, width: '100%' }}>
          <Text className="text-base mb-6" style={{ color: colors.textPrimary }}>{alert.message}</Text>
          <View className="flex-row justify-end gap-3">
            {alert.isConfirm && (
              <Pressable className="rounded-lg px-4 py-2" style={{ backgroundColor: colors.bgRaised }} onPress={onCancel}>
                <Text style={{ color: colors.textSecondary }}>Cancel</Text>
              </Pressable>
            )}
            <Pressable className="rounded-lg px-4 py-2" style={{ backgroundColor: colors.accent }} onPress={onOk}>
              <Text style={{ color: '#fff' }}>OK</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export const useAlert = () => useContext(AlertContext);
```

**Step 3: Assemble MainScreen**

```jsx
// mobile/src/screens/MainScreen.jsx
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
```

**Step 4: Add AlertProvider to App.jsx**

Wrap the app with AlertProvider (inside ThemeProvider, outside AuthProvider).

**Step 5: Verify**

Run in emulator:
1. Launch app → ServerSetup → Login → Main screen
2. See TopBar with agent name, connection dot, gear icon
3. See empty canvas placeholder text
4. See avatar at bottom
5. Type a message, tap send → processing state activates
6. Server responds → subtitle appears, canvas elements show (as plain text for now)
Expected: Full chat loop works end-to-end.

**Step 6: Commit**

```bash
git add mobile/
git commit -m "feat: assemble MainScreen with TopBar, Canvas, Avatar, InputBar"
```

---

## Phase 5: Canvas Elements (Tasks 18-21)

### Task 18: Canvas Layout System + Element Router

**Files:**
- Modify: `mobile/src/components/Canvas.jsx`
- Create: `mobile/src/canvas-elements/index.js` (element router)

**Step 1: Create element component registry**

```js
// mobile/src/canvas-elements/index.js
import Card from './Card';
import TextBlock from './TextBlock';
import Chart from './Chart';
import DataTable from './DataTable';
import VideoPlayer from './VideoPlayer';
import Notification from './Notification';
import ActionConfirm from './ActionConfirm';
import FormInput from './FormInput';
import Checklist from './Checklist';
import ProgressBar from './ProgressBar';
import Timer from './Timer';

export const ELEMENT_COMPONENTS = {
  card: Card,
  text: TextBlock,
  chart: Chart,
  table: DataTable,
  media: VideoPlayer,
  notification: Notification,
  confirmation: ActionConfirm,
  form: FormInput,
  checklist: Checklist,
  progress: ProgressBar,
  timer: Timer,
};
```

**Step 2: Update Canvas.jsx with layout system**

Port the 5 layout modes from `client/src/components/Canvas.jsx` using flexbox:

```jsx
// mobile/src/components/Canvas.jsx
import { ScrollView, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useBuddy } from '../context/BuddyProvider';
import { ELEMENT_COMPONENTS } from '../canvas-elements';
import Notification from '../canvas-elements/Notification';

export default function Canvas() {
  const { colors } = useTheme();
  const { state } = useBuddy();
  const { elements, layout, notification } = state.canvas;

  const renderElement = (el) => {
    const Component = ELEMENT_COMPONENTS[el.type];
    if (!Component) return null;
    return <Component key={el.id} {...el} />;
  };

  // Separate interactive elements (confirmation, form) from content
  const interactive = elements.filter(el => el.type === 'confirmation' || el.type === 'form');
  const content = elements.filter(el => el.type !== 'confirmation' && el.type !== 'form');

  const layoutStyle = getLayoutStyle(layout);

  return (
    <View className="flex-1" style={{ position: 'relative' }}>
      <ScrollView className="flex-1 p-4" contentContainerStyle={layoutStyle}>
        {content.map(renderElement)}
      </ScrollView>
      {interactive.map(renderElement)}
      {notification && <Notification key={notification.id} {...notification} />}
    </View>
  );
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
    default: // 'single'
      return { gap: 12 };
  }
}
```

**Step 3: Commit**

```bash
git add mobile/src/
git commit -m "feat: add canvas layout system and element router"
```

---

### Task 19: Basic Canvas Elements (Card, TextBlock, DataTable, ProgressBar, Timer)

**Files:**
- Create: `mobile/src/canvas-elements/Card.jsx`
- Create: `mobile/src/canvas-elements/TextBlock.jsx`
- Create: `mobile/src/canvas-elements/DataTable.jsx`
- Create: `mobile/src/canvas-elements/ProgressBar.jsx`
- Create: `mobile/src/canvas-elements/Timer.jsx`
- Reference: `client/src/components/canvas-elements/` for all

**Step 1: Create Card**

Port from web. Uses `react-native-markdown-display` for body content.

```jsx
// mobile/src/canvas-elements/Card.jsx
import { View, Text } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useTheme } from '../theme/ThemeProvider';

export default function Card({ title, body, color, icon }) {
  const { colors } = useTheme();
  return (
    <View
      className="rounded-xl p-4"
      style={{
        backgroundColor: colors.bgSurface,
        borderLeftWidth: 4,
        borderLeftColor: color || colors.accent,
      }}
    >
      {title && (
        <View className="flex-row items-center gap-2 mb-2">
          {icon && <Text>{icon}</Text>}
          <Text className="font-semibold text-base" style={{ color: colors.textPrimary }}>{title}</Text>
        </View>
      )}
      {body && <Markdown style={markdownStyles(colors)}>{body}</Markdown>}
    </View>
  );
}

function markdownStyles(colors) {
  return {
    body: { color: colors.textPrimary, fontSize: 14 },
    code_inline: { backgroundColor: colors.bgRaised, color: colors.accent, paddingHorizontal: 4, borderRadius: 4 },
    fence: { backgroundColor: colors.bgRaised, padding: 12, borderRadius: 8 },
    link: { color: colors.accent },
  };
}
```

**Step 2: Create TextBlock, DataTable, ProgressBar, Timer**

Port each from web equivalents. Each uses `<View>` + `<Text>` with flexbox layout. Reference the web versions in `client/src/components/canvas-elements/` for exact props and rendering logic.

- **TextBlock**: style variants (document, note, code, quote) via conditional styles
- **DataTable**: flex rows with alternating background colors, column headers
- **ProgressBar**: `<View>` with inner `<View>` at percentage width, Animated API for smooth transitions
- **Timer**: `setInterval`-based countdown, formats as HH:MM:SS

**Step 3: Verify**

Send messages to Buddy that trigger card/text/table/progress responses.
Expected: Canvas elements render with correct styling.

**Step 4: Commit**

```bash
git add mobile/src/canvas-elements/
git commit -m "feat: add Card, TextBlock, DataTable, ProgressBar, Timer canvas elements"
```

---

### Task 20: Interactive Canvas Elements (ActionConfirm, FormInput, Checklist)

**Files:**
- Create: `mobile/src/canvas-elements/ActionConfirm.jsx`
- Create: `mobile/src/canvas-elements/FormInput.jsx`
- Create: `mobile/src/canvas-elements/Checklist.jsx`
- Reference: `client/src/components/canvas-elements/` for all

**Step 1: Create ActionConfirm**

Port from web. Sends `confirm_response` via WebSocket on Approve/Deny. Shows command, reason, and status.

```jsx
// mobile/src/canvas-elements/ActionConfirm.jsx
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useBuddy } from '../context/BuddyProvider';

export default function ActionConfirm({ id, command, reason }) {
  const { colors } = useTheme();
  const { wsRef } = useBuddy();
  const [status, setStatus] = useState('pending'); // pending | approved | denied

  const respond = (approved) => {
    const ws = wsRef.current?.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'confirm_response', id, approved }));
    }
    setStatus(approved ? 'approved' : 'denied');
  };

  return (
    <View className="rounded-xl p-4 mx-4 mb-4" style={{ backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: '#ef4444' }}>
      <Text className="font-semibold mb-2" style={{ color: colors.textPrimary }}>Confirm Action</Text>
      <View className="rounded-lg p-3 mb-2" style={{ backgroundColor: colors.bgRaised }}>
        <Text className="font-mono text-sm" style={{ color: colors.textPrimary }}>{command}</Text>
      </View>
      {reason && <Text className="mb-3" style={{ color: colors.textSecondary }}>{reason}</Text>}
      {status === 'pending' ? (
        <View className="flex-row gap-3">
          <Pressable className="flex-1 rounded-lg p-3 items-center" style={{ backgroundColor: '#ef4444' }} onPress={() => respond(false)}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Deny</Text>
          </Pressable>
          <Pressable className="flex-1 rounded-lg p-3 items-center" style={{ backgroundColor: colors.secondary }} onPress={() => respond(true)}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Approve</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={{ color: status === 'approved' ? colors.secondary : '#ef4444', fontWeight: '600' }}>
          {status === 'approved' ? 'Approved' : 'Denied'}
        </Text>
      )}
    </View>
  );
}
```

**Step 2: Create FormInput**

Port from web. Dynamic form fields (text, textarea, number, select, toggle). Sends `form_response` via WebSocket on submit.

Reference `client/src/components/canvas-elements/FormInput.jsx` for the exact field types and validation logic. Use `<TextInput>` for text/number/textarea, custom `<Pressable>` toggles for toggle fields, and a custom picker for select fields (list of `<Pressable>` options).

**Step 3: Create Checklist**

Port from web. Toggle items via `<Pressable>`. Sends silent `canvas_element_update` via WebSocket on toggle.

```jsx
// mobile/src/canvas-elements/Checklist.jsx
import { View, Text, Pressable } from 'react-native';
import { useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { useBuddy } from '../context/BuddyProvider';

export default function Checklist({ id, title, items: initialItems }) {
  const { colors } = useTheme();
  const { wsRef } = useBuddy();
  const [items, setItems] = useState(initialItems || []);

  const toggle = (index) => {
    const updated = items.map((item, i) =>
      i === index ? { ...item, checked: !item.checked } : item
    );
    setItems(updated);
    // Silent sync to server
    const ws = wsRef.current?.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'canvas_element_update',
        id,
        updates: { items: updated },
      }));
    }
  };

  return (
    <View className="rounded-xl p-4" style={{ backgroundColor: colors.bgSurface }}>
      {title && <Text className="font-semibold mb-3" style={{ color: colors.textPrimary }}>{title}</Text>}
      {items.map((item, i) => (
        <Pressable key={i} className="flex-row items-center gap-3 py-2" onPress={() => toggle(i)}>
          <View
            className="w-5 h-5 rounded items-center justify-center"
            style={{ backgroundColor: item.checked ? colors.accent : 'transparent', borderWidth: 2, borderColor: item.checked ? colors.accent : colors.border }}
          >
            {item.checked && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
          </View>
          <Text style={{ color: colors.textPrimary, textDecorationLine: item.checked ? 'line-through' : 'none' }}>
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
```

**Step 4: Verify**

Test with the Buddy server:
- Trigger a destructive command → ActionConfirm renders → Approve/Deny works
- Ask Buddy to show a form → FormInput renders → submit works
- Ask Buddy for a checklist → items toggle and sync silently
Expected: All interactive elements work bidirectionally.

**Step 5: Commit**

```bash
git add mobile/src/canvas-elements/
git commit -m "feat: add ActionConfirm, FormInput, Checklist interactive canvas elements"
```

---

### Task 21: Media Canvas Elements (Chart, VideoPlayer, Notification)

**Files:**
- Create: `mobile/src/canvas-elements/Chart.jsx`
- Create: `mobile/src/canvas-elements/VideoPlayer.jsx`
- Create: `mobile/src/canvas-elements/Notification.jsx`
- Reference: `client/src/components/canvas-elements/` for all

**Step 1: Create Chart**

Port from web. Use `victory-native` (same API as `victory` on web):

```jsx
// mobile/src/canvas-elements/Chart.jsx
import { View, Text } from 'react-native';
import { VictoryBar, VictoryLine, VictoryArea, VictoryPie, VictoryChart, VictoryAxis, VictoryTheme } from 'victory-native';
import { useTheme } from '../theme/ThemeProvider';

const CHART_COMPONENTS = {
  bar: VictoryBar,
  line: VictoryLine,
  area: VictoryArea,
  pie: VictoryPie,
};

export default function Chart({ title, chartType = 'bar', data, xKey = 'x', yKey = 'y' }) {
  const { colors } = useTheme();
  const ChartComponent = CHART_COMPONENTS[chartType];
  if (!ChartComponent || !data?.length) return null;

  const chartData = data.map(d => ({ x: d[xKey], y: d[yKey] }));

  if (chartType === 'pie') {
    return (
      <View className="rounded-xl p-4" style={{ backgroundColor: colors.bgSurface }}>
        {title && <Text className="font-semibold mb-2" style={{ color: colors.textPrimary }}>{title}</Text>}
        <VictoryPie data={chartData} colorScale="qualitative" />
      </View>
    );
  }

  return (
    <View className="rounded-xl p-4" style={{ backgroundColor: colors.bgSurface }}>
      {title && <Text className="font-semibold mb-2" style={{ color: colors.textPrimary }}>{title}</Text>}
      <VictoryChart theme={VictoryTheme.material}>
        <VictoryAxis style={{ tickLabels: { fill: colors.textSecondary, fontSize: 10 } }} />
        <VictoryAxis dependentAxis style={{ tickLabels: { fill: colors.textSecondary, fontSize: 10 } }} />
        <ChartComponent data={chartData} style={{ data: { fill: colors.accent } }} />
      </VictoryChart>
    </View>
  );
}
```

**Step 2: Create VideoPlayer**

Use `react-native-youtube-iframe` for YouTube, `expo-av` Video for direct video, `Image` for images. Reference `client/src/components/canvas-elements/VideoPlayer.jsx` for the URL parsing logic (YouTube URL detection).

**Step 3: Create Notification**

Toast overlay with auto-dismiss:

```jsx
// mobile/src/canvas-elements/Notification.jsx
import { useEffect, useState } from 'react';
import { View, Text, Animated } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useBuddy } from '../context/BuddyProvider';

const TYPE_COLORS = { info: '#3b82f6', success: '#22c55e', warning: '#f59e0b', error: '#ef4444' };

export default function Notification({ message, notificationType = 'info', duration_ms = 5000 }) {
  const { colors } = useTheme();
  const { dispatch } = useBuddy();
  const opacity = useState(new Animated.Value(0))[0];

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        dispatch({ type: 'CANVAS_DISMISS_NOTIFICATION' });
      });
    }, duration_ms);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View
      style={{ position: 'absolute', top: 12, left: 16, right: 16, opacity }}
      className="rounded-xl p-4"
    >
      <View style={{ backgroundColor: colors.bgSurface, borderLeftWidth: 4, borderLeftColor: TYPE_COLORS[notificationType], borderRadius: 12, padding: 16, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 }}>
        <Text style={{ color: colors.textPrimary }}>{message}</Text>
      </View>
    </Animated.View>
  );
}
```

**Step 4: Verify**

Ask Buddy to show a chart, play a YouTube video, and trigger a notification.
Expected: All render correctly.

**Step 5: Commit**

```bash
git add mobile/src/canvas-elements/
git commit -m "feat: add Chart, VideoPlayer, Notification canvas elements"
```

---

## Phase 6: Audio & TTS (Task 22)

### Task 22: Audio Player Hook

**Files:**
- Create: `mobile/src/hooks/useAudioPlayer.js`
- Reference: `client/src/hooks/useAudioPlayer.js`

**Step 1: Create mobile useAudioPlayer**

Uses `expo-av` for ElevenLabs MP3 playback and `expo-speech` for native fallback:

```jsx
// mobile/src/hooks/useAudioPlayer.js
import { useEffect, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system';
import { useBuddy } from '../context/BuddyProvider';

export default function useAudioPlayer() {
  const { dispatch, wsRef } = useBuddy();
  const chunksRef = useRef([]);
  const soundRef = useRef(null);
  const fallbackTimer = useRef(null);
  const isTtsActive = useRef(false);

  // Configure audio mode
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
    });
  }, []);

  const startTalking = useCallback(() => {
    dispatch({ type: 'SET_SUBTITLE', isTalking: true });
  }, [dispatch]);

  const stopTalking = useCallback(() => {
    dispatch({ type: 'STOP_TALKING' });
  }, [dispatch]);

  const cancelAudio = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    Speech.stop();
    stopTalking();
    chunksRef.current = [];
    isTtsActive.current = false;
    clearTimeout(fallbackTimer.current);
  }, [stopTalking]);

  // Play accumulated MP3 chunks via expo-av
  const playChunks = useCallback(async () => {
    if (!chunksRef.current.length) return;

    startTalking();

    // Merge chunks into one buffer
    const totalLength = chunksRef.current.reduce((sum, c) => sum + c.byteLength, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunksRef.current) {
      merged.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }
    chunksRef.current = [];

    // Write to temp file (expo-av needs a URI)
    const base64 = btoa(String.fromCharCode(...merged));
    const uri = FileSystem.cacheDirectory + 'tts-' + Date.now() + '.mp3';
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });

    // Play
    const { sound } = await Audio.Sound.createAsync({ uri });
    soundRef.current = sound;
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.didJustFinish) {
        stopTalking();
        sound.unloadAsync();
        soundRef.current = null;
      }
    });
    await sound.playAsync();
  }, [startTalking, stopTalking]);

  // Native TTS fallback
  const speakFallback = useCallback((text) => {
    if (!text) return;
    startTalking();
    Speech.speak(text, {
      onDone: stopTalking,
      onError: stopTalking,
    });
  }, [startTalking, stopTalking]);

  // Wire up WebSocket event handlers
  useEffect(() => {
    if (!wsRef.current) wsRef.current = {};

    wsRef.current.onTtsStart = () => {
      isTtsActive.current = true;
      clearTimeout(fallbackTimer.current);
      chunksRef.current = [];
    };

    wsRef.current.onAudioChunk = (data) => {
      if (isTtsActive.current) {
        chunksRef.current.push(data);
      }
    };

    wsRef.current.onTtsEnd = () => {
      isTtsActive.current = false;
      playChunks();
    };

    wsRef.current.onTtsFallback = (text) => {
      isTtsActive.current = false;
      chunksRef.current = [];
      speakFallback(text);
    };

    wsRef.current.onSubtitle = (text) => {
      // Start fallback timer — if no tts_start arrives in 200ms, use native TTS
      clearTimeout(fallbackTimer.current);
      fallbackTimer.current = setTimeout(() => {
        if (!isTtsActive.current) {
          speakFallback(text);
        }
      }, 200);
    };

    wsRef.current.cancelAudio = cancelAudio;
  }, [wsRef, playChunks, speakFallback, cancelAudio]);

  return { cancelAudio };
}
```

**Step 2: Integrate into MainScreen**

Add `useAudioPlayer()` to the `ChatScreen` component in MainScreen.jsx.

Call `wsRef.current?.cancelAudio?.()` in InputBar when user sends a message (cancel any playing audio).

**Step 3: Verify**

Send a message to Buddy with TTS enabled.
Expected: Buddy speaks via ElevenLabs (or native fallback), mouth animates, audio stops on new message send.

**Step 4: Commit**

```bash
git add mobile/src/hooks/ mobile/src/screens/ mobile/src/components/
git commit -m "feat: add mobile audio player hook with ElevenLabs + native TTS fallback"
```

---

## Phase 7: Admin Panel (Tasks 23-26)

### Task 23: AgentList Screen

**Files:**
- Modify: `mobile/src/screens/AdminDashboardScreen.jsx`
- Reference: `client/src/components/admin/AgentList.jsx`

**Step 1: Build AdminDashboardScreen as AgentList**

Port `client/src/components/admin/AgentList.jsx`. Shows personal + shared agents, create new agent button, tap to navigate to AgentEditor.

Key differences from web:
- Uses React Navigation instead of admin stack state
- Uses `<Pressable>` for tap targets instead of click handlers
- Uses `<ScrollView>` instead of scrollable div
- Uses `useAlert()` for confirmations instead of browser confirm()

Fetch agents from `/api/agents` on mount. Render each agent as a card with avatar thumbnail + name. "Create Agent" button opens an inline form.

Navigation: `navigation.navigate('AgentEditor', { agentId })` on tap.

**Step 2: Verify**

Open admin via gear icon → see agent list → tap agent → navigates to AgentEditor (placeholder for now).
Expected: Agent list renders, creation works, navigation works.

**Step 3: Commit**

```bash
git add mobile/src/screens/
git commit -m "feat: add AgentList admin screen"
```

---

### Task 24: AgentEditor Screen

**Files:**
- Modify: `mobile/src/screens/AgentEditorScreen.jsx`
- Reference: `client/src/components/admin/AgentEditor.jsx`

**Step 1: Build AgentEditorScreen**

Port `client/src/components/admin/AgentEditor.jsx`. This is the largest admin screen.

Sections (each in a `<View>` card):
1. **Agent name** — `<TextInput>`
2. **Model selector** — row of `<Pressable>` buttons (Haiku / Sonnet / Opus)
3. **Avatar picker** — flex-wrap grid of avatar `<Pressable>` thumbnails
4. **Voice config** — voice list from `/api/tts/voices`, voice model toggle, preview button
5. **Identity/User files** — multi-line `<TextInput>` for markdown editing, fetched from `/api/agents/:id/files/identity.md` and `user.md`
6. **Manage Skills** — `<Pressable>` to navigate to ToolSelector
7. **Save button** — PUT `/api/agents/:id`
8. **Delete/Leave** — with `useAlert().showConfirm()` confirmation

Wrap in `<ScrollView>` since the form is long.

Receive `agentId` from `route.params`. Fetch agent data on mount.

**Step 2: Verify**

Navigate to AgentEditor → see all sections → change model → save → verify persistence.
Expected: Full agent editing works.

**Step 3: Commit**

```bash
git add mobile/src/screens/
git commit -m "feat: add AgentEditor admin screen"
```

---

### Task 25: ToolSelector Screen

**Files:**
- Modify: `mobile/src/screens/ToolSelectorScreen.jsx`
- Reference: `client/src/components/admin/ToolSelector.jsx`

**Step 1: Build ToolSelectorScreen**

Port `client/src/components/admin/ToolSelector.jsx` — **excluding skill folder upload** (web-only).

Shows list of installed skills with toggle switches. Fetches skills from `/api/skills`. Updates agent's `enabled_tools` via PUT `/api/agents/:id`.

Each skill row: name, description, toggle `<Pressable>` switch.

No upload, no edit, no delete — those features are either web-only or managed through conversation with Buddy.

Receive `agentId` and current `enabledTools` from `route.params`.

**Step 2: Verify**

Navigate to ToolSelector → see skills with toggles → toggle a skill → save → verify persistence.
Expected: Skill toggles work and persist.

**Step 3: Commit**

```bash
git add mobile/src/screens/
git commit -m "feat: add ToolSelector admin screen"
```

---

### Task 26: UserList Screen

**Files:**
- Modify: `mobile/src/screens/UserListScreen.jsx`
- Reference: `client/src/components/admin/UserList.jsx`

**Step 1: Build UserListScreen**

Port `client/src/components/admin/UserList.jsx`. Admin-only screen.

Shows all users, create user form, toggle admin status, delete user. Uses `useAlert()` for confirmations.

Navigate to this from AdminDashboard (add a "Manage Users" button that only appears for admins).

**Step 2: Verify**

Log in as admin → Admin → Manage Users → see user list → create user → toggle admin → delete user.
Expected: Full user management works.

**Step 3: Commit**

```bash
git add mobile/src/screens/
git commit -m "feat: add UserList admin screen"
```

---

## Phase 8: Push Notifications (Tasks 27-29)

### Task 27: Server — Push Token Storage + Endpoint

**Files:**
- Modify: `server/db.js`
- Modify: `server/index.js`

**Step 1: Add push_token column to users table**

Add a migration in `server/db.js` to add the column:

```js
// Add after existing migrations
try {
  db.exec(`ALTER TABLE users ADD COLUMN push_token TEXT DEFAULT NULL`);
} catch (e) {
  // Column already exists
}
```

**Step 2: Add push token endpoint**

In `server/index.js`, add:

```js
// PUT /api/push/register
app.put('/api/push/register', requireAuth, (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });
  db.prepare('UPDATE users SET push_token = ? WHERE id = ?').run(token, req.user.id);
  res.json({ status: 'ok' });
});
```

**Step 3: Verify**

```bash
curl -X PUT http://localhost:3001/api/push/register \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"token": "ExponentPushToken[test123]"}'
```
Expected: 200 OK. Check DB: `SELECT push_token FROM users WHERE id = ...` returns the token.

**Step 4: Commit**

```bash
git add server/
git commit -m "feat: add push token storage and registration endpoint"
```

---

### Task 28: Server — Push Notification Sending

**Files:**
- Create: `server/push.js`
- Modify: `server/scheduler.js`

**Step 1: Install expo-server-sdk**

```bash
cd server && npm install expo-server-sdk
```

**Step 2: Create server/push.js**

```js
import { Expo } from 'expo-server-sdk';
import db from './db.js';

const expo = new Expo();

export async function sendPushNotification(userId, title, body) {
  const row = db.prepare('SELECT push_token FROM users WHERE id = ?').get(userId);
  if (!row?.push_token || !Expo.isExpoPushToken(row.push_token)) return;

  try {
    await expo.sendPushNotificationsAsync([{
      to: row.push_token,
      sound: 'default',
      title,
      body,
    }]);
  } catch (e) {
    console.error('[push] Failed to send notification:', e.message);
  }
}
```

**Step 3: Integrate with scheduler**

In `server/scheduler.js`, after the pending message insert (the offline user branch):

```js
import { sendPushNotification } from './push.js';

// After: db.prepare("INSERT INTO pending_messages...").run(...)
await sendPushNotification(
  schedule.user_id,
  'Buddy',
  `Scheduled: ${schedule.name}`
);
```

**Step 4: Verify**

Create a schedule for a user, ensure they're offline (no WebSocket), wait for it to fire.
Expected: Push notification sent (check server logs for `[push]` output). Actual device notification requires the mobile app registration in Task 29.

**Step 5: Commit**

```bash
git add server/
git commit -m "feat: add push notification sending via Expo Push API"
```

---

### Task 29: Mobile — Notification Registration + Handling

**Files:**
- Create: `mobile/src/hooks/useNotifications.js`
- Modify: `mobile/src/screens/MainScreen.jsx`
- Modify: `mobile/src/context/AuthContext.jsx`

**Step 1: Create useNotifications hook**

```jsx
// mobile/src/hooks/useNotifications.js
import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { getApi } from '../lib/api';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotifications() {
  if (!Device.isDevice) {
    console.log('[push] Must use physical device for push notifications');
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[push] Permission not granted');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const tokenData = await Notifications.getExpoPushTokenAsync();
  return tokenData.data;
}

export default function useNotifications(navigation) {
  const notificationListener = useRef();
  const responseListener = useRef();

  useEffect(() => {
    // Listen for notifications received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      // Notification displayed as banner (handled by setNotificationHandler)
    });

    // Listen for user tapping on a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      // Navigate to chat screen
      navigation?.navigate('Main');
    });

    return () => {
      Notifications.removeNotificationSubscription(notificationListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, [navigation]);
}
```

**Step 2: Register push token after login**

In `AuthContext.jsx`, after successful login:

```js
import { registerForPushNotifications } from '../hooks/useNotifications';

// Inside login(), after setUser():
const pushToken = await registerForPushNotifications();
if (pushToken) {
  try {
    const api = getApi();
    await api('/api/push/register', { method: 'PUT', body: { token: pushToken } });
  } catch (e) {
    console.log('[push] Failed to register token:', e.message);
  }
}
```

**Step 3: Add useNotifications to MainScreen**

```jsx
import useNotifications from '../hooks/useNotifications';
// Inside ChatScreen:
const navigation = useNavigation();
useNotifications(navigation);
```

**Step 4: Verify**

On a physical device (or Expo Go with push support):
1. Log in → permission prompt appears → allow
2. Check server DB: `push_token` column has the Expo token
3. Trigger an offline notification (schedule, then background the app)
Expected: Push notification appears on device. Tapping it opens the app to the chat screen.

Note: Push notifications don't work in emulators. Test on a physical device with Expo Go or a dev build.

**Step 5: Commit**

```bash
git add mobile/ server/
git commit -m "feat: add push notification registration and handling"
```

---

## Phase 9: Polish + Font Loading (Task 30)

### Task 30: Font Loading + Final App.jsx Wiring

**Files:**
- Modify: `mobile/App.jsx`
- Add: `mobile/assets/fonts/Figtree-*.ttf`

**Step 1: Download Figtree font files**

Download Figtree font family TTF files from Google Fonts. Place in `mobile/assets/fonts/`:
- `Figtree-Regular.ttf`
- `Figtree-SemiBold.ttf`
- `Figtree-Bold.ttf`

**Step 2: Load fonts in App.jsx**

```jsx
import './global.css';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './src/theme/ThemeProvider';
import { AlertProvider } from './src/components/AlertModal';
import { AuthProvider } from './src/context/AuthContext';
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
            <AppNavigator />
          </AuthProvider>
        </AlertProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
```

**Step 3: Update NativeWind tailwind config to use Figtree**

In `mobile/tailwind.config.js`:

```js
theme: {
  extend: {
    fontFamily: {
      sans: ['Figtree-Regular'],
      semibold: ['Figtree-SemiBold'],
      bold: ['Figtree-Bold'],
    },
  },
},
```

**Step 4: Verify**

Run in emulator. Check that fonts render correctly throughout the app.
Expected: Figtree font used everywhere. Splash screen hides after fonts load.

**Step 5: Commit**

```bash
git add mobile/
git commit -m "feat: add Figtree font loading and finalize App.jsx"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-3 | Monorepo + shared package + web client refactor |
| 2 | 4-6 | Expo project scaffold + NativeWind |
| 3 | 7-11 | Theme, storage, navigation, auth, ServerSetup + Login |
| 4 | 12-17 | BuddyProvider, WebSocket, TopBar, Avatar, InputBar, MainScreen |
| 5 | 18-21 | All 11 canvas element types + layout system |
| 6 | 22 | Audio player hook (ElevenLabs + native TTS) |
| 7 | 23-26 | Admin panel (AgentList, AgentEditor, ToolSelector, UserList) |
| 8 | 27-29 | Push notifications (server + mobile) |
| 9 | 30 | Font loading + final polish |

**Total: 30 tasks across 9 phases.**
