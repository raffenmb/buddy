# React Native Mobile App Design

## Overview

A React Native mobile app for Buddy that achieves full parity with the web client. Built with Expo, structured as a monorepo with a shared logic package. Connects to the Buddy server via Tailscale. Targets Android first with iOS-ready architecture.

## Decisions

| Area | Decision |
|---|---|
| Framework | Expo (managed workflow) |
| Structure | Monorepo — `shared/` package + `mobile/` Expo app |
| Connectivity | Tailscale IP, entered once on first launch, saved to AsyncStorage |
| Navigation | React Navigation stack. Gear button opens admin stack. No tabs/drawer. |
| Layout | Matches web: TopBar, Canvas, Avatar+Subtitle, InputBar |
| Avatar | Scaled down proportionally for mobile screens |
| WebSocket | Same protocol as web. Backgrounding closes/reconnects via AppState. |
| TTS | expo-av for ElevenLabs MP3 streaming, expo-speech for native fallback |
| Canvas | All 11 element types reimplemented. victory-native for charts. |
| Theme | NativeWind + ThemeProvider. Same color tokens as web. Figtree via expo-font. |
| Admin | Full parity with web except skill folder upload (web-only) |
| Push notifications | Expo Push via expo-notifications. Small server addition for token storage + sending. |
| Target | Android first, iOS-ready architecture |
| Scope | Full parity with web client |

## Project Structure

```
buddy/
├── client/            # Existing React web client (Vite)
├── server/            # Existing Node.js backend
├── shared/            # Platform-agnostic logic
│   ├── package.json
│   ├── state/
│   │   ├── reducer.js       # Canvas/UI reducer (from BuddyState)
│   │   └── initialState.js  # Default state shape
│   ├── api/
│   │   └── client.js        # REST API calls (fetch-based)
│   ├── ws/
│   │   └── messageTypes.js  # WebSocket message type constants + handlers
│   └── lib/
│       └── commandRouter.js # Canvas command → action type mapping
├── mobile/            # Expo React Native app
│   ├── app.json
│   ├── package.json
│   ├── App.jsx
│   ├── src/
│   │   ├── screens/
│   │   ├── components/
│   │   ├── canvas-elements/
│   │   ├── hooks/
│   │   ├── context/
│   │   └── theme/
│   └── assets/
└── package.json       # Root workspace config (npm workspaces)
```

### What gets shared

The reducer logic, API client, command router, and message type constants. These are pure JS with no platform dependencies.

### What stays platform-specific

UI components, hooks that touch native APIs (audio, storage, speech), navigation, and context provider wrappers.

The web `client/` gets updated to import from `shared/` instead of its local copies — same code moving, not new logic.

## Navigation & Screen Layout

### Screens

1. **ServerSetup** — First launch only. Single text field for Tailscale server URL (e.g., `http://100.x.y.z:3001`). Saved to AsyncStorage. Shown again only if connection fails.

2. **Login** — Username + password. Matches web client's login screen. On success, stores JWT in AsyncStorage.

3. **Main (Chat)** — Core experience matching web layout:

```
┌──────────────────────────┐
│ TopBar (agent, dot, ⚙)  │
├──────────────────────────┤
│                          │
│   Canvas (scrollable)    │
│                          │
│                          │
├──────────────────────────┤
│ 🤖 Avatar + Subtitle    │
├──────────────────────────┤
│ [  Input bar  ] (Send)  │
└──────────────────────────┘
```

- Avatar scaled down proportionally for mobile
- Canvas takes the bulk of screen space
- KeyboardAvoidingView wraps the bottom section

4. **Admin** — Stack navigation pushed from gear button:
   - AgentList → AgentEditor → ToolSelector
   - UserList (admin only)
   - Back button returns to Chat

Navigation library: React Navigation (stack navigator). No tabs, no drawer.

## WebSocket & Real-time Communication

The mobile app connects to the same WebSocket endpoint as the web client. The shared message type constants ensure both clients handle the same protocol.

### Connection flow

1. App reads server URL from AsyncStorage
2. Connects to `ws://<tailscale-ip>:3001?token=<jwt>`
3. Reconnects with exponential backoff (1s → 10s max)

### Server → Mobile messages (unchanged)

- `subtitle` — update subtitle text, trigger TTS
- `canvas_command` — dispatch through shared command router to reducer
- `processing` — show/hide thinking indicator
- `agent_switch` — update agent metadata, rehydrate canvas
- `canvas_rehydrate` — restore canvas state on reconnect
- `tts_start` / `tts_chunk` (binary) / `tts_end` / `tts_fallback` — audio streaming

### Mobile → Server messages (unchanged)

- `confirm_response` — approve/deny destructive actions
- `form_response` — submit form data
- `canvas_element_update` — checklist toggle sync
- `file_upload` — base64 encoded file with optional caption

### Mobile-specific behavior

- AppState listener: close socket on background, reconnect on foreground
- WebSocket is built into React Native's JS runtime — no extra library needed

No server changes required for WebSocket support.

## Audio & TTS

### ElevenLabs streaming (primary)

1. Server sends `tts_start` via WebSocket
2. Binary MP3 chunks arrive as `tts_chunk` messages, accumulated in a buffer
3. Server sends `tts_end`
4. Chunks merged into a single MP3 buffer
5. expo-av `Audio.Sound` loads the buffer and plays it
6. Avatar mouth animation runs during playback, stops on `onPlaybackStatusUpdate` completion

### Native TTS fallback

- Server sends `tts_fallback` (or no `tts_start` within 200ms)
- expo-speech `Speech.speak()` reads the subtitle text aloud
- Mouth animation syncs via `Speech.speak()` `onDone` callback

### Audio cancellation

- User sends new message → stop both expo-av playback and expo-speech
- Reset mouth animation state

### Background audio

- Configure `Audio.setAudioModeAsync` for playback to continue if phone is locked
- Not a music player — just ensure Buddy finishes speaking

### Key difference from web

On web, AudioContext decodes MP3 chunks into PCM and plays via BufferSource. On mobile, expo-av handles MP3 natively. The accumulated binary chunks need to be written to a temporary file for expo-av to load, since it doesn't accept raw buffers directly.

## Canvas Elements

All 11 canvas element types reimplemented as React Native components. The shared reducer handles state identically — only the rendering layer changes.

| Web Component | Mobile Equivalent | Notes |
|---|---|---|
| Card | `<View>` + `<Text>` | Markdown body via react-native-markdown-display |
| TextBlock | `<View>` + `<Text>` | Style variants via conditional styles |
| Chart | victory-native | Drop-in replacement, same API |
| DataTable | `<View>` flex rows | Already flexbox on web |
| VideoPlayer | react-native-youtube-iframe + expo-av | YouTube via iframe lib, direct video via expo-av |
| Notification | Absolute-positioned toast `<View>` | Auto-dismiss with setTimeout |
| ActionConfirm | `<View>` with Approve/Deny `<Pressable>` | Same blocking gate pattern |
| FormInput | `<TextInput>`, custom toggles/pickers | Same custom component pattern as web |
| Checklist | `<Pressable>` toggle items | Silent WS sync |
| ProgressBar | `<View>` with animated width | Animated API for smooth transitions |
| Timer | `<Text>` countdown | setInterval-based, identical logic |

Canvas layouts (single, two-column, grid, dashboard, fullscreen) are already flexbox with flex-wrap — they translate directly to React Native `<View>` with the same flex properties.

Canvas content wrapped in `<ScrollView>`.

## Theme & Styling

### NativeWind

NativeWind (Tailwind CSS for React Native) lets us use the same Tailwind utility classes the web client already uses: `rounded-lg`, `p-4`, `text-sm`, `gap-2`, etc.

### Theme system

- Light and dark color tokens defined as a JS object (matching web's CSS custom properties)
- ThemeProvider wraps the app, exposes colors via React Context
- Components access colors via `useTheme()` hook
- Preference persisted to AsyncStorage

### Color tokens (same as web)

```
bg-base, bg-surface, bg-raised
text-primary, text-secondary, text-muted
accent, secondary, tertiary, border
shadow-card, shadow-elevated
```

### Font

Figtree loaded via expo-font. Falls back to system font until loaded.

## Admin Panel

Mirrors the web admin exactly via React Navigation stack.

### Screens

**AgentList:** Personal + shared agents, create new agent, tap to edit.

**AgentEditor:** Model selector (button picker), avatar picker (preset grid), voice picker (ElevenLabs voices from `/api/tts/voices`), identity/user markdown editors (multi-line TextInput), skill toggles (pushes ToolSelector), leave/delete for shared agents.

**ToolSelector:** Toggle switches for installed skills.

**UserList (admin only):** User management.

### Excluded from mobile

Skill folder upload — web-only feature. Skills managed through web client or through conversation with Buddy.

## Push Notifications

### Registration flow

1. On login, app registers for push notifications via expo-notifications
2. Expo returns an Expo Push Token
3. Mobile sends token to server: `POST /api/users/:id/push-token`
4. Server stores token in a new `push_tokens` column on the `users` table

### When to push

- **Scheduled events** — scheduler fires, user has no active WebSocket → send push
- **Sub-agent completion** — long-running agent finishes while app is backgrounded
- **Pending messages** — on `pending_messages` insert, fire a push notification

### Server-side

- New module `server/push.js` — sends via Expo Push API (`https://exp.host/--/api/v2/push/send`)
- No Firebase/APNs setup needed — Expo handles platform-specific delivery
- Simple HTTP POST with token, title, and body

### Mobile-side

- expo-notifications handles permission prompts, token registration, foreground/background display
- Tapping notification opens app, navigates to Chat screen
- Foreground notifications show as a small banner

### Server change

This is the one feature requiring a server addition: push token endpoint + push sending utility.

## Key Dependencies

### Mobile (Expo)

- expo (~52.x)
- react-native
- @react-navigation/native + @react-navigation/stack
- nativewind + tailwindcss
- expo-av (ElevenLabs audio playback)
- expo-speech (native TTS fallback)
- expo-font (Figtree)
- expo-notifications (push notifications)
- @react-native-async-storage/async-storage
- victory-native (charts)
- react-native-youtube-iframe (YouTube embeds)
- react-native-markdown-display (card markdown)
- react-native-safe-area-context
- react-native-screens

### Shared

- No dependencies (pure JS)

### Server additions

- expo-server-sdk (push notification sending)
