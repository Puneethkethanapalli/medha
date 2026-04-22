# Medha (मेधा) — AI Chat App

> Sanskrit for **wisdom** and **intelligence** — an open-source, BYOK AI chat client for Android.

Medha is a privacy-first conversational AI interface that puts you in control. Connect your own API keys from OpenRouter, Google AI (Gemini), or Anthropic. No accounts, no tracking, no data leaves your device.

---

## Screenshots

> TODO: Add screenshots here — empty state, active conversation, model picker, theme picker

| Empty State | Active Conversation | Model Picker |
|---|---|---|
|  |  |  |

---

## Features

- **Multi-Provider Support** — OpenRouter (100+ models), Google AI (Gemini), Anthropic (Claude). Add and switch API keys at any time.
- **Streaming Responses** — Real-time token streaming with blinking cursor. Cancel mid-response at any time.
- **Conversation Management** — Create, rename, pin, delete, and search conversations. Full message history persists locally.
- **System Prompts** — Set per-conversation or use presets (Code Helper, Creative Writer, Translator, Default). Import/export as JSON.
- **Markdown Rendering** — Full markdown support with syntax highlighting for code blocks, copy-to-clipboard, and progressive streaming.
- **Nova Design** — Monochromatic dark-first UI with three themes: Dark (default), Light, and OLED (pure black).
- **Edit & Resend** — Tap any user message to edit and replay from that point. Downstream messages are replaced.
- **Message Actions** — Long-press context menu: Copy, Edit & Resend (user), Regenerate (assistant), Delete.
- **Offline Detection** — Banner appears when no internet. Streaming gracefully aborts on app background.
- **Biometric Lock** — Optional Class 3 (strong) biometric or device passcode lock before accessing the app.
- **Haptic Feedback** — Subtle tactile feedback on send, suggestion taps, and message actions.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Expo SDK 55 + React Native 0.83 + React 19 |
| Routing | Expo Router (file-based, `src/app/`) |
| UI Components | react-native-reusables + NativeWind v4 + Tailwind CSS v3 |
| State | Zustand |
| Database | expo-sqlite (messages/conversations) |
| Settings | MMKV (theme, model cache, system prompt presets) |
| Secure Storage | expo-secure-store (API keys) |
| Streaming | Native `fetch` + ReadableStream + manual SSE parser |
| Animations | react-native-reanimated, Lottie |
| Gestures | react-native-gesture-handler |
| Navigation | react-native-drawer-layout, @gorhom/bottom-sheet v5 |

---

## Architecture

```
src/
├── app/                     # Expo Router (src/app/ for SDK 55)
│   ├── _layout.tsx          # Root layout + drawer + providers
│   ├── index.tsx            # Chat home (new chat)
│   ├── chat/[id].tsx        # Individual conversation
│   ├── search.tsx           # Conversation search
│   ├── settings.tsx         # Settings
│   ├── settings/
│   │   ├── api-keys.tsx     # API key management
│   │   └── system-prompts.tsx # System prompt presets
│   └── onboarding.tsx       # First-time setup
├── components/
│   ├── ui/                  # rn-reusables components (owned source)
│   ├── chat/                # MessageBubble, MessageList, InputBar, etc.
│   ├── navigation/          # ConversationDrawer
│   └── common/              # Toast, ConfirmDialog
├── lib/
│   ├── providers/           # AI provider abstraction + SSE streaming
│   ├── db/                  # SQLite schema + CRUD
│   └── storage/             # MMKV + SecureStore wrappers
└── stores/                  # Zustand stores (chat, ui, settings)
```

### Streaming Architecture

1. User sends message → saved to SQLite immediately
2. Placeholder assistant message created (status: `streaming`)
3. Provider.stream() called → fetch with `stream: true`
4. SSE chunks parsed token-by-token → appended to Zustand store
5. MessageBubble re-renders via targeted Zustand selector
6. On `[DONE]` → final message persisted to SQLite

### Database Schema

```sql
conversations: id, title, model, provider, system_prompt, created_at, updated_at, pinned
messages: id, conversation_id, role, content, status, model, tokens_used, created_at
```

---

## Setup

### Prerequisites

- Node.js 18+
- pnpm (`npm i -g pnpm`)
- Android SDK (for building)
- API keys from [OpenRouter](https://openrouter.ai), [Google AI Studio](https://aistudio.google.com), or [Anthropic](https://console.anthropic.com)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/medha.git
cd medha

# Install dependencies
pnpm install

# Install Expo dev client (required for biometric + SQLite)
pnpm expo install --dev-client

# Start the dev server
pnpm expo start --dev-client
```

### Building for Android

```bash
# Generate native Android project
pnpm expo prebuild --platform android

# Build debug APK
cd android && ./gradlew assembleDebug
# APK at: android/app/build/outputs/apk/debug/app-debug.apk

# Or build release APK
cd android && ./gradlew assembleRelease
```

### Environment Variables

No environment variables required. API keys are stored securely on-device via `expo-secure-store`.

---

## Design

Medha uses the **Nova** design language — a monochromatic, dark-first, chat-first aesthetic inspired by the 2026 ChatGPT/Claude/Gemini desktop experience.

- **No color accents** — all interactive feedback uses monochrome hierarchy
- **Success states** — white checkmark icon, no green backgrounds
- **Error states** — subtle red border (`hsla(0, 84%, 60%, 0.3)`), white text
- **Font** — System default (San Francisco / Roboto)

Design references are stored in `designs/` and `generated designs/`.

---

## License

MIT
