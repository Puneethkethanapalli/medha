# Medha (मेधा) — AI Chat App

> Sanskrit for **wisdom** and **intelligence** — an open-source, BYOK (Bring Your Own Key) AI chat client for Android.

Medha is a privacy-first conversational AI interface that puts you in control. Connect your own API keys from top AI providers and leverage powerful agentic features like custom apps, file-based skills, web search, image generation, and long-term memory. No accounts, no tracking, no data leaves your device.

---

## 🚀 Features

### Provider Ecosystem
- **Multi-Provider Support** — Connect keys for OpenRouter, Google AI (Gemini), Anthropic, MiniMax, and Cloudflare AI.
- **Dynamic Model Fetching** — Automatically discovers new models from providers.
- **On-Device Key Storage** — API keys are encrypted and stored locally using Expo SecureStore.

### Agentic Capabilities & Tools
- **Agent Skills (`SKILL.md`)** — Industry-standard file-based skill system for specialized tasks. Includes bundled skills: `code-review`, `research`, `translate-document`, `summarize`, and `debug-error`.
- **Web Search** — Powered by Tavily for real-time information retrieval when the AI needs current facts.
- **Image Generation** — Seamlessly integrated DALL-E 3 (OpenAI) and Stability AI (SD3) generation via tool calling.
- **Long-Term Memory** — The AI proactively saves and manages user preferences, facts, and instructions across conversations using specialized `save_memory` and `forget_memory` tools.

### Customization & Workflow
- **Custom Apps (Personas)** — Create specialized assistants with pinned models, unique system instructions, greetings, example prompts, and custom colors/icons (similar to Custom GPTs).
- **Rules & Instructions** — Set global custom instructions or override them per-app.
- **Slash Commands** — Create and manage custom `/` commands for quick prompt insertions.
- **System Prompts** — Manage reusable prompt presets.

### Analytics & Transparency
- **Usage & Cost Tracking** — Real-time token usage tracking during streaming, heuristic cost estimation based on live pricing, and a comprehensive historical dashboard to track your API spend.

### Core Chat Experience
- **Streaming Responses** — Real-time token streaming with cancel support and proper `AbortController` handling.
- **Edit & Resend** — Tap any user message to edit and replay the conversation from that point.
- **Markdown & Code** — Full markdown rendering with syntax highlighting and copy-to-clipboard support.
- **Conversation Management** — Create, rename, pin, delete, and search local conversations stored in SQLite.

### UI / UX (Nova Design)
- **Nova Design Language** — Monochromatic, dark-first UI inspired by modern desktop AI clients.
- **Themes** — Dark (default), Light, and OLED (pure black).
- **Biometric Lock** — Optional Class 3 (strong) biometric or device passcode lock.
- **Haptic Feedback** — Subtle tactile responses for interactions.
- **Offline Detection** — Graceful handling of network drops and backgrounding.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Expo SDK 55 + React Native 0.83 + React 19 |
| **Routing** | Expo Router (file-based routing) |
| **UI Components** | react-native-reusables + NativeWind v4 + Tailwind CSS v3 |
| **State** | Zustand |
| **Database** | expo-sqlite (messages, conversations, apps, skills, memories, usage) |
| **Settings** | MMKV (fast synchronous key-value storage) |
| **Secure Storage**| expo-secure-store (API keys) |
| **Streaming** | Native `fetch` + ReadableStream + custom SSE parsers |
| **Animations** | react-native-reanimated, Lottie |

---

## 🏗️ Architecture Overview

```text
src/
├── app/                     # Expo Router routes
├── components/
│   ├── ui/                  # Reusable base components
│   ├── chat/                # Chat interface components
│   └── navigation/          # Drawers and layouts
├── lib/
│   ├── apps/                # Custom Apps management & seeding
│   ├── db/                  # SQLite schema and query logic
│   ├── memory/              # Long-term memory storage
│   ├── models/              # Model capabilities and context mapping
│   ├── providers/           # AI provider integrations (OpenRouter, Anthropic, etc.)
│   ├── skills/              # SKILL.md parsing and management
│   ├── storage/             # SecureStore and MMKV wrappers
│   ├── streaming/           # Core SSE streaming engine
│   ├── tokens/              # Usage tracking and cost calculation
│   └── tools/               # Tool definitions (web search, image gen, memory)
└── stores/                  # Zustand global state (chat, settings, ui)
```

---

## 🚀 Setup & Installation

### Prerequisites
- Node.js 18+
- pnpm (`npm i -g pnpm`)
- Android SDK (for building)
- API keys from supported providers (e.g., OpenRouter, Google AI, Anthropic, Cloudflare).

### Development
```bash
# Clone the repository
git clone https://github.com/yourusername/medha.git
cd medha

# Install dependencies
pnpm install

# Install Expo dev client (required for native modules like SQLite/Biometrics)
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

# Build release APK
cd android && ./gradlew assembleRelease
```

---

## 📄 License

MIT
