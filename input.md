# Medha — Input Enhancement Plan (Sprint 9)

> **Goal:** Transform the InputBar from a plain text-only input into a Claude/ChatGPT-grade input system with keyboard avoidance, voice input (STT), and file/image attachments.
> **Duration:** ~8 hours across 4 phases
> **Prerequisite:** All Sprints 0–8 complete

---

## 📋 Current State Audit

### What's Already Installed (in `package.json`)
| Package | Version | Status |
|---------|---------|--------|
| `react-native-keyboard-controller` | ^1.21.5 | ✅ Installed, **NOT USED** — app uses `KeyboardAvoidingView` everywhere |
| `expo-file-system` | ~55.0.16 | ✅ Installed |
| `@gorhom/bottom-sheet` | ^5.2.9 | ✅ Installed |
| `react-native-reanimated` | 4.2.1 | ✅ Installed |
| `react-native-gesture-handler` | ~2.30.0 | ✅ Installed |

### What Needs Installing
| Package | Purpose | Install Command |
|---------|---------|----------------|
| `expo-speech-recognition` | On-device STT with volume metering | `npx expo install expo-speech-recognition` |
| `expo-image-picker` | Pick images from gallery/camera | `npx expo install expo-image-picker` |
| `expo-document-picker` | Pick files (PDF, txt, etc.) | `npx expo install expo-document-picker` |

> **Note:** `expo-audio` is NOT needed. `expo-speech-recognition` handles live STT directly — no separate recording step required. Only add `expo-audio` later if you want Whisper-based transcription of pre-recorded audio files.

### Files That Will Be Modified
| File | Change |
|------|--------|
| `src/app/_layout.tsx` | Wrap app in `KeyboardProvider` |
| `src/components/chat/ChatScreen.tsx` | Replace `KeyboardAvoidingView` with keyboard-controller |
| `src/components/chat/InputBar.tsx` | Full rebuild — attachment tray, mic button, auto-grow |
| `src/app/onboarding.tsx` | Replace `KeyboardAvoidingView` |
| `src/app/settings/api-keys.tsx` | Replace `KeyboardAvoidingView` |
| `src/types/index.ts` | Add `Attachment` type, update `Message` type |
| `src/lib/db/schema.ts` | Add `attachments` column migration |
| `src/lib/db/messages.ts` | Update CRUD for attachments |
| `src/stores/ui-store.ts` | Add attachment tray state |
| `app.json` | Add plugins for speech-recognition, image-picker |

### Files That Will Be Created
| File | Purpose |
|------|---------|
| `src/components/chat/AttachmentTray.tsx` | Attachment preview chips with remove button |
| `src/components/chat/VoiceInput.tsx` | Mic button + recording overlay with waveform |
| `src/components/chat/AttachmentButton.tsx` | "+" button that opens picker sheet |
| `src/lib/attachments/picker.ts` | Unified picker logic (image + document) |
| `src/lib/attachments/storage.ts` | Copy picked files to app's persistent directory |

---

## 🏗️ Architecture Changes

### Message Type Update
```typescript
// src/types/index.ts — ADD this interface
export interface Attachment {
  id: string;
  type: 'image' | 'document';
  uri: string;           // local file URI
  name: string;          // display name
  mimeType: string;      // e.g. 'image/jpeg', 'application/pdf'
  size: number;          // bytes
}

// UPDATE existing Message interface
export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning: string | null;
  attachments: Attachment[] | null;  // ← NEW
  status: 'complete' | 'streaming' | 'cancelled' | 'error';
  model: string | null;
  tokens_used: number | null;
  created_at: number;
}
```

### DB Schema Migration
```sql
-- In schema.ts initializeDatabase(), add after existing reasoning migration:
ALTER TABLE messages ADD COLUMN attachments TEXT;
-- Stored as JSON string: JSON.stringify(Attachment[])
-- Read back: JSON.parse(row.attachments) || null
```

### Keyboard Architecture
```
BEFORE (broken on Android edge-to-edge):
  <KeyboardAvoidingView behavior="padding">
    <MessageList />
    <InputBar />
  </KeyboardAvoidingView>

AFTER (proper keyboard handling):
  // _layout.tsx — wrap entire app
  <KeyboardProvider>
    <GestureHandlerRootView>
      <SafeAreaProvider>
        ...
      </SafeAreaProvider>
    </GestureHandlerRootView>
  </KeyboardProvider>

  // ChatScreen.tsx — no KeyboardAvoidingView needed
  <View style={{ flex: 1 }}>
    <MessageList />
    <KeyboardStickyView offset={{ closed: 0, opened: bottomInset }}>
      <InputBar />
    </KeyboardStickyView>
  </View>
```

### InputBar Component Architecture
```
┌─────────────────────────────────────────────┐
│  [AttachmentTray - preview chips]            │ ← only visible when attachments.length > 0
├─────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────┐ │
│  │ [+] │ TextInput (auto-grow)  │ [🎤][➤] │ │
│  └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘

States:
- Empty: [+] button + placeholder + disabled send
- Has text: [+] button + text + active send (mic hidden)
- Has attachments: attachment chips above + [+] + text + send
- Recording: full-width recording overlay with waveform + cancel/send
- Streaming: stop button replaces send
```

---

## 🏃 Phase Breakdown

> Detailed implementation for each phase is in separate files:
> - **Phase 1:** `input-phase1-keyboard.md` — Keyboard controller swap (~1 hour)
> - **Phase 2:** `input-phase2-voice.md` — Voice input / STT (~2 hours)
> - **Phase 3:** `input-phase3-attachments.md` — File & image attachments (~3 hours)
> - **Phase 4:** `input-phase4-multimodal.md` — Wire attachments to provider layer (~2 hours)

### Phase Summary

| Phase | Scope | Risk | Dependencies |
|-------|-------|------|-------------|
| **1** | Swap `KeyboardAvoidingView` → `KeyboardProvider` + `KeyboardStickyView` | Low | None — keyboard-controller already installed |
| **2** | Mic button in InputBar + `expo-speech-recognition` live STT + waveform | Medium | Needs `npx expo prebuild` after install |
| **3** | Attachment button + image/document picker + preview tray + DB migration | High — schema change | Phase 1 done (InputBar restructured) |
| **4** | Send attachments to AI providers (base64 images for vision models) | High — API changes | Phase 3 done (attachments stored) |

---

## ⚠️ SDK 55 Gotchas

1. **New Architecture is mandatory** — Legacy Architecture dropped. All native modules must be Fabric/TurboModule compatible.
2. **`expo-av` is dropped in SDK 55** — Use `expo-audio` for recording, but for live STT use `expo-speech-recognition` directly (no recording step needed).
3. **`react-native-reusables` SDK 55 support** — Issue #521 is open. If you hit peer dep conflicts, add `legacy-peer-deps=true` to `.npmrc`. Current `.npmrc` only has `node-linker=hoisted`.
4. **`npx expo prebuild`** — Required after installing any native module (`expo-speech-recognition`, `expo-image-picker`). Run `npx expo prebuild --clean` to regenerate the `android/` directory.
5. **KeyboardProvider placement** — Must be OUTSIDE `GestureHandlerRootView` per the docs, but some setups work with it inside. Test both if crashes occur.

---

## 📦 Install Commands (Run All at Once)

```bash
# Install new packages
npx expo install expo-speech-recognition expo-image-picker expo-document-picker

# Update .npmrc if peer dep issues
echo "legacy-peer-deps=true" >> .npmrc

# Rebuild native code
npx expo prebuild --clean
```

### app.json Plugin Updates
```json
{
  "expo": {
    "plugins": [
      "expo-router",
      ["expo-splash-screen", { ... }],
      "expo-secure-store",
      "expo-sqlite",
      "expo-sharing",
      "expo-speech-recognition",
      "expo-image-picker",
      "expo-document-picker"
    ]
  }
}
```

---

## 🔮 What This Does NOT Cover (Future Sprints)

- **Drag-and-drop** — Not available in React Native without custom native module
- **DALL-E image generation** — ChatGPT-specific, not a BYOK feature
- **Message editing inline** — Already implemented in Sprint 7
- **Reasoning toggle** — Already implemented (ThinkingBlock component)
- **Model picker** — Already implemented (ModelPill + ModelPicker)
