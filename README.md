# Medha (मेधा) — AI Chat App

> Sanskrit for **wisdom** and **intelligence** — an open-source, BYOK (Bring Your Own Key) AI chat client for Android.

Medha is a privacy-first conversational AI interface that puts you in control. Connect your own API keys from top AI providers and use agentic features like custom apps, file-based skills, web search, image generation, long-term memory, and multimodal attachments. There is no Medha backend: conversations, settings, apps, skills, memories, and usage history are stored locally, while chat/tool requests go only to the providers you configure.

---

## 🚀 Features

### Provider Ecosystem
- **Multi-Provider BYOK** — Connect OpenRouter, OpenAI, ChatGPT Codex, Google AI, Anthropic, MiniMax, and Cloudflare AI.
- **Tool Provider Keys** — Add separate Tavily and image-generation keys for web search, deep research, and image generation.
- **ChatGPT Codex Sign-In** — Device-code authentication for Codex models through a ChatGPT plan.
- **Cloudflare Workers AI** — Stores Cloudflare Account ID separately and supports Cloudflare's OpenAI-compatible chat endpoint.
- **Dynamic Model Picker** — Fetches provider model lists, keeps fallbacks available, and lets you search/filter models.
- **Capability Awareness** — Model badges and filters for vision, thinking, tools, PDF support, and long-context windows.
- **Secure Key Storage** — API keys are encrypted and stored locally with Expo SecureStore.

### Agentic Capabilities & Tools
- **Tool Calling Loop** — Cross-provider tool orchestration for search, research, memory, image generation, and user choice cards.
- **Web Search** — Tavily-backed cited search for current information.
- **Deep Research** — Multi-query research passes with deduped citations and source packs.
- **Image Generation** — OpenAI DALL-E 3 or Stability AI SD3 through the `generate_image` tool.
- **Long-Term Memory** — AI can save and forget preferences, facts, and instructions with `save_memory` and `forget_memory`.
- **Ask-User Choice Cards** — Models can ask structured multiple-choice questions and continue from the user's selection.
- **Agent Skills (`SKILL.md`)** — Bundled, imported, and user-created skills with optional `allowed-tools`.
- **Bundled Skills** — `code-review`, `research`, `translate-document`, `summarize`, and `debug-error`.

### Customization & Workflow
- **Custom Apps** — Create local assistant personas with name, description, icon, color, linked skill, rules, greeting, suggestion prompts, and optional pinned provider/model.
- **Built-In Apps** — Medha Default, Code Assistant, Writing Coach, Language Tutor, and Research Pro.
- **App Export** — Share apps as `.app.json`, including linked `SKILL.md` content when present.
- **System Prompts** — Built-in presets plus custom presets with JSON import/export.
- **Rules & Instructions** — Global built-in/custom rules with per-conversation overrides.
- **Slash Commands** — Built-in commands plus user-created `/` commands that send, prefill, or wrap prompt text.
- **Chat Settings** — Per-chat controls for thinking mode, web search, and conversation instructions.

### Analytics & Transparency
- **Live Throughput** — Shows live tokens/second above the input while a response is generating.
- **Response Metrics** — Stores prompt tokens, completion tokens, and average tokens/second on completed responses.
- **Usage Dashboard** — Today, week, and 30-day summaries with daily token chart, top models, and provider breakdowns.
- **Cost Estimates** — Tracks estimated costs per message, conversation, model, and provider.
- **Context Window Meter** — Floating context-window indicator with compact token usage feedback.

### Core Chat Experience
- **Streaming Responses** — Real-time SSE streaming with cancel/stop support and background abort handling.
- **Thinking Display** — Streaming reasoning/activity panel with expandable thought process when models provide reasoning.
- **Edit & Resend** — Edit a user message and replay the conversation from that point.
- **Retry & Regenerate** — Retry failed responses or regenerate assistant messages.
- **Message Actions** — Copy, edit, delete, and long-press actions.
- **Conversation Drawer** — New chat, search, grouped history, pinned indicators, app icons, delete, and per-chat rules.
- **Global Search** — Search across saved message content and jump to a highlighted result.
- **Offline Banner** — Detects network loss and surfaces connection state.

### Input & Attachments
- **Keyboard-Aware Composer** — Sticky input bar with keyboard-controller support.
- **Voice Input** — Native speech recognition with live transcript and waveform.
- **Slash Picker** — Command suggestions when typing `/`.
- **Token Estimate** — Debounced estimate for the current prompt.
- **Images & Camera** — Attach images from the library or take a photo.
- **Documents** — Attach PDFs, TXT/Markdown/CSV/JSON, DOCX, and XLSX files.
- **Document Extraction** — PDF text extraction, DOCX extraction, XLSX-to-CSV extraction, and text inlining.
- **PDF Vision Fallback** — Renders PDF pages to images for OpenAI-compatible providers that need vision input.

### Markdown & Output
- **Rich Markdown** — Headings, lists, links, blockquotes, tables, inline code, and images.
- **Syntax Highlighting** — Code blocks with language labels and highlight.js styles.
- **Code Utilities** — Copy code, save/share code as a file, and expand/collapse long blocks.
- **Image Preview** — Tap generated or markdown images to preview and share/save.
- **Tool Cards** — Compact UI cards for search results, research packs, memories, generated images, and tool errors.

### Memory & Skills
- **Memory Manager** — View, search, add, pin, unpin, and delete memories.
- **Memory Categories** — Preference, Fact, Instruction, and General.
- **Skills Manager** — Enable/disable bundled, imported, and created skills.
- **Skill Import/Export** — Import `SKILL.md` files and export/share skills.
- **Skill Editor** — Create new skills in-app.

### UI / UX (Nova Design)
- **Nova Design Language** — Monochromatic, dark-first UI inspired by modern desktop AI clients.
- **Themes** — Dark (default), Light, and OLED (pure black).
- **Haptic Feedback** — Subtle tactile responses for interactions.
- **Native Bottom Sheets** — Model picker, attachments, theme picker, and chat settings use native-feeling sheet interactions.
- **Local-First Storage** — Conversations, apps, skills, memories, and usage data are stored on-device in SQLite.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Expo SDK 55 + React Native 0.83 + React 19 |
| **Routing** | Expo Router (file-based routing) |
| **UI Components** | react-native-reusables + NativeWind v4 + Tailwind CSS v3 |
| **State** | Zustand |
| **Database** | expo-sqlite (messages, conversations, apps, skills, memories, usage) |
| **Settings** | AsyncStorage-backed local settings with synchronous in-memory cache |
| **Secure Storage**| expo-secure-store (API keys) |
| **Streaming** | Native `fetch` + ReadableStream + custom SSE parsers |
| **Input** | react-native-keyboard-controller, expo-speech-recognition |
| **Files** | expo-document-picker, expo-image-picker, expo-file-system, PDF/DOCX/XLSX extractors |
| **Animations** | react-native-reanimated, Lottie, @gorhom/bottom-sheet |

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
│   ├── memory/              # Long-term memory injection
│   ├── models/              # Model capabilities and context mapping
│   ├── providers/           # AI provider integrations (OpenRouter, Anthropic, etc.)
│   ├── skills/              # SKILL.md parsing and management
│   ├── storage/             # SecureStore and local settings wrappers
│   ├── streaming/           # Core SSE streaming engine
│   ├── tokens/              # Usage tracking and cost calculation
│   └── tools/               # Tool definitions (web search, image gen, memory)
└── stores/                  # Zustand global state (chat, settings, ui)
```

---

## 🚀 Setup & Installation

### Prerequisites
- Node.js 18+
- npm or pnpm
- Android SDK (for building)
- API keys from at least one supported provider.

### Development
```bash
# Clone the repository
git clone https://github.com/yourusername/medha.git
cd medha

# Install dependencies
npm install

# Build and run the native Android dev app
npm run android

# Start Metro for an existing native dev build
npx expo start
```

### Building for Android
```bash
# Generate native Android project
npx expo prebuild --platform android

# Build debug APK
cd android && ./gradlew assembleDebug

# Build release APK
cd android && ./gradlew assembleRelease
```

---

## 📄 License

MIT
