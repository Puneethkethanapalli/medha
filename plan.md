# Medha (मेधा) — AI Chat App Agile Plan

> **Sanskrit for wisdom/intelligence** — Open-source, BYOK AI chat client
> Built with: Expo SDK 55 + React Native 0.83 + React 19.2 + react-native-reusables

---

## 📋 Project Context

| Key | Value |
|-----|-------|
| **Platforms** | Android (native) |
| **Architecture** | 100% client-side, no backend |
| **UI Framework** | react-native-reusables (NativeWind v4 + Tailwind CSS v3) |
| **State** | Zustand (UI state only) |
| **Database** | expo-sqlite (messages/conversations) + MMKV (settings/config) |
| **Streaming** | Native `expo/fetch` + ReadableStream + manual SSE parser |
| **First Provider** | OpenRouter (OpenAI-compatible, 100+ models) |
| **Secure Storage** | expo-secure-store (API keys) |
| **Auth** | None — biometric lock via expo-local-authentication |
| **Design** | Nova (shadcn b0) — monochromatic, dark-first, chat-first UX |
| **Design Refs** | `designs/` (Stitch prompts) + `generated designs/` (approved mockups) |
| **Navigation** | Chat-first, drawer-based (no tab bar) — like ChatGPT/Claude/Gemini 2026 |
| **Expo SDK** | 55 (React Native 0.83, React 19.2, New Architecture mandatory,pnpm) |
| **Folder Structure** | `src/app/` (SDK 55 default) |
| **Developer** | Solo, weekend project, portfolio piece |
| **Testing** | Manual only (CI/CD later) |

---

## 🏗️ Architecture Overview

```
src/
├── app/                     # Expo Router (file-based routing)
│   ├── _layout.tsx          # Root layout + providers + drawer
│   ├── index.tsx            # Chat screen (main — empty or last conversation)
│   ├── chat/[id].tsx        # Individual chat view
│   ├── settings.tsx         # Settings screen (pushed from drawer)
│   ├── settings/
│   │   ├── api-keys.tsx     # API key management
│   │   └── system-prompts.tsx # System prompt presets
│   ├── onboarding.tsx       # First-time setup
│   └── +not-found.tsx
├── components/
│   ├── ui/                  # rn-reusables components (copy-pasted, owned source)
│   ├── chat/                # Chat-specific components
│   │   ├── MessageBubble.tsx
│   │   ├── MessageList.tsx
│   │   ├── InputBar.tsx
│   │   ├── StreamingText.tsx
│   │   ├── ModelPill.tsx    # Model selector pill (top of chat)
│   │   └── EmptyState.tsx   # Suggestion chips for new chat
│   ├── navigation/          # Navigation components
│   │   └── ConversationDrawer.tsx  # Left-edge conversation drawer
│   └── common/              # Shared components (Toast, ConfirmDialog)
├── lib/
│   ├── providers/           # AI provider abstraction
│   │   ├── types.ts         # Provider interface
│   │   ├── openrouter.ts    # OpenRouter implementation
│   │   └── registry.ts     # Provider registry
│   ├── streaming/           # SSE streaming engine
│   │   ├── sse-parser.ts    # Manual SSE line parser
│   │   └── stream.ts        # fetch + ReadableStream wrapper
│   ├── db/                  # Database layer
│   │   ├── schema.ts        # SQLite table definitions
│   │   ├── messages.ts      # Message CRUD
│   │   └── conversations.ts # Conversation CRUD
│   └── storage/             # MMKV + SecureStore wrappers
│       ├── mmkv.ts          # Settings, theme, model cache
│       └── secure.ts        # API key storage
├── stores/                  # Zustand stores (UI state only)
│   ├── chat-store.ts        # Active chat, streaming state
│   ├── ui-store.ts          # Drawer, theme, modals
│   └── settings-store.ts   # Provider config, model selection
├── hooks/                   # Custom hooks
├── constants/               # Colors, theme tokens
└── types/                   # Shared TypeScript types
```

### Streaming Architecture (detailed)

```
User sends message
       ↓
1. Save user message to SQLite immediately
2. Create placeholder assistant message (status: 'streaming')
3. Call provider.stream(messages, config)
       ↓
4. fetch('https://openrouter.ai/api/v1/chat/completions', {
     method: 'POST',
     headers: { Authorization: 'Bearer <key>' },
     body: JSON.stringify({ model, messages, stream: true }),
     signal: abortController.signal  // ← cancel support
   })
       ↓
5. response.body.getReader() → ReadableStream reader
       ↓
6. Loop: reader.read() → Uint8Array chunks
   → TextDecoder.decode(chunk)
   → Split by lines, filter 'data: ' prefix
   → Skip 'data: [DONE]'
   → JSON.parse each line → extract choices[0].delta.content
       ↓
7. Each token → append to zustand store → MessageBubble re-renders
   (Zustand selector: only the streaming message subscribes)
       ↓
8. On '[DONE]':
   → Update message status to 'complete' in zustand
   → Persist final message to SQLite
   → Clear streaming state

Cancel flow:
   User taps ✕ → abortController.abort() → fetch throws AbortError
   → Save partial message to SQLite with status: 'cancelled'
```

### Database Schema (expo-sqlite)

```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,          -- uuid
  title TEXT NOT NULL DEFAULT 'New Chat',
  model TEXT,                    -- e.g. 'openai/gpt-4o'
  provider TEXT DEFAULT 'openrouter',
  system_prompt TEXT,
  created_at INTEGER NOT NULL,   -- unix timestamp
  updated_at INTEGER NOT NULL,
  pinned INTEGER DEFAULT 0
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,             -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,
  status TEXT DEFAULT 'complete', -- 'complete' | 'streaming' | 'cancelled' | 'error'
  model TEXT,
  tokens_used INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX idx_messages_conv ON messages(conversation_id, created_at);
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
```

---

## 🏃 Sprint Breakdown

### Sprint 0 — Project Scaffolding
> **Goal:** Empty Expo app runs on Android with react-native-reusables rendering a test component.
> **Duration:** ~2 hours

#### Tasks
- [x] **0.1** Create Expo SDK 55 project
  - `npx create-expo-app@latest --template default@sdk-55 ./`
  - Verify `src/app/` folder structure exists
- [x] **0.2** Initialize react-native-reusables
  - Manual setup: create `components.json`, install `nativewind@4.2.3` + `tailwindcss@3.4`, create config files
  - Verify `global.css`, `metro.config.js`, `nativewind-env.d.ts`, and `lib/utils.ts` (cn helper) exist
  - Confirm `tailwind.config.js` is set up for NativeWind v4
- [x] **0.3** Add rn-reusables components needed for Sprint 1
  - `npx react-native-reusables@latest add button input text label separator`
  - Components are copy-pasted into `src/components/ui/` — you own the source
- [x] **0.4** Install core dependencies
  - `npx expo install expo-secure-store expo-local-authentication expo-sqlite expo-haptics expo-clipboard expo-sharing react-native-mmkv zustand`
  - `npm install uuid @types/uuid`
- [x] **0.5** Set up dark/light theme in `global.css`
  - Define Nova CSS variables — monochromatic only, no color accents
  - Dark (default): `--background: #09090B`, `--card: #0A0A0C`, `--muted: #18181B`, `--border: #27272A`, `--foreground: #FAFAFA`, `--muted-foreground: #A1A1AA`, `--destructive: #EF4444`
  - Also define `.light` and `.oled` theme classes
- [x] **0.6** Verify: run on Android emulator
  - `npx expo start` → press `a` for Android
  - Confirm rn-reusables Button renders correctly with Nova theme applied

#### How to Test Sprint 0
```
✅ `npx expo start` boots without errors
✅ Android emulator shows styled rn-reusables Button
✅ Dark theme colors applied
✅ No TypeScript errors
```

#### 📗 Things Learned
- `create-expo-app` refuses to scaffold in a non-empty directory — create in a temp subdirectory (e.g., `medha-temp`), then copy project files up
- `react-native-reusables init` creates a NEW project, not initialize in existing dir — manual setup required: create `components.json`, install packages, create config files
- **NativeWind v5 (5.0.0-preview.3) is INCOMPATIBLE with Expo SDK 55** — `expo-router@55` requires `nativewind/jsx-runtime` which only exists in v4 (nativewind v4 has `jsx-runtime`, v5 does not). Must use `nativewind@4.2.3` + `tailwindcss@3.4`
- Root layout in Expo Router SDK 55 uses `<Stack>` from `expo-router`, NOT `<SplashScreen>` as a rendered component
- `components.json` must be created manually for `rn-reusables add` to work — can't init in existing project
- `@react-native-reusables/cli add` IS interactive — pipe `echo "y"` or create `components.json` first
- `tailwindcss-animate` is a required dependency — install manually: `npm install tailwindcss-animate`
- `class-variance-authority` is required by all rn-reusables components — install manually
- CSS module type declarations need to be added manually (`src/types/css-modules.d.ts`) — TypeScript doesn't resolve `.module.css` by default
- NativeWind v4 auto-updates `tsconfig.json` to include `nativewind-env.d.ts` on first run
- `expo-doctor` (local CLI) → use `npx expo-doctor` instead (npm package)
- `nativewind/metro` (v4) is NOT the same as `nativewind/metro` (v5 preview) — v4 uses different config structure

#### 📕 Mistakes Made
- Tried to run `create-expo-app` in existing directory — had to use temp subdirectory workaround
- Ran `react-native-reusables init` in existing project — CLI detected existing project and refused to continue (interactive prompt)
- Installed `nativewind@5.0.0-preview.3` — caused `nativewind/jsx-runtime` not found error at bundle time (expo-router@55 depends on it)
- Forgot `tailwindcss-animate` — it was flagged by `rn-reusables doctor` as missing
- Forgot `class-variance-authority` — TypeScript error until installed
- Tried to render `<SplashScreen />` as a component in _layout — should only use `<Stack>` in Expo Router SDK 55
- Initially used Tailwind CSS v4 with nativewind v4 — v4 requires v3, not v4

#### 📘 Things to Remember
- Expo SDK 55 uses `src/app/` not `app/` — don't create root-level app folder
- react-native-reusables uses a **copy-paste model** (like shadcn) — components live in `src/components/ui/`, you own and edit them directly
- **NativeWind version**: Use `nativewind@4.2.3` + `tailwindcss@3.4` (NOT v5 preview) — v5 lacks `jsx-runtime` which expo-router@55 needs
- NativeWind v4 config: `postcss.config.mjs` with `tailwindcss: {}` + `autoprefixer: {}`; `metro.config.js` with `withNativeWind(config, { input: './src/global.css' })`
- NativeWind v4 babel: `babel-preset-expo` with `jsxImportSource: 'nativewind'` (required for jsx-runtime resolution)
- NativeWind v4 CSS: `@tailwind base; @tailwind components; @tailwind utilities;` + `@layer base {}` for CSS variables
- New Architecture is mandatory in SDK 55 — `newArchEnabled` flag removed
- Use `expo-dev-client` for testing, not Expo Go (SDK 55 may not be on Play Store Expo Go)
- `cn()` helper from `src/lib/utils.ts` (clsx + tailwind-merge) — all rn-reusables components use this
- `@/` alias in tsconfig maps to `./src/*` — keep path aliases consistent
- All rn-reusables component files go in `src/components/ui/` — you own them, edit directly
- `components.json` in root: defines styling library (nativewind), aliases, and Tailwind config path
- `tailwind.config.js` content globs: `['./src/app/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}']` (note `src/` prefix for SDK 55)
- Root layout: `<View className="dark">` + `<ThemeProvider>` + `<Stack>` + `<PortalHost />` — use `nativewind`'s `useColorScheme()`
- NativeWind dark mode: add `dark` class to root element via `useColorScheme()` from nativewind (not react-native)
- `darkMode: 'class'` in tailwind.config.js (not 'media') — controlled via CSS class on root
- `react-native-reusables doctor` (rn-reusables CLI) shows false positive issues with nativewind v4 + SDK 55 — bundle export succeeds regardless. The warnings about CSS variables, babel config, and inlineRem are due to version mismatch between the latest CLI and our setup. Ignore them if `npx expo export` works
- `expo-doctor` (npx expo-doctor, NOT expo doctor) correctly shows 17/17 checks passing

---

### Sprint 1 — Database + Storage Foundation
> **Goal:** SQLite schema created, MMKV configured, SecureStore wrapper ready. Can programmatically create/read conversations and messages.
> **Duration:** ~2 hours

#### Tasks
- [x] **1.1** Create SQLite schema module (`src/lib/db/schema.ts`)
  - Tables: conversations, messages (as defined above)
  - Migration function that runs on app start
  - Use `expo-sqlite` synchronous API
- [x] **1.2** Create conversation CRUD (`src/lib/db/conversations.ts`)
  - `createConversation(title, model, systemPrompt) → id`
  - `getConversations() → Conversation[]` (ordered by updated_at DESC)
  - `getConversation(id) → Conversation`
  - `updateConversation(id, fields)`
  - `deleteConversation(id)` (cascade deletes messages)
- [x] **1.3** Create message CRUD (`src/lib/db/messages.ts`)
  - `addMessage(conversationId, role, content, model) → id`
  - `getMessages(conversationId) → Message[]` (ordered by created_at ASC)
  - `updateMessage(id, fields)` (for streaming completion)
  - `deleteMessage(id)`
- [x] **1.4** Create MMKV storage wrapper (`src/lib/storage/mmkv.ts`)
  - Instance creation with encryption key
  - Typed getters/setters: `getTheme()`, `setTheme()`, `getLastModel()`, etc.
- [x] **1.5** Create SecureStore wrapper (`src/lib/storage/secure.ts`)
  - `saveApiKey(provider, key)`
  - `getApiKey(provider) → string | null`
  - `deleteApiKey(provider)`
  - `hasApiKey(provider) → boolean`
- [x] **1.6** Create TypeScript types (`src/types/`)
  - `Conversation`, `Message`, `Provider`, `Model` interfaces
  - Message roles, statuses as union types
- [x] **1.7** Verify: write a test screen that creates a conversation, adds messages, reads them back
  - Temporary button on index.tsx that runs CRUD and logs results
  - Confirm data persists across app restarts

#### How to Test Sprint 1
```
✅ App boots, SQLite tables created
✅ CRUD: create → add messages → read → update → delete
✅ Storage (AsyncStorage): save/load theme, lastModel, onboarding
✅ SecureStore: save key → read key → delete key
✅ UUID: conversations and messages get valid UUIDs
✅ Persistence: data survives app restart
```

#### 📗 Things Learned
- `expo-sqlite` v55 exports `openDatabaseSync` (not `openDatabase`), returns `SQLiteDatabase` object
- `SQLiteDatabase` sync methods: `runSync`, `getFirstSync`, `getAllSync` with `SQLiteBindParams` or variadic
- SecureStore uses `setItemAsync`/`getItemAsync`/`deleteItemAsync` (not `setAsync`)
- `react-native-mmkv` v4 requires `react-native-nitro-modules` + TurboModules — not compatible with Expo autolinking
- `react-native-mmkv` v3 requires TurboModules (new arch) — same issue
- `react-native-mmkv` v2 is the last version compatible with old bridge architecture
- Even v2 failed to autolink properly with Expo prebuild — fallback to `@react-native-async-storage/async-storage` works
- `uuid` requires `react-native-get-random-values` polyfill imported BEFORE the first `import { v4 as uuidv4 }`
- Expo SDK 55 has web-specific issues with `expo-sqlite` (wa-sqlite.wasm) but Android works fine

#### 📕 Mistakes Made
- Tried MMKV v4 (needs nitro-modules) → downgraded to v3 → requires TurboModules → downgraded to v2 → autolinking broken
- Forgot to import `react-native-get-random-values` polyfill — uuid generated sync crypto error at runtime

#### 📘 Things to Remember
- expo-sqlite in SDK 55 uses the new synchronous API — don't use the legacy async one
- Never store API keys in MMKV or AsyncStorage — always SecureStore
- Use `uuid` for IDs, not auto-increment — better for future sync
- Foreign key ON DELETE CASCADE requires `PRAGMA foreign_keys = ON` at connection time
- `react-native-mmkv` (community package) does not autolink properly with Expo prebuild — fall back to AsyncStorage for settings
- expo-sqlite `openDatabaseSync(DB_NAME)` stores DB at a path managed by expo-sqlite — don't hardcode paths
- Import `react-native-get-random-values` at the top of the entry file before any uuid usage

---

### Sprint 2 — Streaming Engine + Provider Abstraction
> **Goal:** Can send a message to OpenRouter and receive streaming tokens. Raw console output, no UI yet.
> **Duration:** ~3 hours

#### Tasks
- [x] **2.1** Create provider interface (`src/lib/providers/types.ts`)
  ```typescript
  interface StreamResponse {
    abort: () => void;
  }
  interface AIProvider {
    id: string;
    name: string;
    stream(
      messages: Message[],
      config: StreamConfig,
      onContent: (token: string) => void,
      onReasoning: (token: string) => void,
      onDone: () => void,
      onError: (error: Error) => void
    ): ReasoningStreamResponse;
    listModels(apiKey: string): Promise<Model[]>;
    validateKey(apiKey: string): Promise<boolean>;
  }
  ```
- [x] **2.2** Create SSE parser (`src/lib/streaming/sse-parser.ts`)
  - Parse raw text chunks into SSE events
  - Handle partial lines (chunk may split mid-line)
  - Buffer management: accumulate until newline
  - Extract `data:` field, skip comments/empty lines
  - Detect `[DONE]` signal
  - Handle `reasoning_details` array for OpenRouter thinking models
- [x] **2.3** Create stream wrapper (`src/lib/streaming/stream.ts`)
  - `streamCompletion(url, headers, body, onContent, onReasoning, onDone, onError)`
  - Uses native `fetch` (expo/fetch in SDK 55 supports ReadableStream)
  - AbortController integration
  - Error handling: network, 401, 429, 500
  - `response.body` null fallback - reads entire body as text and parses SSE
- [x] **2.4** Create OpenRouter provider (`src/lib/providers/openrouter.ts`)
  - Implements `AIProvider` interface
  - `stream()`: calls `/api/v1/chat/completions` with `stream: true`
  - `listModels()`: calls `GET /api/v1/models` → returns parsed model list
  - `validateKey()`: calls models endpoint, checks for 200
  - Headers: Authorization, HTTP-Referer, X-Title
- [x] **2.5** Create provider registry (`src/lib/providers/registry.ts`)
  - Map of provider ID → AIProvider instance
  - `getProvider(id)` → provider
  - Start with just OpenRouter, extensible for future providers
- [x] **2.6** Create Zustand chat store (`src/stores/chat-store.ts`)
  - State: `streamingMessageId`, `streamingContent`, `isStreaming`, `error`
  - Actions: `startStreaming()`, `appendToken(token)`, `stopStreaming()`, `cancelStreaming()`
  - Selector: `useStreamingContent(messageId)` — only re-renders the active bubble
- [x] **2.7** Verify: test screen with hardcoded API key
  - Text input for API key + "Test Stream" button
  - Sends "Hello, who are you?" to OpenRouter
  - Tokens appear in real-time in a Text component
  - Cancel button works mid-stream
  - Error states shown (bad key, network error)
  - Reasoning tokens displayed separately for thinking models
  - Implements `AIProvider` interface
  - `stream()`: calls `/api/v1/chat/completions` with `stream: true`
  - `listModels()`: calls `GET /api/v1/models` → returns parsed model list
  - `validateKey()`: calls models endpoint, checks for 200
  - Headers: Authorization, HTTP-Referer, X-Title
- [] **2.5** Create provider registry (`src/lib/providers/registry.ts`)
  - Map of provider ID → AIProvider instance
  - `getProvider(id)` → provider
  - Start with just OpenRouter, extensible for future providers
- [] **2.6** Create Zustand chat store (`src/stores/chat-store.ts`)
  - State: `streamingMessageId`, `streamingContent`, `isStreaming`, `error`
  - Actions: `startStreaming()`, `appendToken(token)`, `stopStreaming()`, `cancelStreaming()`
  - Selector: `useStreamingContent(messageId)` — only re-renders the active bubble
- [] **2.7** Verify: test screen with hardcoded API key
  - Text input for API key + "Test Stream" button
  - Sends "Hello, who are you?" to OpenRouter
  - Tokens appear in real-time in a Text component
  - Cancel button works mid-stream
  - Error states shown (bad key, network error)

#### 📗 Things Learned
- Streaming works but requires careful handling of chunked/multi-line SSE events
- Some models (free tier) send metadata chunks without content - must skip empty tokens
- OpenRouter sends keepalive comments `: OPENROUTER PROCESSING` that must be ignored
- `response.body` can be null even on 200 status - need fallback to read body as text
- Models like Gemma send `delta.reasoning` field instead of `delta.content` - handle both
- AsyncIterator pattern needed for bridging async generators to ReadableStream reader interface
- OpenRouter thinking models (gemini-2.0-flash-thinking-exp) send reasoning in `reasoning_details` array, separate from content
- `reasoning_details` contains `reasoning.text` and `reasoning.summary` types with actual thinking content
- expo-sqlite web build fails due to WASM worker import - mock with `resolveRequest` in metro.config.js

#### 📕 Mistakes Made
- Initially assumed `response.body` would always be present on 200 response - it wasn't
- Didn't handle empty content tokens initially - caused infinite loop in reader
- SSE parser wasn't stripping "data: " prefix properly in fallback path
- Used `tokenIterator.next()` on AsyncIterable instead of getting async iterator first
- Model IDs need `:free` suffix for OpenRouter free tier models

#### How to Test Sprint 2
```
✅ Enter OpenRouter API key → tap "Test" → streaming tokens appear word-by-word
✅ Cancel mid-stream → streaming stops, partial text preserved
✅ Bad API key → clear error message shown
✅ No network → clear error message shown
✅ listModels() returns array of model objects with id, name, pricing
✅ SSE parser handles chunked/split lines correctly
✅ Works on Android
✅ OpenRouter free models require :free suffix
✅ Reasoning tokens (from thinking models) displayed separately
```

---

### Sprint 3 — Onboarding + Key Management (REDO — Nova Design)

#### 📕 Mistakes Made
- (fill after completing)

#### 📘 Things to Remember
- expo/fetch in SDK 55 supports ReadableStream natively — no polyfill needed
- SSE chunks can split mid-line — MUST buffer partial lines
- OpenRouter requires `HTTP-Referer` header for ranking (optional but good practice)
- AbortController.abort() causes fetch to throw AbortError — catch it specifically
- TextDecoder must be created once outside the loop, not per-chunk
- OpenRouter model IDs use `provider/model` format: `openai/gpt-4o`, `anthropic/claude-3.5-sonnet`
- Rate limit errors (429) should show "rate limited, try again in X seconds"
- On Android, expo/fetch handles ReadableStream.
- Some free models may have rate limits or upstream issues — handle gracefully
- OpenRouter may return "OPENROUTER PROCESSING" keepalive comments — skip these in parsing
- response.body may be null on certain error responses — handle as fallback case
- Some models send reasoning content in `delta.reasoning` field — extract that too for content
- **SQLite async rule**: tokens go to Zustand only during streaming — never call synchronous SQLite `UPDATE` on every token. Only write to SQLite on `[DONE]`, cancel, or error. Status-only updates (`UPDATE messages SET status=?`) should also be done async via `runAsync`, not `runSync`, to avoid blocking the JS thread during stream bursts

---
## Sprints 3–8 (continued from plan.md)

### Sprint 3 — Onboarding + Key Management (REDO — Nova Design)
> **Goal:** Redo Sprint 3 UI to match Nova design language. Preserve all working logic (SecureStore, validation, biometric, MMKV). Only the UI layer changes.
> **Duration:** ~3 hours
> **Design refs:** `generated designs/onboarding_api_key_setup/`, `generated designs/onboarding_success_state/`, `generated designs/onboarding_error_state/`, `generated designs/api_key_management/`

#### Pre-redo: Cleanup
- [x] **3.0a** Add additional rn-reusables components needed for new designs
  - `pnpm dlx @react-native-reusables/cli@latest add avatar badge card dialog switch`
  - Also install `lucide-react-native`: `pnpm add lucide-react-native`
- [x] **3.0b** Verify `global.css` Nova tokens are complete (set in Sprint 0)
  - All semantic tokens must be present: `--background`, `--card`, `--muted`, `--border`, `--foreground`, `--muted-foreground`, `--destructive`
  - Added Nova surface hierarchy tokens: `--surface`, `--surface-container-*`, `--on-surface`, `--on-surface-variant`, etc.
  - No color accents — success states use `--foreground` (white) with a checkmark icon, not green
  - Reference: `designs/master-design-language.md` → Color System

#### Tasks
- [x] **3.1** ~~REDO~~ Rebuild onboarding screen (`src/app/onboarding.tsx`)
  - **Visual ref:** `generated designs/onboarding_api_key_setup/screen.png` + `code.html`
  - Keep existing validation logic, SecureStore save, router redirect — only replace JSX/styles
  - Implement per the generated design using rn-reusables components from `src/components/ui/`
  - Icons: `Sparkles`, `ClipboardPaste`, `Check`, `AlertTriangle` from `lucide-react-native`
  - Error state: red border on input + error text below (ref: `generated designs/onboarding_error_state/`)
  - Success state: high-contrast white/foreground — no green (ref: `generated designs/onboarding_success_state/`)
- [x] **3.2** ~~KEEP~~ Root layout redirect logic — updated to check for API key and redirect to/from onboarding
- [x] **3.3** ~~KEEP~~ Biometric lock — upgrade security check
  - Add `getEnrolledLevelAsync()` to enforce Class 3 (Strong) biometrics before allowing access
  - Provide device passcode as fallback if Class 3 not available
  - Logic-only change, no UI update needed
  - Created `src/lib/auth/biometric.ts` with `getBiometricStatus()`, `authenticateWithBiometric()`, `canUseBiometricLock()`
- [x] **3.4** ~~KEEP~~ Settings store — created `src/stores/settings-store.ts` with Zustand store using dynamic imports to avoid Metro bundling issues
- [x] **3.5** ~~REDO~~ Rebuild API key management screen (`src/app/settings/api-keys.tsx`)
  - **Visual ref:** `generated designs/api_key_management/screen.png` + `code.html`
  - New route: dedicated `settings/api-keys.tsx`
  - Implement per the generated design using rn-reusables components from `src/components/ui/`
- [x] **3.6** Verify: fresh install → onboarding → key saved → app loads (same checks as v1)

#### v1 Learnings (preserved from first attempt)
- Settings store uses AsyncStorage (via MMKV wrapper)
- Router redirect with dynamic routes needs `as any` casting
- Can't retrieve masked key back from SecureStore — mask on display only
- MMKV module resolution needs barrel export file
- expo-local-authentication needs `expo-dev-client`
- AppState 'active' event fires on foreground — use for biometric trigger
- Mask API keys in UI: show first 4 + last 4 chars only

#### Sprint 3 Learnings
- **Icon naming differs** between web lucide and lucide-react-native: `ArrowForward` → `ArrowRight`, `AlertTriangle` → `TriangleAlert`
- lucide-react-native icons must be checked against the actual package exports (use `grep "declare const" node_modules/lucide-react-native/dist/lucide-react-native.d.ts` to find valid names)
- `lucide-react-native` requires `react-native-svg` as peer dependency (already installed via lucide-react-native's deps)

---

### Sprint 4 — Chat UI Core (REDO — Nova Design, Drawer Navigation)
> **Goal:** Full ChatGPT/Claude-style chat-first interface. No tab bar. Drawer for conversations. Chat is the entire app.
> **Duration:** ~5 hours (biggest sprint — full navigation paradigm change)
> **Design refs:** `generated designs/chat_empty_state/`, `generated designs/chat_active_conversation/`, `generated designs/conversation_drawer/`, `generated designs/model_picker_bottom_sheet_*/`

#### Pre-redo: Route Cleanup
- [x] **4.0a** Delete the `(tabs)/` folder and its contents (`src/app/(tabs)/_layout.tsx`, `index.tsx`, `settings.tsx`)
- [x] **4.0b** Delete old tab-related components (`src/components/app-tabs.tsx`, `app-tabs.web.tsx`, `web-badge.tsx`)
- [x] **4.0c** Move chat screen to root: create `src/app/index.tsx` as the new chat home (replaces tab index)
- [x] **4.0d** Create `src/app/settings.tsx` as a standalone route (pushed from drawer, not a tab)
- [x] **4.0e** Update `src/app/_layout.tsx` — remove tab navigator, set up drawer-compatible root layout

#### Tasks
- [x] **4.1** Create root layout with drawer (`src/app/_layout.tsx`)
  - **Visual ref:** `generated designs/conversation_drawer/screen.png` + `code.html`
  - Use `react-native-drawer-layout` (rn-reusables does not ship a Drawer — this is the correct primitive)
  - Left-edge drawer (85% screen width), swipe-to-open + hamburger button
  - Root layout wraps entire app in drawer provider
  - Drawer content = `ConversationDrawer` component
  - Main content = chat screen (full-screen, no chrome)
- [x] **4.2** Create ConversationDrawer (`src/components/navigation/ConversationDrawer.tsx`)
  - **Visual ref:** `generated designs/conversation_drawer/screen.png` + `code.html`
  - Implement per the generated design using rn-reusables components from `src/components/ui/`
  - Icons from `lucide-react-native`
  - Long-press row → delete with confirmation (ref: `generated designs/delete_confirmation_dialog/`)
- [x] **4.3** Rebuild MessageBubble (`src/components/chat/MessageBubble.tsx`)
  - **Visual ref:** `generated designs/chat_active_conversation/screen.png` + `code.html`
  - Implement per the generated design using rn-reusables components from `src/components/ui/`
  - Streaming state: blinking `|` cursor via `Animated.loop` opacity animation
- [x] **4.4** Rebuild MessageList (`src/components/chat/MessageList.tsx`)
  - FlatList with flexGrow + justifyContent flex-end (not inverted — avoids RN 0.83 edge cases)
  - Auto-scroll on new messages and during streaming via zustand subscription
  - `bg-background` (#09090B)
- [x] **4.5** Rebuild InputBar (`src/components/chat/InputBar.tsx`)
  - **Visual ref:** `generated designs/chat_empty_state/screen.png` + `code.html` (bottom section)
  - Implement per the generated design using rn-reusables components from `src/components/ui/`
  - Multiline auto-grow TextInput, send/stop button with scale animation
- [x] **4.6** Create ModelPill (`src/components/chat/ModelPill.tsx`)
  - **Visual ref:** `generated designs/chat_empty_state/screen.png` + `code.html` (top center)
  - Implement per the generated design using rn-reusables components from `src/components/ui/`
  - Tap → opens model picker bottom sheet
- [x] **4.7** Create EmptyState (`src/components/chat/EmptyState.tsx`)
  - **Visual ref:** `generated designs/chat_empty_state/screen.png` + `code.html`
  - Implement per the generated design using rn-reusables components from `src/components/ui/`
  - Tap suggestion chip → sends message directly
- [x] **4.8** Create chat screen (`src/app/index.tsx` + `src/app/chat/[id].tsx`)
  - Chat top bar: `lucide Menu` (opens drawer) + ModelPill (center) + `lucide PenSquare` (new chat)
  - No conversation → show EmptyState
  - Has messages → show MessageList + InputBar
  - Wire send flow: save user msg → stream → tokens to store → bubble renders → save assistant msg
  - Cancel: abort stream, save partial
  - `chat/[id].tsx` loads specific conversation from SQLite
- [x] **4.9** Rebuild model picker (`src/components/chat/ModelPicker.tsx`)
  - **Visual ref:** `generated designs/model_picker_bottom_sheet_1/screen.png` + `code.html`
  - Use `@gorhom/bottom-sheet` v5 (Fabric-compatible) as the sheet primitive
  - Implement content per the generated design using rn-reusables components from `src/components/ui/`
- [x] **4.10** Create "New Chat" flow
  - Create in SQLite → navigate to `chat/[id]`
  - Auto-title: first user message truncated to 50 chars
- [ ] **4.11** Verify: full chat loop with new design

#### How to Test Sprint 4
```
✅ App opens directly to chat (no tabs visible)
✅ Swipe right → conversation drawer opens
✅ Tap ☰ → drawer opens
✅ Drawer shows pinned + recent conversations grouped by date
✅ Tap "New" in drawer → new chat with empty state + suggestion chips
✅ Tap suggestion chip → sends message
✅ Model pill shows current model, tap → bottom sheet picker
✅ Select different model → pill updates
✅ Type message → send → user bubble (right, #18181B bg)
✅ Streaming tokens → assistant text (left, no bg) with blinking cursor
✅ Stop button appears during streaming → tap → saves partial
✅ Tap conversation in drawer → loads with all messages
✅ Long-press conversation → delete confirmation
✅ Settings accessible from drawer footer
✅ Keyboard doesn't cover input
✅ All colors match Nova design (monochromatic, no color accents)
```

#### 📗 Things Learned
- `react-native-drawer-layout` exports `{ Drawer }` (named), not a default export — import as `import { Drawer } from 'react-native-drawer-layout'`
- Drawer component API: uses `renderDrawerContent` (not `renderNavigationView`), `onOpen` + `onClose` + `open` (all required), `drawerStyle` for width/bg (not separate props)
- FlatList `inverted` has edge cases on RN 0.83 — using `contentContainerStyle: { flexGrow: 1, justifyContent: 'flex-end' }` + `scrollToEnd` is more reliable
- `@gorhom/bottom-sheet@5` works with Fabric/New Architecture on RN 0.83 — requires `GestureHandlerRootView` at root
- `Animated.loop` with `Animated.sequence` of `Animated.timing` is the correct way to do blink cursor in RN (no CSS keyframes)
- Surface color tokens must be defined in both `global.css` AND `tailwind.config.js` — CSS defines the values, tailwind maps them to class names
- `react-native-keyboard-controller` installed but not wired yet — InputBar uses native TextInput multiline which handles keyboard reasonably well on Android

#### 📕 Mistakes Made
- Initially used default import for `react-native-drawer-layout` — it only has named exports
- First attempt used `renderNavigationView` prop (old API) — correct prop is `renderDrawerContent`
- Removed `onOpen` prop thinking it was optional — it's required by the Drawer component

#### 📘 Things to Remember
- Don't use `inverted` FlatList — use `flexGrow + justifyContent: flex-end` + `scrollToEnd` for chat
- Use `react-native-keyboard-controller` for keyboard handling — `KeyboardAvoidingView` is unreliable on Android edge-to-edge displays
- Blinking cursor: `Animated.loop` with step-end easing on opacity
- Zustand selector for streaming message — don't re-render entire list
- Model list from OpenRouter can be 200+ — cache in MMKV
- Conversation title: first 50 chars of first user message, strip newlines
- Drawer: use `react-native-drawer-layout` — correct primitive for swipe gesture, not an rn-reusables component
- `@gorhom/bottom-sheet` **must be v5** for RN 0.83 New Architecture — v4 crashes on Fabric
- All styling via NativeWind semantic class names — never raw hex in components
- `GestureHandlerRootView` MUST wrap the entire app at the root — both drawer and bottom sheet depend on it
- ChatScreen component shared between `index.tsx` (new chat) and `chat/[id].tsx` (existing chat) — avoids duplication

---

### Sprint 5 — Markdown Rendering
> **Goal:** Assistant responses render full markdown: headings, bold, italic, code blocks with syntax highlighting, lists, tables, links.
> **Duration:** ~2 hours
> **Design refs:** `generated designs/markdown_rendering_showcase/`

#### Tasks
- [x] **5.1** Install markdown renderer
  - `npm install react-native-marked`
  - `react-native-markdown-display` is unmaintained and legacy-arch — do not use
  - `react-native-marked` is Fabric-native and renders without blocking the JS thread
  - Must support: headings, bold, italic, code (inline + block), lists, tables, links, blockquotes
- [x] **5.2** Add syntax highlighting for code blocks
  - `npm install react-native-syntax-highlighter`
  - Dark theme code blocks (monokai/dracula style)
  - Language label at top of code block
  - Copy button on code blocks
- [x] **5.3** Style markdown to match generated design
  - **Visual ref:** `generated designs/markdown_rendering_showcase/screen.png` + `code.html`
  - Implement per the generated design using rn-reusables components from `src/components/ui/` where applicable
  - Syntax colors: keywords (#C084FC), strings (#86EFAC), comments (#71717A), functions (#93C5FD)
- [x] **5.4** Handle streaming + markdown
  - Markdown renders progressively as tokens arrive
  - Incomplete markdown (unclosed code block) handled gracefully
  - No flicker during re-renders
- [x] **5.5** Copy message button
  - Long-press or tap copy icon → copy raw markdown to clipboard
  - Toast notification "Copied to clipboard" (ref: `generated designs/toast_notifications_showcase/`)
  - Toast: white pill floating above input bar, `lucide Check` + text, 2s auto-dismiss
- [ ] **5.6** Verify: send prompts that produce complex markdown

#### How to Test Sprint 5
```
✅ Ask "Write a Python function to sort a list" → code block renders with syntax highlighting
✅ Ask "Create a comparison table" → table renders with borders
✅ Ask "Explain X with bullet points" → lists render correctly
✅ Code block has copy button → copies code to clipboard
✅ Long code blocks scroll horizontally
✅ Markdown renders progressively during streaming without flicker
✅ Works on Android
```

#### 📗 Things Learned
- `react-native-marked` exports `useMarkdown`, which is a better fit inside chat `FlatList` rows than nesting the package's own `Markdown` FlatList component.
- `react-native-marked` theme spacing keys are only `xs`, `s`, `m`, and `l`.
- `react-native-syntax-highlighter` does not ship TypeScript declarations, so the app needs a small local module declaration.
- Streaming fenced code blocks render more gracefully when the displayed markdown temporarily appends the missing closing fence. The raw stored/copied message remains unchanged.

#### 📕 Mistakes Made
- `expo lint` auto-installed ESLint on first run, then needed to be run again after the package install completed before it could resolve `eslint`.

#### 📘 Things to Remember
- Streaming markdown will have incomplete syntax mid-stream — renderer must handle gracefully
- `react-native-marked` renders on a background thread — do not use `react-native-markdown-display` (legacy arch, blocks UI thread)
- Code copy should copy raw code, not the rendered text
- Syntax highlighter can be heavy — lazy-load it or use a lighter alternative
- Test with real LLM responses — they often have edge cases (nested lists, mixed formatting)

---

### Sprint 6 — System Prompts + Conversation Search
> **Goal:** Users can set system prompts (presets), search across all conversations.
> **Duration:** ~2 hours
> **Design refs:** `generated designs/system_prompt_editor/`, `generated designs/search_results_*/`

#### Tasks
- [ ] **6.1** System prompt editor (`src/app/settings/system-prompts.tsx`)
  - **Visual ref:** `generated designs/system_prompt_editor/screen.png` + `code.html`
  - Top bar: ArrowLeft + "System Prompt" + "Save" text button
  - Multiline text area: `bg-muted`, 12px radius, 1px `border-border`
  - Per-conversation system prompt (saved in conversations table)
  - Info bar: "Applied to this conversation only" with `lucide Info`
  - Actions: "Save as Preset" + "Reset to Default" ghost buttons
- [ ] **6.2** System prompt presets
  - Horizontal scroll of pill chips: selected (`bg-foreground`, `text-background`) vs unselected (`bg-muted`, `text-muted-foreground`)
  - Built-in: "Default", "Code Helper", "Creative Writer", "Translator"
  - "+ Custom" pill to add new preset
  - Save custom presets (stored in SQLite or MMKV)
- [ ] **6.3** Import/export presets as JSON
  - Export: share as JSON file (expo-sharing)
  - Import: pick JSON file → parse → add to presets
- [ ] **6.4** Conversation search
  - **Visual ref:** `generated designs/search_results_1/screen.png` + `code.html`
  - Full-screen search overlay: ArrowLeft + full-width input + `lucide X` clear
  - Full-text search across message content (SQLite LIKE or FTS5)
  - Results: conversation title (14sp `text-foreground`) + matched message preview (13sp `text-muted-foreground`) with keyword in bold white
  - Tap result → navigate to chat, scroll to matched message
- [ ] **6.5** Verify: search and system prompts work

#### How to Test Sprint 6
```
✅ Set system prompt → new messages respect the prompt
✅ Save custom preset → appears in preset list
✅ Select preset → system prompt auto-fills
✅ Search "python" → finds conversations with Python content
✅ Tap search result → navigates to correct chat and message
✅ Export presets → valid JSON file generated
```

#### 📗 Things Learned
- (fill after completing)

#### 📕 Mistakes Made
- (fill after completing)

#### 📘 Things to Remember
- System prompt goes as first message with `role: 'system'` in the messages array sent to API
- SQLite FTS5 is powerful but adds complexity — start with LIKE, upgrade to FTS5 if search is slow
- Search should be debounced (300ms) to avoid querying on every keystroke
- System prompt presets are a portfolio differentiator — make the UI polished

---

### Sprint 7 — Edit & Resend + Polish
> **Goal:** Tap any user message to edit and replay from that point. UI animations and micro-interactions polished.
> **Duration:** ~2 hours
> **Design refs:** `generated designs/message_actions_menu/`, `generated designs/message_edit_mode/`, `generated designs/theme_picker/`, `generated designs/error_state*/`, `generated designs/offline_state*/`

#### Tasks
- [ ] **7.1** Edit & resend functionality
  - **Visual ref:** `generated designs/message_edit_mode/screen.png` + `code.html`
  - Tap user bubble → enters edit mode (editable text area with focus border `border-focus`)
  - Cancel/Send button row below edit area
  - Messages below edited msg dimmed (`text-muted-foreground`) with "Will be replaced" label
  - On save: delete all messages after this point, re-send edited message
- [ ] **7.2** Message actions (per-bubble)
  - **Visual ref:** `generated designs/message_actions_menu/screen.png` + `code.html`
  - Long-press → floating context menu: `bg-card`, 12px radius, 1px `border-border`
  - Items: `lucide Copy` + "Copy", `lucide Pencil` + "Edit & Resend" (user only), `lucide RefreshCw` + "Regenerate" (assistant only), `lucide Trash2` + "Delete" (destructive red)
  - Background dimmed with #000000 40% overlay
- [ ] **7.3** UI polish
  - Message appear animation (fade-in + slide-up, 150ms)
  - Send button press animation (scale)
  - Loading states (skeleton screens with `bg-muted` pulsing blocks)
- [ ] **7.4** Haptic feedback
  - `npx expo install expo-haptics`
  - Light impact on send button press
  - Notification haptic on successful API key add (Sprint 3 can be backfilled here)
  - Light impact on suggestion chip tap
  - No haptics during streaming — too frequent, feels wrong
- [ ] **7.5** Adaptive themes
  - **Visual ref:** `generated designs/theme_picker/screen.png` + `code.html`
  - Theme picker: bottom sheet with 3 visual preview cards (Dark/Light/OLED)
  - Dark (default): Nova palette (`#09090B` bg, `#18181B` surfaces)
  - Light: inverted Nova (`#FFFFFF` bg, `#F4F4F5` surfaces)
  - OLED: pure `#000000` backgrounds
  - System preference toggle
  - Update `global.css` CSS variables per theme
- [ ] **7.6** Error & offline states
  - **Visual ref:** `generated designs/error_state/screen.png` + `code.html`, `generated designs/offline_state_banner/screen.png` + `code.html`
  - Error bubble: `bg-muted` with subtle red border, `lucide AlertTriangle`, retry pill button
  - Offline banner: `bg-muted` bar below status bar, `lucide WifiOff` + "No internet connection"
- [ ] **7.7** Verify: edit, theme switching, haptics, error handling

#### How to Test Sprint 7
```
✅ Send message → light haptic fires
✅ Tap suggestion chip → light haptic fires
✅ Long-press message → context menu appears over dimmed bg
✅ Tap "Edit & Resend" → inline edit mode, downstream msgs dimmed
✅ Save edit → old msgs deleted, new response streams
✅ Regenerate → new response replaces old
✅ Copy → toast "Copied to clipboard"
✅ Theme picker → Dark/Light/OLED preview cards
✅ Toggle theme → smooth transition, all components restyle
✅ OLED → pure black backgrounds
✅ API error → error bubble with retry button
✅ No internet → offline banner, send disabled
```

#### 📘 Things to Remember
- Edit & resend: `DELETE WHERE conversation_id = ? AND created_at > ?`
- Regenerate = delete last assistant msg + re-stream with same user msg
- Theme switching: NativeWind `dark:` prefix + CSS variables in `global.css`
- Error bubble: subtle red border (`border-destructive/30`), not full red bg
- Offline detection: `NetInfo` from `@react-native-community/netinfo`

---

### Sprint 8 — Multi-Provider Support + Final Polish
> **Goal:** Add Gemini and Anthropic as additional providers. Final bug fixes, performance optimization, portfolio-ready.
> **Duration:** ~3 hours
> **Design refs:** `generated designs/settings/`, `generated designs/settings_screen/`, `generated designs/delete_confirmation_dialog/`

#### Tasks
- [x] **8.1** Add Gemini provider (`src/lib/providers/gemini.ts`)
  - Uses `@google/generative-ai` SDK (has RN-compatible streaming)
  - Implements same AIProvider interface
  - Direct API calls with user's Gemini API key
- [x] **8.2** Add Anthropic provider (`src/lib/providers/anthropic.ts`)
  - Uses OpenAI-compatible format OR Anthropic SDK
  - SSE streaming (same parser as OpenRouter)
  - Handle Anthropic-specific response format (`content_block_delta`)
- [x] **8.3** Update onboarding for multiple providers
  - Provider selection: OpenRouter, Gemini, Anthropic
  - Can add multiple keys
  - Model picker groups by provider
- [x] **8.4** Update model picker
  - Tabs or sections per provider
  - Show which providers have active keys
  - "Add key" inline if provider has no key
- [x] **8.5** Performance optimization
  - Replace FlatList with `@shopify/flash-list` for chat history
  - Memoize message bubbles (React.memo)
  - Profile and fix any jank during streaming
  - **Note:** FlashList requires `npx expo prebuild` to generate native Android code before `AutoLayoutView` native component is registered. Dev client (`expo start`) without prebuild will crash with `View config not found for component AutoLayoutView`. After prebuild, FlashList works correctly.
- [x] **8.6** Error states & edge cases
  - No internet → show offline banner
  - API error → show error bubble with "Retry" button
  - Very long messages → virtualized rendering
  - App backgrounded during stream → handle gracefully
- [x] **8.7** App icon + splash screen
  - Generate Medha app icon (use generate_image tool)
  - Configure in app.json
  - Splash screen with app logo
- [x] **8.8** README.md for GitHub
  - Project description, screenshots, setup instructions
  - Feature list, tech stack, architecture diagram
  - License (MIT)
- [x] **8.9** Final verification pass

#### How to Test Sprint 8
```
✅ Add Gemini key → can chat with Gemini models
✅ Add Anthropic key → can chat with Claude models
✅ Switch between providers mid-conversation → works
✅ Model picker shows all available providers
✅ FlashList: 100+ messages scroll smoothly (no jank)
✅ Offline → banner shown, retries when online
✅ App icon and splash screen display correctly
✅ README has screenshots and clear setup instructions
✅ Full flow: install → onboard → chat → switch models → search → edit → export
```

#### 📗 Things Learned
- (fill after completing)

#### 📕 Mistakes Made
- (fill after completing)

#### 📘 Things to Remember
- Gemini SDK streams differently than OpenAI — uses `generateContentStream()` not SSE
- Anthropic SSE uses `content_block_delta` events, not `choices[0].delta.content`
- FlashList requires `estimatedItemSize` — measure average message height
- App backgrounding on Android pauses JS thread — stream will break
- README screenshots sell the portfolio piece — make them high quality

---

## 🗓️ Sprint Summary Timeline

| Sprint | Focus | Duration | Cumulative |
|--------|-------|----------|------------|
| **0** | Scaffolding + rn-reusables setup | ~2h | 2h |
| **1** | Database + storage foundation | ~2h | 4h |
| **2** | Streaming engine + provider abstraction | ~3h | 7h |
| **3** | Onboarding + key management (REDO — Nova) | ~3h | 10h |
| **4** | Chat UI core (REDO — Nova, drawer nav) | ~5h | 15h |
| **5** | Markdown rendering | ~2h | 17h |
| **6** | System prompts + search | ~2h | 19h |
| **7** | Edit/resend + themes | ~2h | 21h |
| **8** | Multi-provider + polish + README | ~3h | 24h |
| **9** | Input enhancement (keyboard, voice, attachments) | ~8h | 32h |
| **10** | Thinking mode toggle | ~3h | 35h |
| **11** | Slash commands | ~2h | 37h |
| **12** | Tool calling architecture + web search | ~4h | 41h |
| **13** | Rules & instructions | ~2h | 43h |
| **14** | Persistent memory system (tool-based) | ~4h | 47h |
| **15** | MCP server support | ~6h | 53h |
| **16** | Skills system | ~4h | 57h |
| **17** | Custom apps (GPT-like personas) | ~6h | 63h |
| **18** | Token & cost estimator | ~3h | 66h |
| **19** | Document intelligence (PDF, DOCX, XLSX) | ~3h | 69h |
| **20** | Image generation & rich output | ~5h | 74h |
| **21** | Model capability badges | ~2h | 76h |

**Total: ~76 hours** (MVP at 24h + post-MVP features at 52h)

---

## 🔮 Future Sprints (Post-Sprint 21, Cool/Nice features)

These are not in scope for the current phase but documented for later (sprints 22+). Sprints 10–21 are fully detailed below.

---

### Sprint 10 — Thinking Mode Toggle
> **Goal:** User can explicitly enable/disable thinking (CoT) mode per conversation. When enabled, providers that support extended thinking (OpenRouter o1/o3, Gemini 2.5 thinking, Claude 3.7 extended thinking) send reasoning parameters. ThinkingBlock already renders — this sprint adds the control surface and provider-level opt-in.
> **Duration:** ~3 hours

#### Prerequisites
- ThinkingBlock component already exists (`src/components/chat/ThinkingBlock.tsx`) — renders reasoning when present
- SSE parser already handles `reasoning_details`, `delta.reasoning`, `<think>` tags, and Anthropic `thinking_delta` (`src/lib/streaming/sse-parser.ts`)
- Chat store already has `streamingReasoning` + `appendReasoningToken` (`src/stores/chat-store.ts`)

#### Tasks
- [x] **10.1** Add thinking mode state to settings store (`src/stores/settings-store.ts`)
  - New field: `thinkingMode: 'auto' | 'on' | 'off'` (default: `'auto'`)
  - `'auto'` — let provider decide (current behavior, no extra params)
  - `'on'` — explicitly request thinking/reasoning from the model
  - `'off'` — suppress thinking output (strip reasoning from display)
  - Persist to MMKV via `setThinkingMode()` / `getThinkingModeSync()`
- [x] **10.2** Add thinking mode toggle UI to chat top bar
  - New `ThinkingToggle` component (`src/components/chat/ThinkingToggle.tsx`)
  - Small pill next to ModelPill in the chat top bar: `lucide Brain` icon + label ("Auto" / "Think" / "Off")
  - Tap cycles through modes: auto → on → off → auto
  - Visual states: `auto` = `bg-muted` + `text-muted-foreground`, `on` = `bg-foreground` + `text-background`, `off` = `bg-muted` + dimmed icon
  - Light haptic on toggle
- [x] **10.3** Wire thinking mode into `StreamConfig` (`src/lib/providers/types.ts`)
  - Add `thinkingMode?: 'auto' | 'on' | 'off'` to `StreamConfig`
  - Pass from `ChatScreen.streamNewResponse()` into `provider.stream()`
- [x] **10.4** Update OpenRouter provider (`src/lib/providers/openrouter.ts`)
  - When `thinkingMode === 'on'`: add `reasoning: { effort: "high" }` to request body (OpenRouter reasoning param for o1/o3/thinking models)
  - When `thinkingMode === 'off'`: omit reasoning params, do NOT call `onReasoning` (swallow reasoning tokens)
  - `'auto'`: current behavior — no change
- [x] **10.5** Update Google AI provider (`src/lib/providers/google-ai.ts`)
  - When `thinkingMode === 'on'`: add `reasoning_effort: 'high'` to request body (OpenAI-compat param for Gemini 2.5)
  - When `thinkingMode === 'off'`: add `reasoning_effort: 'none'` to suppress thinking
  - `'auto'`: no reasoning_effort sent (model defaults)
- [x] **10.6** Update Anthropic provider (`src/lib/providers/anthropic.ts`)
  - When `thinkingMode === 'on'` and model supports it (claude-3.7-sonnet, claude-sonnet-4): set `thinking: { type: "enabled", budget_tokens: 8192 }` in request body
  - When `thinkingMode === 'off'`: omit thinking param entirely
  - `'auto'`: no thinking param (model defaults)
  - **Note**: Anthropic extended thinking requires `max_tokens` to be set and `temperature` must be 1.0 when thinking is enabled
- [x] **10.7** Update MiniMax provider (`src/lib/providers/minimax.ts`)
  - MiniMax M1 always returns reasoning — when `thinkingMode === 'off'`, swallow `onReasoning` tokens silently
- [x] **10.8** Add per-conversation thinking mode override
  - Add `thinking_mode TEXT` column to conversations table (migration in `schema.ts`)
  - When set on conversation, override global setting for that conversation
  - Accessible via long-press on ThinkingToggle → bottom sheet with "This conversation" / "Global default" options
- [x] **10.9** Verify: thinking mode toggle works across providers

#### How to Test Sprint 10
```
✅ ThinkingToggle pill visible in top bar next to ModelPill
✅ Tap cycles: Auto → Think → Off → Auto
✅ Think mode ON + Gemini 2.5 → ThinkingBlock appears with reasoning
✅ Think mode ON + Claude 3.7 → extended thinking tokens stream into ThinkingBlock
✅ Think mode ON + OpenRouter o3 → reasoning_details rendered
✅ Think mode OFF → no ThinkingBlock shown even for thinking-capable models
✅ Auto mode → same behavior as before (reasoning shown when model provides it)
✅ Per-conversation override persists across app restarts
✅ Setting persists in MMKV across app restarts
```

#### 📗 Things Learned
- Google AI OpenAI-compat endpoint uses `reasoning_effort` (not `thinkingConfig`/`thinkingBudget`) — matches OpenAI-compatible API param naming
- All four providers can use the same `StreamConfig` type signature instead of inline object types — cleaned up code duplication
- ThinkingMode type is defined in both `mmkv.ts` (for storage) and `types.ts` (for provider config) — the provider type re-exports to avoid circular deps
- Per-conversation thinking override uses nullable column — `null` means "use global default", cascading from `conversation.thinking_mode → settingsStore.thinkingMode`

#### 📕 Mistakes Made
- (none so far — awaiting verification)

#### 📘 Things to Remember
- Anthropic extended thinking requires `temperature: 1.0` — override user's temperature setting when thinking is enabled
- Gemini `reasoning_effort: 'none'` explicitly disables thinking; omitting the field lets model decide
- OpenRouter `reasoning.effort` values: `"low"`, `"medium"`, `"high"` — use `"high"` for explicit think mode
- MiniMax M1 always thinks — can't disable server-side, only suppress client-side display
- Per-conversation override is nullable — `null` means "use global default"
- All providers now accept `StreamConfig` type instead of inline config objects — keep consistent


---

### Sprint 11 — Slash Commands
> **Goal:** User types `/` in the input bar to see a list of quick-action commands. Commands transform the last message or prepend instructions before sending.
> **Duration:** ~2 hours

#### Tasks
- [x] **11.1** Define slash command registry (`src/lib/commands/registry.ts`)
  - Command interface:
    ```typescript
    interface SlashCommand {
      id: string;
      name: string;           // e.g. "summarize"
      label: string;          // e.g. "Summarize"
      description: string;    // e.g. "Summarize the conversation so far"
      icon: string;           // lucide icon name
      action: 'prepend' | 'wrap' | 'standalone';
      template: string;       // e.g. "Summarize the above conversation concisely:"
    }
    ```
  - Built-in commands:
    - `/summarize` — "Summarize the conversation so far" (standalone, sends template as user message)
    - `/translate [lang]` — "Translate the last response to {lang}" (standalone)
    - `/code` — "Write code for: {user input}" (prepend)
    - `/explain` — "Explain this simply: {user input}" (prepend)
    - `/fix` — "Fix the errors in this code: {user input}" (prepend)
    - `/longer` — "Expand on your last response with more detail" (standalone)
    - `/shorter` — "Make your last response more concise" (standalone)
- [x] **11.2** Create slash command picker (`src/components/chat/SlashCommandPicker.tsx`)
  - Appears as a floating list above InputBar when user types `/` as first character
  - Filters commands as user types (e.g., `/sum` filters to "Summarize")
  - Each row: `lucide` icon + command name (bold) + description (muted)
  - `bg-surface-container-low`, `border-outline-variant/20`, rounded-xl, max 5 visible rows
  - Tap command → auto-fill or execute
  - Dismiss: tap outside, backspace past `/`, or press escape
- [x] **11.3** Integrate picker with InputBar (`src/components/chat/InputBar.tsx`)
  - Detect `/` as first character in input → show SlashCommandPicker
  - On command select:
    - `'standalone'`: send template as message immediately, clear input
    - `'prepend'`: replace `/command` with template prefix, let user type the rest
    - `'wrap'`: wrap current input text with template
  - Filter commands by typing: `/su` → shows only "Summarize"
- [x] **11.4** Wire command execution into ChatScreen
  - Commands that reference "last response" pull `messages[messages.length - 1].content`
  - `/translate [lang]` extracts language arg from user input
  - Standalone commands skip the input bar and call `handleSend()` directly
- [x] **11.5** Custom slash commands
  - Settings screen: `src/app/settings/slash-commands.tsx`
  - Add custom commands with name, description, template, and behavior (standalone/prepend)
  - Enable/disable toggle per command (disabled commands hidden from picker)
  - Delete with confirmation dialog
  - Stored in AsyncStorage as JSON array (`StoredCustomCommand[]` in `mmkv.ts`)
  - Custom commands use `Zap` icon in picker; merged into registry via `listCommands()`
- [x] **11.6** Verify: slash commands work end-to-end

#### How to Test Sprint 11
```
✅ Type "/" → command picker appears above input bar
✅ Type "/sum" → filters to "Summarize"
✅ Tap "Summarize" → sends summary request as message
✅ Type "/translate Hindi" → sends translation request
✅ Type "/code " → input prefilled with "Write code for: "
✅ Backspace past "/" → picker dismisses
✅ Tap outside picker → dismisses
✅ Commands work during active conversation with message history
```

#### 📗 Things Learned
- Slash commands don't need their own execution path — they just transform text and call the same `onSend()` that InputBar already uses
- `parseSlashInput()` + `filterCommands()` + `resolveCommandText()` give clean separation: detection → filtering → resolution
- The picker dismisses naturally when the user types a space after a valid command (moves to arg-input mode) — no explicit dismiss logic needed for that case
- `keyboardShouldPersistTaps="always"` on the picker's ScrollView is critical — without it, tapping a command row dismisses the keyboard instead of triggering onPress

#### 📕 Mistakes Made
- (none — implementation was straightforward)

#### 📘 Things to Remember
- Slash commands are a UX convenience — they just prepend/transform text before sending to the same streaming pipeline
- Don't create a separate "command execution" path — reuse `handleSend()` with modified text
- Filter should be case-insensitive
- `/translate` needs arg parsing — split on first space after command name
- Picker must render above the keyboard (use absolute positioning relative to InputBar)

---

### Sprint 12 — Tool Calling Architecture + Web Search
> **Goal:** First tool integration. AI can search the web via function calling, display results inline, and cite sources. Establishes the tool architecture used by Sprint 14 (Memory), Sprint 15 (MCP), and Sprint 16 (Skills).
> **Duration:** ~4 hours

#### Tasks
- [x] **12.1** Define tool system types (`src/lib/tools/types.ts`)
  ```typescript
  interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, ToolParameter>;  // JSON Schema subset
    execute: (args: Record<string, unknown>) => Promise<ToolResult>;
  }
  interface ToolParameter {
    type: 'string' | 'number' | 'boolean';
    description: string;
    required?: boolean;
    enum?: string[];
  }
  interface ToolResult {
    content: string;           // markdown-formatted result for display
    raw?: unknown;             // raw data for AI context
    citations?: Citation[];    // source URLs
  }
  interface Citation { title: string; url: string; snippet?: string; }
  ```
- [x] **12.2** Create tool registry (`src/lib/tools/registry.ts`)
  - `registerTool(tool: ToolDefinition)`
  - `getTool(name: string) → ToolDefinition | null`
  - `listTools() → ToolDefinition[]`
  - `getToolSchemas() → OpenAI-format tool schemas` — converts to `{ type: 'function', function: { name, description, parameters } }[]`
- [x] **12.3** Implement web search tool (`src/lib/tools/web-search.ts`)
  - Uses DuckDuckGo HTML search (no API key needed) OR Serper API (if key configured)
  - Tool name: `web_search`, params: `{ query: string, num_results?: number }`
  - Parses HTML results into `Citation[]` with title, URL, snippet
  - Returns markdown-formatted results: numbered list with `[Title](url)` + snippet
  - Fallback: if DuckDuckGo blocked, use Serper (user provides key in settings)
- [x] **12.4** Add web search API key to settings (`src/app/settings/api-keys.tsx`)
  - Optional Serper API key field (free tier: 2500 queries/month)
  - Label: "Web Search (Serper)" — below existing provider keys
  - Stored in SecureStore like other API keys
- [x] **12.5** Wire tool calling into provider layer (`src/lib/providers/types.ts`)
  - Add `tools?: ToolDefinition[]` to `StreamConfig`
  - Add new callbacks to `AIProvider.stream()`:
    - `onToolCall?: (name: string, args: Record<string, unknown>) => void`
  - Each provider converts `ToolDefinition[]` to its native format:
    - OpenRouter/OpenAI: `tools` array with `type: 'function'`
    - Anthropic: `tools` array with `input_schema`
    - Google AI: `tools` with `functionDeclarations`
- [x] **12.6** Implement tool call loop in ChatScreen (`src/components/chat/ChatScreen.tsx`)
  - When AI returns a `tool_calls` response instead of content:
    1. Display a "Searching..." status indicator in the assistant bubble
    2. Execute tool via `registry.getTool(name).execute(args)`
    3. Append tool result as a new message with `role: 'tool'` (or provider equivalent)
    4. Re-stream to get AI's final response incorporating tool results
  - Max tool call rounds: 3 (prevent infinite loops)
  - Add `role: 'tool'` to Message type union
- [x] **12.7** Update SSE parser to detect tool call chunks (`src/lib/streaming/sse-parser.ts`)
  - OpenAI/OpenRouter: `delta.tool_calls[0].function.name` + `delta.tool_calls[0].function.arguments`
  - Anthropic: `content_block_start` with `type: 'tool_use'` + `content_block_delta` with `input_json_delta`
  - Accumulate tool call arguments across chunks (arguments stream as partial JSON)
- [x] **12.8** Create search results display component (`src/components/chat/SearchResults.tsx`)
  - Renders inline in assistant bubble when tool result contains citations
  - Each citation: favicon placeholder + title (link) + snippet (muted)
  - `bg-surface-container-low`, rounded-lg, compact layout
  - Tap link → opens in system browser via `Linking.openURL()`
- [x] **12.9** Add tool toggle in chat UI
  - Small `lucide Globe` pill next to ThinkingToggle in top bar
  - Tap → enables/disables web search for this conversation
  - When enabled, tool schemas sent with every request
- [ ] **12.10** Verify: web search end-to-end

#### How to Test Sprint 12
```
✅ Ask "What's the weather in Tokyo today?" with search enabled → AI searches, cites sources
✅ Search results render inline with clickable links
✅ Tap link → opens in browser
✅ Ask factual question → AI includes [Source](url) citations in response
✅ Search disabled → AI responds without tool calls (normal behavior)
✅ Multiple search rounds: AI searches, reads results, searches again if needed (max 3)
✅ No Serper key → falls back to DuckDuckGo
✅ Works with OpenRouter, Google AI, and Anthropic providers
```

#### 📗 Things Learned
- (fill after completing)

#### 📕 Mistakes Made
- (fill after completing)

#### 📘 Things to Remember
- Tool call arguments stream as partial JSON — accumulate across chunks before parsing
- Anthropic tool format differs from OpenAI — `input_schema` vs `parameters`, `tool_use` content blocks
- Google AI uses `functionDeclarations` inside a `tools` array — different structure
- DuckDuckGo HTML scraping may be unreliable — Serper is the reliable fallback
- Max 3 tool rounds to prevent infinite loops (AI calls tool → gets result → calls tool again...)
- Tool results go as `role: 'tool'` in OpenAI format, `tool_result` in Anthropic format
- Don't send tool schemas when tools are disabled — wastes tokens

---

### Sprint 13 — Rules & Instructions
> **Goal:** Users define global rules (like ChatGPT "Custom Instructions") and per-conversation rule overrides. Rules are injected into every system prompt.
> **Duration:** ~2 hours

#### Tasks
- [x] **13.1** Create rules storage in MMKV (`src/lib/storage/mmkv.ts`)
  - Rules stored as **JSON array of `RuleItem`** objects, not a plain text blob
  - `RuleItem = { id, label, description, enabled, isCustom }`
  - `DEFAULT_RULES`: 5 built-in presets (all default to `enabled: false`)
  - Async `getGlobalRules()`/`setGlobalRules()` + sync `getGlobalRulesSync()`
  - Wired into `initStorage()` for hydration at app start
- [x] **13.2** Add `rules` column to conversations table (`src/lib/db/schema.ts` — migration)
  - `ALTER TABLE conversations ADD COLUMN rules TEXT;`
  - Stores **JSON string** of `RuleItem[]` for per-conversation overrides
  - `null` means "inherit global rules"
  - Updated `Conversation` type and `updateConversation` CRUD
- [x] **13.3** Create rules injection module (`src/lib/rules/injector.ts`)
  - `buildRulesContext(conversationId?) → string`
  - Priority: per-conversation JSON rules > global rules
  - Only **enabled** rules are injected, formatted as bullet list inside `[User Rules]...[/User Rules]`
  - `composeSystemPrompt()` composes rules + memory (future) + custom system prompt
- [x] **13.4** Wire rules injection into streaming pipeline
  - `ChatScreen.tsx` uses `composeSystemPrompt(convId, conversation?.system_prompt)`
  - Order: `[User Rules] → [Memory] → [User Custom Prompt]`
- [x] **13.5** Create global rules editor screen (`src/app/settings/rules.tsx`) — **redesigned for clarity**
  - **Vertical toggle cards** instead of freeform text area — each rule is a card with label, description, and toggle switch
  - "Built-in" section + "Your Rules" section for custom user rules
  - Active rule count badge at top: "3 rules active"
  - "Add Custom Rule" button with modal (label + description inputs)
  - Custom rules can be deleted with trash icon
  - Save button disabled when no changes
- [x] **13.6** Add per-conversation rules access — **redesigned for clarity**
  - Drawer long-press menu → "Edit Rules"
  - Big friendly toggle at top: **"Use my global rules"** (default ON)
  - When ON: shows read-only list of currently enabled global rules
  - When OFF: shows editable toggle list for this conversation only
  - "Reset to global rules" link when in custom mode
  - Subtitle in header clearly shows "For this conversation" vs "For all conversations"
- [x] **13.7** Verify: TypeScript compiles clean

#### How to Test Sprint 13
```
✅ Open Settings → Custom Instructions → see 5 built-in rule cards (all off by default)
✅ Toggle "Be concise" ON → card highlights, count badge shows "1 rule active"
✅ Add custom rule "Be funny" → appears in "Your Rules" section
✅ Save → persists across app restarts
✅ Start chat → AI responses are concise
✅ Long-press conversation in drawer → "Edit Rules"
✅ Per-conversation screen shows "Use my global rules" toggle (ON by default)
✅ Turn OFF → can toggle individual rules for this chat only
✅ Turn back ON → inherits global rules again
✅ System prompt order: [Rules] → [Memory] → [User Custom Prompt]
```

#### 📗 Things Learned
- **Array-based rules are far more user-friendly** than freeform text — users just flip toggles instead of writing prompts
- The `composeSystemPrompt()` helper cleanly separates injection concerns — rules, memory, and custom prompt are composed independently
- Using `useLocalSearchParams` from expo-router lets the same screen serve both global and per-conversation modes without prop drilling
- Deep-copying arrays (`rules.map(r => ({...r}))`) is critical when deriving local state from global store to avoid accidental mutation
- A simple custom `<Toggle>` built with `Pressable` + `View` + `translate-x` is cleaner than importing a full switch component

#### 📕 Mistakes Made
- **First design was too engineering-focused** — a text area with presets was overwhelming for average users. Redesigned to toggle cards after user feedback
- Initially tried to create a separate `src/lib/storage/rules.ts` file — unnecessary indirection; folded directly into `mmkv.ts`
- Forgot to add `handleOpenRules` to the `renderDrawerContent` dependency array — caught by TypeScript
- Accidentally imported `SlidersHorizontal` in `ConversationDrawer` but didn't use it there — caught by linter

#### 📘 Things to Remember
- Rules go first in system prompt — they set the tone before memory and custom prompts
- Per-conversation rules REPLACE global rules (not append) — simpler mental model
- Keep rules concise — they eat into context window on every request
- The `rules` column stores JSON: `null` = inherit global, array = custom override
- Enabled rules are injected as bullet list: `[User Rules]\n- rule 1\n- rule 2\n[/User Rules]`
- Toggle cards with visual state (highlighted when ON, dimmed when OFF) make the UI feel responsive
- "Add Custom Rule" modal should be simple: just a name + description — no need for complexity

---


---

### Sprint 14 — Persistent Memory System (Tool-Based)
> **Goal:** AI remembers facts, preferences, and context across conversations. Uses tool calling (from Sprint 12) so the AI can proactively save and manage memories — no brittle regex detection. Memories are stored in SQLite, ranked by usage, and auto-injected into system prompts.
> **Duration:** ~4 hours

#### Prerequisites
- Sprint 12 (tool calling architecture) must be complete — memory uses `save_memory` and `forget_memory` as registered tools

#### Tasks
- [x] **14.1** Create memories SQLite table (`src/lib/db/schema.ts` — new migration)
  ```sql
  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,          -- the fact/preference/learning
    category TEXT DEFAULT 'general', -- 'preference' | 'fact' | 'instruction' | 'general'
    source TEXT,                     -- conversation_id that created it (nullable)
    hit_count INTEGER DEFAULT 0,     -- times injected into a prompt
    pinned INTEGER DEFAULT 0,        -- user-pinned = always inject
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
  CREATE INDEX IF NOT EXISTS idx_memories_hits ON memories(hit_count DESC);
  ```
- [x] **14.2** Create memory CRUD (`src/lib/db/memories.ts`)
  - `addMemory(content, category?, source?) → id`
  - `getMemories(limit?) → Memory[]` (ordered by hit_count DESC, then updated_at DESC)
  - `getMemoriesByCategory(category) → Memory[]`
  - `updateMemory(id, fields)`
  - `deleteMemory(id)`
  - `incrementHitCount(id)` — bumps hit_count + updated_at
  - `searchMemories(query) → Memory[]` — LIKE search on content
  - `getPinnedMemories() → Memory[]`
- [x] **14.3** Create memory injection module (`src/lib/memory/injector.ts`)
  - `buildMemoryContext(conversationMessages: Message[]) → string`
  - Selects top-N relevant memories (pinned first, then by hit_count, max ~500 tokens worth)
  - Formats as a structured block:
    ```
    [User Memory]
    - Prefers concise responses
    - Works with React Native and Expo
    - Native language is Telugu
    [/User Memory]
    ```
  - Increments `hit_count` for each memory used
  - Injected into system prompt (before user's custom system prompt)
- [x] **14.4** Register memory tools in tool registry (`src/lib/tools/memory-tools.ts`)
  - `save_memory` tool:
    - Params: `{ content: string, category?: 'preference' | 'fact' | 'instruction' | 'general' }`
    - Description: "Save a user fact, preference, or instruction for future conversations"
    - Execute: calls `addMemory()` from CRUD, returns confirmation
  - `forget_memory` tool:
    - Params: `{ query: string }`
    - Description: "Remove a previously saved memory matching the query"
    - Execute: searches memories by query, deletes best match, returns confirmation
  - Register both in `src/lib/tools/registry.ts` alongside `web_search`
- [x] **14.5** Add memory instruction to system prompt
  - Append to system prompt: "You have access to memory tools. When the user shares a personal preference, fact about themselves, or instruction for future conversations, use the save_memory tool to remember it. When they ask you to forget something, use the forget_memory tool."
  - This replaces the old regex-based detection — the AI decides when to save memories naturally
  - Memory tools are always available (not gated by the search toggle)
- [x] **14.6** Wire memory injection into streaming pipeline (`src/components/chat/ChatScreen.tsx`)
  - In `streamNewResponse()`: call `buildMemoryContext()` before building the request
  - Prepend memory context to `systemPrompt` in `StreamConfig`
  - Only inject if user has memories (skip empty)
  - Memory tools included in tool schemas for every request (when memory is enabled)
- [x] **14.7** Create memory management screen (`src/app/settings/memories.tsx`)
  - New route accessible from Settings drawer item
  - Header: ArrowLeft + "Memories" + memory count badge
  - List of memory cards, each showing:
    - Content text (14sp `text-foreground`)
    - Category pill (e.g., "Preference", "Fact") — `bg-muted`, `text-muted-foreground`
    - Hit count: `lucide Zap` + count (muted)
    - Pin toggle: `lucide Pin` / `lucide PinOff`
    - Swipe-to-delete or long-press → delete confirmation
  - "Add Memory" FAB → modal with text input + category picker
  - Search bar at top (filters memories by content)
  - Empty state: `lucide Brain` icon + "No memories yet" + description text
- [x] **14.8** Add memory toggle to settings
  - Global toggle in settings: "Memory" on/off (persisted in MMKV)
  - When off, `buildMemoryContext()` returns empty string and memory tools are not registered
- [x] **14.9** Verify: memory creation via tool calling, injection, and management

#### How to Test Sprint 14
```
✅ Tell AI "I prefer dark mode" → AI proactively calls save_memory tool → Toast "Memory saved"
✅ Tell AI "My name is Puneeth" → AI calls save_memory with category 'fact'
✅ Tell AI "forget my name" → AI calls forget_memory → memory removed
✅ New conversation → system prompt includes "[User Memory]" block with stored memories
✅ Memory management screen shows all memories with hit counts
✅ Pin a memory → always included in injection (even if hit_count is low)
✅ Delete a memory manually → removed from future injections
✅ Add memory manually from management screen → appears in list
✅ Search memories → filters by content
✅ Toggle memory OFF in settings → no injection happens, memory tools not available
✅ Hit count increments each time a memory is used in a prompt
✅ Memory persists across app restarts
```

#### 📗 Things Learned
- **Tool-based memory is elegant** — no regex, no heuristics, no fragile parsing. The AI itself decides what's worth remembering using the same tool architecture as web search.
- **Scoped tool schemas prevent token waste** — by passing `activeToolNames` to `getOpenAIToolSchemas()`, only the relevant tools are sent to the API. When memory is off, `save_memory`/`forget_memory` aren't in the request at all.
- **Order in system prompt matters** — `[User Rules] → [User Memory] → [Custom Prompt]` is the right hierarchy. Rules set behavior, memory provides context, custom prompt is the fine-tuning.
- **Pinned + hit_count ranking is simple but effective** — no need for embeddings or vector search at this scale. For <1000 memories, SQLite + simple heuristics work perfectly.
- **Conditional tool registration avoids side effects** — memory tools are registered at app startup but only included in API calls when `memoryEnabled` is true. This lets us toggle without re-registering.

#### 📕 Mistakes Made
- **Initially forgot to update `initStorage()` to hydrate `memoryEnabled`** — the sync value was always `false` on first render until the settings store initialize ran. Fixed by adding `isMemoryEnabled()` call in `initStorage()`.
- **Forgot to add `memoryEnabled` to the `streamNewResponse` dependency array** — React warned about stale closures. Added to the `useCallback` deps.
- **Had to redesign the tool config to support selective tool inclusion** — originally `getOpenAIToolSchemas()` returned ALL registered tools, but that would send memory tools even when memory was disabled. Updated to accept optional `toolNames` parameter.

#### 📘 Things to Remember
- Memory tools use the same tool architecture as web search (Sprint 12) — no special plumbing needed
- AI-driven extraction is superior to regex — the model understands context and decides what's worth saving
- Memory injection goes BEFORE user's custom system prompt — order matters
- Keep total injected memory under ~500 tokens to avoid eating context window
- Hit count is a proxy for relevance — higher hit = more useful = inject first
- Pinned memories bypass hit_count ranking — always injected
- Memory tools are always registered at startup but only sent to API when enabled
- SQLite LIKE search is fine for <1000 memories — upgrade to FTS5 only if needed
- `activeToolNames` filtering in `getOpenAIToolSchemas()` prevents sending disabled tools to the API

---

### Sprint 15 — MCP Server Support
> **Goal:** Implement an MCP (Model Context Protocol) client so users can connect to external tool servers. Extends the Sprint 12 tool architecture with remote tool discovery and execution.
> **Duration:** ~6 hours

#### Prerequisites
- Sprint 12 tool system (types, registry, tool call loop) must be complete
- Tool rendering and SSE tool call parsing already implemented

#### Tasks
- [ ] **15.1** Create MCP client module (`src/lib/mcp/client.ts`)
  - Implements MCP client protocol over HTTP+SSE (Streamable HTTP transport)
  - `MCPClient` class:
    - `connect(serverUrl: string, headers?: Record<string, string>) → Promise<void>`
    - `disconnect() → void`
    - `listTools() → Promise<MCPToolSchema[]>`
    - `callTool(name: string, args: Record<string, unknown>) → Promise<MCPToolResult>`
    - `isConnected() → boolean`
  - MCP transport: HTTP POST for requests, SSE for streaming responses
  - Handles `initialize` → `initialized` handshake
  - Protocol version: `2025-03-26` (latest stable)
- [ ] **15.2** Create MCP-to-tool bridge (`src/lib/mcp/bridge.ts`)
  - Converts `MCPToolSchema` (MCP format) → `ToolDefinition` (Sprint 12 format)
  - Wraps `MCPClient.callTool()` as `ToolDefinition.execute()`
  - Auto-registers MCP tools into the tool registry from Sprint 12
  - Handles tool name conflicts: prefix with server name (e.g., `weather.get_forecast`)
- [ ] **15.3** Create MCP server config storage (`src/lib/mcp/config.ts`)
  - Store server configs in SQLite:
    ```sql
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      headers TEXT,              -- JSON: optional auth headers
      enabled INTEGER DEFAULT 1,
      auto_connect INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    ```
  - CRUD: `addServer()`, `getServers()`, `updateServer()`, `deleteServer()`, `toggleServer()`
- [ ] **15.4** Create MCP connection manager (`src/lib/mcp/manager.ts`)
  - Manages multiple MCPClient instances (one per configured server)
  - `connectAll()` — connects to all enabled servers with `auto_connect = 1`
  - `disconnectAll()` — cleanup on app background/exit
  - Connection state tracking per server: `connecting | connected | error | disconnected`
  - Auto-reconnect with exponential backoff on connection loss
  - Emits state changes via Zustand store
- [ ] **15.5** Create MCP store (`src/stores/mcp-store.ts`)
  - Zustand store for MCP state:
    ```typescript
    interface MCPState {
      servers: MCPServerConfig[];
      connectionStates: Record<string, 'connecting' | 'connected' | 'error' | 'disconnected'>;
      availableTools: ToolDefinition[];  // aggregated from all connected servers
      initialize: () => Promise<void>;
      addServer: (name: string, url: string, headers?: Record<string, string>) => Promise<void>;
      removeServer: (id: string) => Promise<void>;
      toggleServer: (id: string) => Promise<void>;
      reconnect: (id: string) => Promise<void>;
    }
    ```
- [ ] **15.6** Create MCP server management screen (`src/app/settings/mcp-servers.tsx`)
  - Header: ArrowLeft + "MCP Servers" + `lucide Plus` add button
  - Server list, each card showing:
    - Server name (14sp bold) + URL (12sp muted, truncated)
    - Connection status indicator: green dot (connected), yellow dot (connecting), red dot (error), gray dot (disabled)
    - Tool count badge: "3 tools" in `bg-muted` pill
    - Toggle switch: enable/disable
    - Swipe-to-delete with confirmation
  - "Add Server" bottom sheet:
    - Name input, URL input, optional headers (key-value pairs)
    - "Test Connection" button → attempts connect, shows tool count on success
    - "Save" button
  - Curated server list section ("Popular Servers"):
    - Pre-filled entries user can one-tap add:
      - "Brave Search" — `https://mcp.bravesearch.com/sse`
      - "Calculator" — basic math MCP server
    - Each with description + "Add" button
  - Empty state: `lucide Plug` icon + "Connect to MCP servers to extend AI capabilities"
- [ ] **15.7** Wire MCP tools into ChatScreen tool loop
  - On app startup: `MCPManager.connectAll()` → discover tools → register in tool registry
  - MCP tools appear alongside built-in tools (web search) in tool schemas sent to AI
  - Tool call flow: AI requests tool → registry resolves → if MCP tool, routes through MCPClient
  - Tool result rendering: same `SearchResults`/inline display as Sprint 12
- [ ] **15.8** Add MCP tool indicator to chat UI
  - When MCP tools are active, show `lucide Plug` badge in top bar (next to search globe)
  - Tap → shows list of connected servers + available tools
  - During tool execution: show server name in "Running tool..." indicator
- [ ] **15.9** Handle MCP errors gracefully
  - Server unreachable → show error in server card, skip its tools (don't block chat)
  - Tool execution timeout (30s) → cancel and show error in chat
  - Invalid tool result → show raw error to user, continue conversation
  - Server disconnects mid-conversation → toast notification, remove its tools from active set
- [ ] **15.10** Verify: MCP server connection, tool discovery, and execution

#### How to Test Sprint 15
```
✅ Add MCP server via URL → connects, shows tool count
✅ Server card shows green dot when connected
✅ AI can call MCP tools during conversation
✅ Tool results render inline in chat
✅ Disable server → its tools no longer available to AI
✅ Delete server → removed from list and disconnected
✅ Server goes down → error state shown, chat continues without its tools
✅ App restart → auto-connects to enabled servers
✅ "Test Connection" verifies server before saving
✅ Multiple servers work simultaneously
```

#### 📗 Things Learned
- (fill after completing)

#### 📕 Mistakes Made
- (fill after completing)

#### 📘 Things to Remember
- MCP uses Streamable HTTP transport (HTTP+SSE) — NOT WebSocket (deprecated in 2025-03-26 spec)
- MCP handshake: client sends `initialize` → server responds with capabilities → client sends `initialized`
- Tool name conflicts across servers: prefix with server name to disambiguate
- Connection manager must handle app backgrounding — disconnect on background, reconnect on foreground
- Auto-reconnect uses exponential backoff: 1s → 2s → 4s → 8s → max 30s
- MCP server auth: optional Bearer token or custom headers — stored in SQLite (NOT SecureStore, these aren't user API keys)
- Don't block the chat if an MCP server fails — gracefully degrade
---

### Sprint 16 — Skills System
> **Goal:** Users can install, create, and share "skill packs" — bundles of system prompt + tool config + rules that create specialized AI personas. Foundation for Sprint 17 (Custom Apps).
> **Duration:** ~4 hours

#### Prerequisites
- Sprint 14 (memory), Sprint 13 (rules), Sprint 12 (tools) must be complete
- Tool registry and rules injection already working

#### Tasks
- [ ] **16.1** Define skill types (`src/lib/skills/types.ts`)
  ```typescript
  interface Skill {
    id: string;
    name: string;
    description: string;
    icon: string;                    // lucide icon name
    version: string;                 // semver, e.g. "1.0.0"
    author?: string;
    systemPrompt: string;            // injected when skill is active
    rules?: string;                  // additional rules (appended to user rules)
    tools?: string[];                // tool names this skill can use (from registry)
    examplePrompts?: string[];       // suggestion chips when skill is active
    builtin: boolean;                // shipped with app vs user-created/imported
    enabled: boolean;
    createdAt: number;
  }
  ```
- [ ] **16.2** Create skills storage (`src/lib/db/skills.ts`)
  - SQLite table:
    ```sql
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT DEFAULT 'Sparkles',
      version TEXT DEFAULT '1.0.0',
      author TEXT,
      system_prompt TEXT NOT NULL,
      rules TEXT,
      tools TEXT,                 -- JSON array of tool names
      example_prompts TEXT,       -- JSON array of strings
      builtin INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    ```
  - CRUD: `addSkill()`, `getSkills()`, `getEnabledSkills()`, `updateSkill()`, `deleteSkill()`, `toggleSkill()`
- [ ] **16.3** Seed built-in skills
  - "Code Reviewer" — system prompt for code analysis, uses no tools, examples: "Review this function", "Find bugs in..."
  - "Research Assistant" — system prompt for research, uses `web_search` tool, examples: "Research topic X", "Compare A vs B"
  - "Creative Writer" — system prompt for creative writing, no tools, examples: "Write a short story about...", "Write a poem..."
  - "Translator" — system prompt for translation, no tools, examples: "Translate to Hindi: ...", "Translate to Japanese: ..."
  - "Fitness Coach" — system prompt for fitness advice, no tools, examples: "Create a workout plan", "Meal plan for..."
  - Built-in skills are read-only — user can disable but not edit or delete
- [ ] **16.4** Wire skills into system prompt injection
  - Update `ChatScreen.streamNewResponse()`: compose system prompt as:
    `[User Rules] → [Active Skill Prompt] → [Active Skill Rules] → [User Memory] → [Custom System Prompt]`
  - Only inject enabled skills' prompts
  - If multiple skills enabled, concatenate their prompts (separated by `\n---\n`)
  - Skill tools: only send tool schemas for tools listed in active skills (scoped tool access)
- [ ] **16.5** Create skill management screen (`src/app/settings/skills.tsx`)
  - Header: ArrowLeft + "Skills" + `lucide Plus` add button
  - Two sections: "Built-in" and "Custom"
  - Each skill card:
    - `lucide` icon (from skill.icon) + name (bold) + description (muted)
    - Toggle switch: enable/disable
    - Tap card → skill detail bottom sheet (full prompt, rules, tools, examples)
    - Long-press custom skill → edit/delete options
  - Empty custom section: "Create or import a skill to customize your AI"
- [ ] **16.6** Create skill editor (`src/components/skills/SkillEditor.tsx`)
  - Full-screen modal for creating/editing skills
  - Fields: name, description, icon picker (grid of common lucide icons), system prompt (multiline), rules (multiline), tool selection (checkboxes from registry), example prompts (tag input)
  - "Preview" button — shows how the skill's system prompt will look when injected
  - "Save" button
- [ ] **16.7** Import/export skills as JSON
  - Export: `expo-sharing` → share skill as `.skill.json` file
  - Import: pick JSON file → validate schema → add to custom skills
  - JSON schema:
    ```json
    {
      "medha_skill": "1.0",
      "name": "Code Reviewer",
      "description": "...",
      "icon": "Code",
      "systemPrompt": "...",
      "rules": "...",
      "tools": ["web_search"],
      "examplePrompts": ["Review this code", "..."]
    }
    ```
  - Validation: required fields, max prompt length (4000 chars), no executable code
- [ ] **16.8** Skill activation in chat
  - In the chat empty state (EmptyState component): show active skill name + icon above suggestion chips
  - Suggestion chips change to skill's `examplePrompts` when a skill is active
  - Per-conversation skill selection: store `active_skill_id` in conversations table (new column migration)
- [ ] **16.9** Verify: skill creation, activation, and import/export

#### How to Test Sprint 16
```
✅ Built-in skills appear in skill list (Code Reviewer, Research Assistant, etc.)
✅ Enable "Code Reviewer" → AI responses focus on code analysis
✅ Enable "Research Assistant" → AI uses web_search tool automatically
✅ Create custom skill → appears in custom section
✅ Edit custom skill → changes reflect in next conversation
✅ Export skill → generates .skill.json file
✅ Import .skill.json → skill added to custom list
✅ Disable skill → its prompt and rules no longer injected
✅ Skill suggestion chips appear in empty state
✅ Per-conversation skill persists when reopening chat
```

#### 📗 Things Learned
- (fill after completing)

#### 📕 Mistakes Made
- (fill after completing)

#### 📘 Things to Remember
- Skills compose with rules and memory — they don't replace them
- System prompt order: Rules → Skill Prompt → Skill Rules → Memory → Custom System Prompt
- Scoped tools: skill declares which tools it uses — only those schemas are sent to AI when skill is active
- Built-in skills are seed data — insert on first run, don't overwrite if user disabled them
- Import validation: reject skills with suspiciously long prompts (>4000 chars) or unknown tool names
- `.skill.json` files are shareable — users can distribute via messaging apps or file sharing

---

### Sprint 17 — Custom Apps (GPT-like Personas)
> **Goal:** Users create shareable "apps" — named personas that bundle a skill, model, icon, and conversation defaults. Like ChatGPT's Custom GPTs but local-first.
> **Duration:** ~6 hours

#### Prerequisites
- Sprint 13 (rules), Sprint 16 (skills) must be complete
- Skill system, tool registry, and rules injection all working

#### Tasks
- [ ] **17.1** Define app types (`src/lib/apps/types.ts`)
  ```typescript
  interface MedhaApp {
    id: string;
    name: string;
    description: string;
    icon: string;                    // lucide icon name
    color?: string;                  // accent color for app card (CSS hsl)
    skillId?: string;                // linked skill (from Sprint 16)
    model?: string;                  // pinned model ID (e.g. "claude-sonnet-4-20250514")
    provider?: string;               // pinned provider ID
    rules?: string;                  // app-specific rules (override global)
    greeting?: string;               // first message shown when app opens
    examplePrompts?: string[];       // suggestion chips
    builtin: boolean;
    createdAt: number;
  }
  ```
- [ ] **17.2** Create apps storage (`src/lib/db/apps.ts`)
  - SQLite table:
    ```sql
    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT DEFAULT 'Bot',
      color TEXT,
      skill_id TEXT,
      model TEXT,
      provider TEXT,
      rules TEXT,
      greeting TEXT,
      example_prompts TEXT,       -- JSON array
      builtin INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE SET NULL
    );
    ```
  - CRUD: `addApp()`, `getApps()`, `getApp()`, `updateApp()`, `deleteApp()`
- [ ] **17.3** Seed built-in apps
  - "Medha Default" — no pinned model, no skill, default behavior (icon: `Sparkles`)
  - "Code Assistant" — links "Code Reviewer" skill, pins to Claude Sonnet 4 (icon: `Code`, color: `hsl(265, 80%, 60%)`)
  - "Writing Coach" — links "Creative Writer" skill, greeting: "What would you like to write today?" (icon: `Feather`)
  - "Language Tutor" — links "Translator" skill, rules: "Always correct grammar mistakes" (icon: `Languages`)
  - "Research Pro" — links "Research Assistant" skill, pins to GPT-4o via OpenRouter (icon: `Search`)
- [ ] **17.4** Create app launcher screen (`src/app/apps.tsx`)
  - Grid layout (2 columns) of app cards
  - Each card: colored icon circle + name + description (2 lines max)
  - Card style: `bg-surface-container-low`, `border-outline-variant/10`, rounded-2xl, shadow
  - Tap card → creates new conversation with app's config applied
  - Long-press → edit/delete (custom apps only), share
  - "Create App" card at end: dashed border + `lucide Plus` icon
  - Header: "Apps" + search icon (filters by name)
- [ ] **17.5** Wire app activation into conversation creation
  - When user taps an app:
    1. Create new conversation with `model`, `provider`, `system_prompt` (from linked skill), `rules` pre-set
    2. If `greeting` is set, insert it as first assistant message
    3. Navigate to `chat/[id]` with app's `examplePrompts` as suggestion chips
    4. Store `app_id` on conversation (new column migration)
  - Active app shown in chat top bar: app icon + name (replaces or sits next to ModelPill)
- [ ] **17.6** Create app editor (`src/app/apps/create.tsx`)
  - Full-screen wizard flow (3 steps):
    1. **Identity**: name, description, icon picker (lucide grid), color picker (preset palette of 8 colors)
    2. **Behavior**: skill selector (dropdown from Sprint 16 skills), custom rules (multiline), greeting message
    3. **Model**: provider picker, model picker (from that provider), or "Any model" (user's default)
  - "Preview" step: shows how the app card will look + test conversation
  - "Save" button → inserts into SQLite
  - Edit mode: pre-fills all fields from existing app
- [ ] **17.7** Add app launcher to drawer
  - New section in ConversationDrawer: "Apps" row with `lucide Grid3X3` icon
  - Tap → navigates to app launcher screen
  - Alternatively: horizontal scroll of app icons at top of drawer (quick access)
- [ ] **17.8** Import/export apps as JSON
  - Export: bundles app + linked skill into single `.app.json` file
    ```json
    {
      "medha_app": "1.0",
      "name": "Code Assistant",
      "description": "...",
      "icon": "Code",
      "color": "hsl(265, 80%, 60%)",
      "skill": { /* embedded skill JSON from Sprint 16 */ },
      "model": "claude-sonnet-4-20250514",
      "provider": "anthropic",
      "rules": "...",
      "greeting": "...",
      "examplePrompts": ["..."]
    }
    ```
  - Import: parse JSON → create skill (if embedded) → create app → link
  - Share via `expo-sharing`
- [ ] **17.9** App-scoped conversation history
  - In drawer: filter conversations by app (show app icon badge on each conversation)
  - App launcher cards show conversation count: "12 chats" subtitle
- [ ] **17.10** Verify: app creation, activation, sharing, and conversation flow

#### How to Test Sprint 17
```
✅ App launcher shows grid of built-in apps (Medha Default, Code Assistant, etc.)
✅ Tap "Code Assistant" → new chat with Code Reviewer skill active + Claude pinned
✅ Greeting message appears as first assistant message
✅ Suggestion chips show app's example prompts
✅ App icon + name visible in chat top bar
✅ Create custom app via wizard → appears in launcher grid
✅ Edit custom app → changes apply to new conversations (not existing ones)
✅ Export app → .app.json file with embedded skill
✅ Import .app.json → app + skill created
✅ Long-press built-in app → no edit/delete (read-only)
✅ Drawer shows "Apps" row → navigates to launcher
✅ Conversations show app badge in drawer list
```

#### 📗 Things Learned
- (fill after completing)

#### 📕 Mistakes Made
- (fill after completing)

#### 📘 Things to Remember
- Apps are a composition layer — they combine skills, rules, and model preferences into a named persona
- App ≠ Skill: skill is the behavior (prompt + tools), app is the UX wrapper (icon, greeting, model, skill)
- Built-in apps reference built-in skills by ID — if skill deleted, app still works but without skill's prompt
- Greeting is a fake assistant message — it's stored in DB as a regular message, not re-injected on each open
- App-specific rules override global rules (same as per-conversation rules from Sprint 13)
- Model pinning is a preference, not a requirement — if user doesn't have the API key, show a warning but allow model switch
- `.app.json` embeds the full skill — no external references that could break on import

---

### Sprint 18 — Token & Cost Estimator
> **Goal:** Users see estimated token counts before sending, per-message token usage after responses, per-conversation cost tracking, and a usage dashboard. Tracks all token usage including tool calls and MCP tool execution.
> **Duration:** ~3 hours

#### Tasks
- [ ] **18.1** Create tokenizer utility (`src/lib/tokens/estimator.ts`)
  - **Do NOT bundle a full tokenizer** (tiktoken WASM is 4MB+ and breaks RN)
  - Use a simple heuristic estimator: `estimateTokens(text: string) → number`
    - English: ~4 chars per token (GPT) or ~3.5 chars per token (Claude/Gemini)
    - Formula: `Math.ceil(text.length / 3.75)` (averaged across providers)
  - Also export `estimateMessageTokens(messages: Message[], systemPrompt?: string) → number` — sums all message content + system prompt
  - Accurate enough for cost estimation (within ~15% of real tokenizer)
- [ ] **18.2** Create model pricing data (`src/lib/tokens/pricing.ts`)
  - Static pricing map keyed by model ID (or prefix pattern):
    ```typescript
    interface ModelPricing {
      promptPer1M: number;      // USD per 1M input tokens
      completionPer1M: number;  // USD per 1M output tokens
    }
    ```
  - Populate from OpenRouter/Anthropic/Google pricing pages
  - Fallback: use pricing from OpenRouter `listModels()` response (already parsed in `Model.pricing`)
  - `getModelPricing(modelId: string) → ModelPricing | null`
  - Cache pricing from API responses in MMKV
- [ ] **18.3** Add live token counter to InputBar (`src/components/chat/InputBar.tsx`)
  - Small token count badge below the text input (right-aligned)
  - Shows: `~{n} tokens` in `text-muted-foreground` (12sp)
  - Updates on text change (debounced 300ms via `useMemo` or `useCallback`)
  - Includes: system prompt tokens + memory tokens + all message history tokens + current input
  - Color coding: normal (muted) → yellow (>75% of model context window) → red (>90%)
  - Tap → shows breakdown tooltip: "Input: ~X | History: ~Y | System: ~Z"
- [ ] **18.4** Add per-message token display to MessageBubble (`src/components/chat/MessageBubble.tsx`)
  - Below each assistant message: small muted text showing token usage
  - Format: `~{input}↑ ~{output}↓` (estimated input/output tokens)
  - For messages with `tokens_used` from API → show actual count instead of estimate
  - Only visible on tap (or always visible as a user preference toggle)
- [ ] **18.5** Extract actual token usage from API responses
  - Update `streamCompletion()` to capture `usage` object from the final SSE event
  - OpenAI/OpenRouter: `usage.prompt_tokens`, `usage.completion_tokens` in final chunk
  - Anthropic: `message_delta` event contains `usage.output_tokens`
  - Google AI: `usageMetadata.promptTokenCount`, `usageMetadata.candidatesTokenCount`
  - Pass back via new callback: `onUsage?: (usage: { prompt: number; completion: number }) => void`
  - Save to `messages.tokens_used` as JSON string: `{"prompt": N, "completion": M}`
  - **Note**: also track tokens from tool call rounds (Sprint 12) — sum across all rounds per response
- [ ] **18.6** Add per-conversation cost tracking
  - Create `token_usage` table in SQLite:
    ```sql
    CREATE TABLE IF NOT EXISTS token_usage (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL,
      completion_tokens INTEGER NOT NULL,
      cost_usd REAL,                    -- estimated cost in USD
      created_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_token_usage_conv ON token_usage(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_token_usage_date ON token_usage(created_at);
    ```
  - After each completed response: insert usage record with estimated cost
  - `getConversationCost(convId) → { totalTokens: number, estimatedCost: number }`
- [ ] **18.7** Show conversation cost in drawer
  - In `ConversationDrawer.tsx`: show small cost badge per conversation
  - Format: `$0.003` or `<$0.01` for very cheap conversations
  - Only show if cost > 0 (skip free models)
- [ ] **18.8** Create usage dashboard screen (`src/app/settings/usage.tsx`)
  - Header: ArrowLeft + "Usage & Costs"
  - Summary cards at top:
    - "Today": total tokens + cost
    - "This Week": total tokens + cost
    - "This Month": total tokens + cost
  - Bar chart showing daily usage for last 7 days (simple View-based bars, no charting lib needed)
    - Each bar: `bg-foreground` with height proportional to token count
    - Day labels below (Mon, Tue, etc.)
  - Breakdown by provider: list of providers with token count + cost
  - Breakdown by model: top 5 most-used models with stats
  - "Reset Usage Data" destructive button at bottom
- [ ] **18.9** Verify: token counting, cost tracking, and usage dashboard

#### How to Test Sprint 18
```
✅ Type in input bar → token count badge shows estimated tokens
✅ Token count updates as text changes (debounced)
✅ Send message → assistant response shows token usage below bubble
✅ Conversation in drawer shows cost badge (e.g., "$0.01")
✅ Usage dashboard shows today/week/month summaries
✅ Bar chart renders daily usage for last 7 days
✅ Provider breakdown shows correct distribution
✅ Free model conversations show $0.00 or no cost badge
✅ Usage persists across app restarts
✅ "Reset Usage Data" clears all tracking data
✅ Tool call tokens (web search, MCP) included in usage tracking
```

#### 📗 Things Learned
- (fill after completing)

#### 📕 Mistakes Made
- (fill after completing)

#### 📘 Things to Remember
- Do NOT use tiktoken/WASM tokenizer — too heavy for RN, heuristic is good enough for cost estimation
- Token estimation formula: `Math.ceil(text.length / 3.75)` — averaged across GPT/Claude/Gemini
- OpenRouter returns pricing in `Model.pricing` — cache and use for cost calculation
- Anthropic doesn't return usage in SSE stream by default — check `stream_options` or final event
- Cost display: always show as USD with 3 decimal places for sub-cent amounts
- Bar chart: use simple View heights — no need for `react-native-chart-kit` or similar
- `tokens_used` column already exists on messages table — change from `INTEGER` to `TEXT` to store JSON `{"prompt": N, "completion": M}`
- Track tool call round tokens too — a single user message may trigger multiple API calls via tool loop

### Sprint 19 — Document Intelligence
> **Goal:** PDF, DOCX, and XLSX files attached by users are actually read and understood. Provider-native document support for Anthropic and Gemini sends files directly; for other providers, client-side text extraction fills the gap.
> **Duration:** ~3 hours

#### Prerequisites
- Sprint 9 (attachments) must be complete — file picker and storage already working
- `multimodal.ts` already has `readDocumentText()` that punts on binary files with `[Binary file: ...]`

#### Tasks
- [ ] **19.1** Install PDF text extraction library
  - `npx expo install expo-pdf-text-extract` — native module using PDFKit (iOS) + PDFBox (Android)
  - Requires dev build (not Expo Go) — already the case for Medha
  - Extracts text from digital PDFs (not scanned/OCR)
- [ ] **19.2** Update `readDocumentText()` in `multimodal.ts`
  - For `application/pdf`: use `expo-pdf-text-extract` to extract text
  - For DOCX (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`): use lightweight JS parser or note as binary
  - For XLSX (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`): use `xlsx` (SheetJS) to extract as CSV text
  - Truncate all extracted text to 50K chars (existing limit)
  - Fallback: if extraction fails, return `[Could not extract text from: name.pdf]` instead of `[Binary file: ...]`
- [ ] **19.3** Add provider-native PDF support for Anthropic
  - Update `buildAnthropicMessages()`: when attachment is `application/pdf`, send as Anthropic `document` content block:
    ```json
    { "type": "document", "source": { "type": "base64", "media_type": "application/pdf", "data": "..." } }
    ```
  - Claude natively reads PDFs (converts pages to images + extracts text server-side)
  - Keep client-side text extraction as fallback for other providers
- [ ] **19.4** Add provider-native PDF support for Google AI
  - Update `buildGeminiNativeMessages()`: when attachment is `application/pdf`, send as `inline_data` part:
    ```json
    { "inline_data": { "mime_type": "application/pdf", "data": "BASE64..." } }
    ```
  - Gemini supports PDFs up to 50MB inline
  - For OpenAI-compat path (`buildOpenAIMessages`): use extracted text (OpenAI format doesn't support PDF parts)
- [ ] **19.5** Update OpenAI/OpenRouter path to use extracted text
  - `buildOpenAIMessages()` already inlines text — the text extraction update in 19.2 handles this automatically
  - No structural changes needed — just ensure `readDocumentText()` now returns real PDF content
- [ ] **19.6** Add PDF page count indicator to attachment UI
  - When a PDF is attached, show page count badge: "12 pages" in `text-muted-foreground`
  - Extract page count via `expo-pdf-text-extract` metadata
- [ ] **19.7** Verify: PDF and document extraction across providers

#### How to Test Sprint 19
```
✅ Attach a digital PDF → AI summarizes its contents correctly
✅ Attach a DOCX → AI reads the text content
✅ Attach an XLSX → AI reads the spreadsheet data as CSV
✅ Anthropic: PDF sent as native document block → Claude reads it with full fidelity
✅ Google AI: PDF sent as inline_data → Gemini reads charts/tables
✅ OpenRouter: PDF text extracted client-side → model gets text content
✅ Large PDF (100+ pages) → text truncated gracefully at 50K chars
✅ Scanned PDF (no text layer) → graceful fallback message
✅ PDF page count shown in attachment badge
```

#### 📗 Things Learned
- (fill after completing)

#### 📕 Mistakes Made
- (fill after completing)

#### 📘 Things to Remember
- `expo-pdf-text-extract` requires dev build — won't work in Expo Go
- Anthropic and Gemini can read PDFs natively (server-side) — always prefer this over client-side extraction
- OpenRouter/OpenAI format doesn't support PDF parts — must extract text client-side first
- PDF base64 encoding adds ~33% size overhead — watch request size limits
- Scanned PDFs need OCR which `expo-pdf-text-extract` doesn't do — note this limitation to users
- Truncate at 50K chars — large PDFs can blow up context windows and costs
- DOCX extraction is lower priority — start with PDF which is the most common format

---

### Sprint 20 — Image Generation & Rich Output
> **Goal:** AI can generate images via tool calling using DALL-E, Stability AI, or other APIs. Generated images render inline in chat. Code blocks get a "Save as file" button. Markdown images in responses render as actual images.
> **Duration:** ~5 hours

#### Prerequisites
- Sprint 12 (tool calling) must be complete — image gen is a registered tool
- Sprint 9 (attachments) must be complete — generated images stored using attachment system

#### Tasks
- [ ] **20.1** Add image generation API key to settings (`src/app/settings/api-keys.tsx`)
  - New optional provider section: "Image Generation"
  - Supported services: OpenAI (DALL·E 3), Stability AI, Together AI
  - Stored in SecureStore: key `image-gen`, with a separate MMKV key for selected service (`medha:imageGenService`)
  - Label: "Image Generation" with subtitle showing selected service
- [ ] **20.2** Add image gen settings to MMKV and settings store
  - New MMKV keys: `imageGenEnabled`, `imageGenService` (`'openai' | 'stability' | 'together'`)
  - Settings store: `imageGenEnabled`, `imageGenService`, `setImageGenEnabled()`, `setImageGenService()`
  - `initStorage()` hydrates both values
- [ ] **20.3** Create `generate_image` tool (`src/lib/tools/image-gen.ts`)
  - Tool definition:
    ```typescript
    name: 'generate_image',
    description: 'Generate an image based on a text description. Use when the user asks to create, draw, design, or visualize something.',
    parameters: {
      prompt: { type: 'string', description: 'Detailed image description', required: true },
      size: { type: 'string', description: 'Image size', enum: ['1024x1024', '1024x1792', '1792x1024'], required: false },
    }
    ```
  - Execute function:
    1. Read `imageGenService` from MMKV to determine which API to call
    2. Call the selected API with the prompt
    3. Download/decode the resulting image
    4. Save to app storage via `persistAttachment()`
    5. Return `ToolResult` with markdown image reference and the local URI
- [ ] **20.4** Implement OpenAI DALL-E 3 backend (`src/lib/tools/image-gen.ts`)
  - `POST https://api.openai.com/v1/images/generations`
  - Body: `{ model: 'dall-e-3', prompt, size, n: 1, response_format: 'b64_json' }`
  - Decode base64 → save as PNG to app storage
  - Headers: `Authorization: Bearer <key>`
- [ ] **20.5** Implement Stability AI backend (fallback option)
  - `POST https://api.stability.ai/v2beta/stable-image/generate/sd3`
  - Form data with `prompt`, `output_format: 'png'`
  - Headers: `Authorization: Bearer <key>`
  - Returns image bytes directly
- [ ] **20.6** Register `generate_image` tool in ChatScreen
  - Register alongside web_search and memory tools
  - Only include in `activeToolNames` when `imageGenEnabled` is true AND an image gen API key exists
  - Append instruction to system prompt: "You can generate images. When the user asks to create, draw, or visualize something, use the generate_image tool."
- [ ] **20.7** Store generated images as assistant message attachments
  - After tool execution returns image URI, attach it to the final assistant message
  - Update `addMessage()` to support attaching images to assistant messages (currently only user messages have attachments)
  - Image stored in attachments JSON on the assistant message row
- [ ] **20.8** Render generated images inline in assistant MessageBubble
  - When assistant message has `attachments` with `type: 'image'` → render `<Image />` inline above/below text
  - Tap image → full-screen modal with pinch-to-zoom
  - Long-press image → save to device gallery via `expo-media-library`
  - Image dimensions: max width 280px, aspect ratio preserved
- [ ] **20.9** Add image generation toggle pill to chat top bar
  - Small `lucide Image` pill next to existing Globe/Brain toggles
  - Tap toggles image generation on/off
  - Only visible when image gen API key is configured
  - Visual: `bg-muted` + `text-muted-foreground` (off) vs `bg-foreground` + `text-background` (on)
- [ ] **20.10** Add "Save as file" button to code blocks in MarkdownMessage
  - Next to existing "Copy" button on code blocks: `lucide Download` icon
  - Infers filename from language tag: `python` → `code.py`, `javascript` → `script.js`, `json` → `data.json`, etc.
  - Saves to device storage via `expo-file-system` + `expo-sharing` (share sheet)
  - Toast: "File saved"
- [ ] **20.11** Render markdown images inline in assistant messages
  - When markdown contains `![alt](url)` → render `<Image />` component
  - Support remote URLs (`https://...`) and local URIs (`file://...`)
  - Lazy loading with shimmer placeholder
  - Error state: show broken image icon with alt text
  - Max width: 280px, auto height
- [ ] **20.12** Verify: image generation, file saving, inline rendering

#### How to Test Sprint 20
```
✅ Add OpenAI key for image gen → image generation toggle appears in top bar
✅ "Generate a sunset over mountains" → AI calls generate_image → image renders inline
✅ Tap generated image → full-screen zoom view
✅ Long-press image → save to gallery
✅ Image persists in chat after app restart (stored in attachments)
✅ Image gen disabled → AI responds with text only, no tool call
✅ No image gen key → toggle not shown, tool not registered
✅ Code block has "Save" button → saves/shares file
✅ AI response with ![](url) → image renders inline
✅ Multiple images in one response → all render correctly
✅ Works across OpenRouter, Google AI, Anthropic, MiniMax
```

#### 📗 Things Learned
- (fill after completing)

#### 📕 Mistakes Made
- (fill after completing)

#### 📘 Things to Remember
- Image generation is tool-based — works with ANY text model, not just vision models
- DALL-E 3 `b64_json` response format avoids URL expiration issues (URLs expire in 1 hour)
- Save generated images to app storage immediately — don't rely on remote URLs
- Image gen API keys are separate from chat API keys — user may have OpenAI key just for images
- Tool-based approach means the AI decides when to generate — natural language trigger, no button
- `generate_image` tool should NOT be registered when no image gen key exists — avoids confusing the AI
- Code block "Save" uses language tag to infer extension — `python` → `.py`, `javascript` → `.js`
- Markdown image rendering needs lazy loading — large images can freeze the UI

---

### Sprint 21 — Model Capability Badges
> **Goal:** Model picker shows capability icons for each model — what it can do (vision, image gen, PDF reading, tool calling, thinking/reasoning). Users can visually identify which models support which features at a glance.
> **Duration:** ~2 hours

#### Prerequisites
- Sprint 8 (model picker) must be complete
- Sprint 19 (document intelligence) and Sprint 20 (image gen) define the capabilities to surface

#### Tasks
- [ ] **21.1** Define model capability types (`src/types/index.ts`)
  ```typescript
  type ModelCapability = 'vision' | 'image-gen' | 'pdf' | 'tools' | 'thinking' | 'long-context';

  // Extend Model interface
  interface Model {
    id: string;
    name: string;
    provider: string;
    pricing?: { prompt: number; completion: number };
    capabilities?: ModelCapability[];  // NEW
    contextWindow?: number;            // NEW — token limit
  }
  ```
- [ ] **21.2** Create capability detection module (`src/lib/models/capabilities.ts`)
  - `getModelCapabilities(modelId: string, provider: string) → ModelCapability[]`
  - Pattern-matching on model IDs for known capabilities:
    - **Vision**: `gpt-4o`, `gpt-4-vision`, `claude-3*`, `gemini-*` (most modern models)
    - **Image gen**: models with native image generation (Gemini 2.0 Imagen) — distinct from tool-based gen
    - **PDF**: `claude-*` (native), `gemini-*` (native), others via client extraction
    - **Tools**: most modern models (gpt-4o, claude-3+, gemini-1.5+, etc.)
    - **Thinking**: `o1`, `o3`, `gemini-2.5*`, `claude-3-7-sonnet`, `claude-sonnet-4`, `deepseek-r1`
    - **Long context**: models with >100K context window
  - Hardcoded capability map for known models + heuristic fallback for unknown ones
  - Cache results in memory (Map) — capabilities don't change per session
- [ ] **21.3** Create capability icon component (`src/components/chat/CapabilityBadges.tsx`)
  - Horizontal row of small icons representing capabilities
  - Icons (from `lucide-react-native`):
    - Vision: `lucide Eye`
    - Image gen: `lucide ImagePlus`
    - PDF: `lucide FileText`
    - Tools: `lucide Wrench`
    - Thinking: `lucide Brain`
    - Long context: `lucide ScrollText`
  - Size: 12px icons, `text-muted-foreground`, 4px gap
  - Tap row → shows tooltip with capability names (e.g., "Vision • Image Generation • Tools")
- [ ] **21.4** Integrate badges into ModelPicker
  - Each model row in the picker shows capability icons below the model name
  - Layout: model name (14sp bold) on first line, capability icons (12px, muted) on second line
  - Helps users choose the right model for their task
- [ ] **21.5** Add capability filter to ModelPicker
  - Filter pills at top of model picker: "Vision", "Tools", "Thinking"
  - Tap a filter → only show models with that capability
  - Multiple filters → intersection (model must have ALL selected capabilities)
  - Active filter: `bg-foreground text-background`, inactive: `bg-muted text-muted-foreground`
- [ ] **21.6** Show active model capabilities in chat top bar
  - ModelPill shows 1-2 most relevant capability icons alongside the model name
  - Only show icons for "premium" capabilities (vision, thinking, image-gen) — skip common ones (tools)
  - Helps users know at a glance what the current model can do
- [ ] **21.7** Verify: capability badges and filters work

#### How to Test Sprint 21
```
✅ Open model picker → each model shows capability icons
✅ GPT-4o shows: Eye (vision) + Wrench (tools)
✅ Claude Sonnet 4 shows: Eye + Brain (thinking) + FileText (PDF) + Wrench
✅ Gemini 2.5 shows: Eye + Brain + FileText + Wrench + ScrollText (long context)
✅ Tap filter "Vision" → only vision-capable models shown
✅ Tap filter "Thinking" → only reasoning models shown
✅ ModelPill in top bar shows 1-2 capability icons next to model name
✅ Unknown/custom models → no capability icons (graceful degradation)
```

#### 📗 Things Learned
- (fill after completing)

#### 📕 Mistakes Made
- (fill after completing)

#### 📘 Things to Remember
- Capability detection is heuristic — can't know every model's capabilities
- Hardcode known models, use patterns for unknown ones (e.g., any model with "vision" in name)
- OpenRouter model list includes some metadata — use it when available
- Keep icons small (12px) — they're supplementary info, not primary UI
- Filter is AND logic — selecting Vision + Thinking shows only models with BOTH
- Cache capabilities in memory — no need for persistent storage
- Provider-specific nuances: "PDF support" via Anthropic/Gemini is native, via others is client-side extraction
- "Image gen" capability badge is for models with NATIVE image output (Gemini Imagen) — tool-based gen (Sprint 20) works with any model

---

### Data & Export (Sprints 22–23)

- **Sprint 22**: Backup & restore (~3h)
  - Export all conversations as JSON (with attachments as base64)
  - Import conversations from JSON
  - Export/import settings (API keys optionally excluded for security)
  - Share individual conversations as Markdown
- **Sprint 23**: Cloud sync (Google Drive / local backup) (~4h)

### Polish & Platform (Sprints 24–27)

- **Sprint 24**: TTS + response actions (~3h)
  - Text-to-speech via `expo-speech` (per-message speaker icon, auto-play option)
  - Copy code block button in markdown renderer
  - Re-generate last response button (retry with same prompt)
  - Undo snackbar for conversation/message deletions
- **Sprint 25**: Swipe to branch (alternate response timelines)
- **Sprint 26**: Multi-model compare (side-by-side responses from different models)
- **Sprint 27**: Widgets (Android home screen — quick chat, continue conversation)

---

## 📦 Full Dependency List

> **Note**: NativeWind v4 + Tailwind CSS v3 (NOT v5/v4) — see "Things to Remember" above.

```json
{
  "dependencies": {
    "expo": "~55.0.0",
    "expo-router": "~55.0.0",
    "expo-secure-store": "~55.0.0",
    "expo-local-authentication": "~55.0.0",
    "expo-sqlite": "~55.0.0",
    "expo-status-bar": "~55.0.0",
    "expo-sharing": "~55.0.0",
    "expo-clipboard": "~55.0.0",
    "expo-haptics": "~55.0.0",
    "react": "~19.2.0",
    "react-native": "~0.83.4",
    "nativewind": "4.2.3",
    "react-native-css": "latest",
    "react-native-mmkv": "latest",
    "react-native-keyboard-controller": "latest",
    "zustand": "^5.0.0",
    "uuid": "^13.0.0",
    "react-native-marked": "latest",
    "@shopify/flash-list": "latest",
    "@gorhom/bottom-sheet": "^5.0.0",
    "react-native-reanimated": "latest",
    "react-native-gesture-handler": "latest",
    "react-native-safe-area-context": "latest",
    "react-native-screens": "latest",
    "react-native-drawer-layout": "latest",
    "lucide-react-native": "latest",
    "@google/generative-ai": "latest",
    "class-variance-authority": "latest",
    "clsx": "latest",
    "tailwind-merge": "latest",
    "@rn-primitives/portal": "latest",
    "@rn-primitives/slot": "latest",
    "@rn-primitives/separator": "latest",
    "@rn-primitives/label": "latest"
  },
  "devDependencies": {
    "tailwindcss": "3.4",
    "tailwindcss-animate": "latest",
    "autoprefixer": "latest",
    "postcss": "latest",
    "@babel/plugin-transform-react-jsx": "latest"
  }
}
```

> **Note**: Use `npx expo install` for expo packages to get compatible versions.
> Use `npm install` for non-expo packages.




### Provider & Reliability (deferred)

- **Multi-service fallback chain** (~3h) — _skipped for now, not priority_
  - Ordered provider priority list in settings (drag to reorder)
  - Auto-retry on next provider when primary fails (rate limit, timeout, auth error)
  - Visual indicator showing which provider served the response
  - Configurable timeout + error classification
