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
- [ ] **8.1** Add Gemini provider (`src/lib/providers/gemini.ts`)
  - Uses `@google/generative-ai` SDK (has RN-compatible streaming)
  - Implements same AIProvider interface
  - Direct API calls with user's Gemini API key
- [ ] **8.2** Add Anthropic provider (`src/lib/providers/anthropic.ts`)
  - Uses OpenAI-compatible format OR Anthropic SDK
  - SSE streaming (same parser as OpenRouter)
  - Handle Anthropic-specific response format (`content_block_delta`)
- [ ] **8.3** Update onboarding for multiple providers
  - Provider selection: OpenRouter, Gemini, Anthropic
  - Can add multiple keys
  - Model picker groups by provider
- [ ] **8.4** Update model picker
  - Tabs or sections per provider
  - Show which providers have active keys
  - "Add key" inline if provider has no key
- [ ] **8.5** Performance optimization
  - Replace FlatList with `@shopify/flash-list` for chat history
  - Memoize message bubbles (React.memo)
  - Profile and fix any jank during streaming
- [ ] **8.6** Error states & edge cases
  - No internet → show offline banner
  - API error → show error bubble with "Retry" button
  - Very long messages → virtualized rendering
  - App backgrounded during stream → handle gracefully
- [ ] **8.7** App icon + splash screen
  - Generate Medha app icon (use generate_image tool)
  - Configure in app.json
  - Splash screen with app logo
- [ ] **8.8** README.md for GitHub
  - Project description, screenshots, setup instructions
  - Feature list, tech stack, architecture diagram
  - License (MIT)
- [ ] **8.9** Final verification pass

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

**Total: ~24 hours** (fits a 2–3 weekend project)

---

## 🔮 Future Sprints (Post-MVP, Cool/Nice features)

These are not in scope for the initial build but documented for later:

- **Sprint 9**: Thinking mode toggle (CoT blocks for o1/Gemini thinking/Claude extended thinking)
- **Sprint 10**: Swipe to branch (alternate timelines)
- **Sprint 11**: Token + cost estimator (live counter in input bar)
- **Sprint 12**: TTS playback + voice input
- **Sprint 13**: Slash commands (/summarize /translate /code)
- **Sprint 14**: Multi-model compare (side-by-side responses)
- **Sprint 15**: Fallback chain (auto-retry on next model)
- **Sprint 16**: File attachments (PDF/image upload)
- **Sprint 17**: Conversation export (PDF, Markdown)
- **Sprint 18**: Usage dashboard (token spend charts)
- **Sprint 19**: Widgets (Android home screen)
- **Sprint 20**: Cloud sync (Google Drive JSON)

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
