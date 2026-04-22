# Phase 3 — File & Image Attachments

> **Goal:** Add attachment button to InputBar, image/document picker, preview tray, and persist attachments in SQLite.
> **Duration:** ~3 hours
> **Risk:** High — DB schema migration + new components + file management
> **Depends on:** Phase 1 complete. Phase 2 is independent (can be done in parallel).

---

## Install & Configure

### 1. Install
```bash
npx expo install expo-image-picker expo-document-picker
npx expo prebuild --clean
```

### 2. Update `app.json` plugins
Add to the plugins array:
```json
"expo-image-picker",
"expo-document-picker"
```

> `expo-image-picker` needs no special config for gallery access. Camera access is auto-configured by the plugin.

---

## Task 9.3.1 — Update Types

**File:** `src/types/index.ts`

Add the `Attachment` interface and update `Message`:

```typescript
// ADD after existing interfaces
export interface Attachment {
  id: string;
  type: 'image' | 'document';
  uri: string;           // local file URI (persistent app directory)
  name: string;          // display name (e.g. "photo.jpg", "report.pdf")
  mimeType: string;      // e.g. 'image/jpeg', 'application/pdf'
  size: number;          // file size in bytes
}

// UPDATE Message interface — add attachments field
export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning: string | null;
  attachments: Attachment[] | null;  // ← NEW FIELD
  status: 'complete' | 'streaming' | 'cancelled' | 'error';
  model: string | null;
  tokens_used: number | null;
  created_at: number;
}
```

---

## Task 9.3.2 — DB Schema Migration

**File:** `src/lib/db/schema.ts`

Add after the existing reasoning column migration (line 53-58):

```typescript
// Add attachments column (Sprint 9)
try {
  database.runSync('ALTER TABLE messages ADD COLUMN attachments TEXT');
} catch {
  // Column already exists — ignore
}
```

Attachments are stored as a JSON string: `JSON.stringify(Attachment[])`.

When reading, parse back: `JSON.parse(row.attachments) || null`.

---

## Task 9.3.3 — Update Message CRUD

**File:** `src/lib/db/messages.ts`

### Update `addMessage` signature
```typescript
export function addMessage(
  conversationId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  model?: string,
  attachments?: Attachment[] | null  // ← NEW PARAM
): string {
  const db = getDatabase();
  const id = uuidv4();
  const now = Date.now();

  db.runSync(
    `INSERT INTO messages (id, conversation_id, role, content, status, model, attachments, created_at)
     VALUES (?, ?, ?, ?, 'complete', ?, ?, ?)`,
    [id, conversationId, role, content, model ?? null,
     attachments ? JSON.stringify(attachments) : null, now]
  );

  return id;
}
```

### Update `getMessages` to parse attachments
```typescript
export function getMessages(conversationId: string): Message[] {
  const db = getDatabase();
  const rows = db.getAllSync<any>(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
    [conversationId]
  );
  return rows.map((row) => ({
    ...row,
    attachments: row.attachments ? JSON.parse(row.attachments) : null,
  }));
}
```

### Update `updateMessage` to support attachments
Add to the fields type and the if-chain:
```typescript
export function updateMessage(
  id: string,
  fields: Partial<Pick<Message, 'content' | 'status' | 'tokens_used' | 'reasoning' | 'attachments'>>
): void {
  // ... existing code ...

  if (fields.attachments !== undefined) {
    sets.push('attachments = ?');
    values.push(fields.attachments ? JSON.stringify(fields.attachments) : null);
  }

  // ... rest unchanged ...
}
```

---

## Task 9.3.4 — Create Attachment Storage Helper

**File:** `src/lib/attachments/storage.ts`

Picked files are in temp/cache directories. Copy them to the app's persistent document directory so they survive cache clearing.

```typescript
import * as FileSystem from 'expo-file-system';
import { v4 as uuidv4 } from 'uuid';

const ATTACHMENTS_DIR = `${FileSystem.documentDirectory}attachments/`;

/**
 * Ensure the attachments directory exists.
 */
async function ensureAttachmentsDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(ATTACHMENTS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(ATTACHMENTS_DIR, { intermediates: true });
  }
}

/**
 * Copy a picked file from cache/temp to persistent storage.
 * Returns the new persistent URI.
 */
export async function persistAttachment(
  sourceUri: string,
  fileName: string
): Promise<string> {
  await ensureAttachmentsDir();

  const ext = fileName.split('.').pop() || '';
  const persistedName = `${uuidv4()}.${ext}`;
  const destUri = `${ATTACHMENTS_DIR}${persistedName}`;

  await FileSystem.copyAsync({ from: sourceUri, to: destUri });
  return destUri;
}

/**
 * Delete a persisted attachment file.
 */
export async function deleteAttachmentFile(uri: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await FileSystem.deleteAsync(uri);
    }
  } catch {
    // Ignore — file already gone
  }
}

/**
 * Get file size in human-readable format.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

---

## Task 9.3.5 — Create Attachment Picker Helper

**File:** `src/lib/attachments/picker.ts`

```typescript
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { v4 as uuidv4 } from 'uuid';
import { persistAttachment } from './storage';
import type { Attachment } from '@/types';

// Max file size: 20MB
const MAX_FILE_SIZE = 20 * 1024 * 1024;

/**
 * Pick images from gallery.
 * Returns array of Attachment objects (already persisted to app storage).
 */
export async function pickImages(): Promise<Attachment[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    quality: 0.8,
    selectionLimit: 5,
  });

  if (result.canceled || !result.assets.length) return [];

  const attachments: Attachment[] = [];

  for (const asset of result.assets) {
    const fileName = asset.fileName || `image_${Date.now()}.jpg`;
    const fileSize = asset.fileSize || 0;

    if (fileSize > MAX_FILE_SIZE) continue; // skip oversized

    const persistedUri = await persistAttachment(asset.uri, fileName);

    attachments.push({
      id: uuidv4(),
      type: 'image',
      uri: persistedUri,
      name: fileName,
      mimeType: asset.mimeType || 'image/jpeg',
      size: fileSize,
    });
  }

  return attachments;
}

/**
 * Take a photo with camera.
 */
export async function takePhoto(): Promise<Attachment | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchCameraAsync({
    quality: 0.8,
  });

  if (result.canceled || !result.assets.length) return null;

  const asset = result.assets[0];
  const fileName = asset.fileName || `photo_${Date.now()}.jpg`;
  const persistedUri = await persistAttachment(asset.uri, fileName);

  return {
    id: uuidv4(),
    type: 'image',
    uri: persistedUri,
    name: fileName,
    mimeType: asset.mimeType || 'image/jpeg',
    size: asset.fileSize || 0,
  };
}

/**
 * Pick documents (PDF, TXT, etc.)
 */
export async function pickDocuments(): Promise<Attachment[]> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
    type: [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/json',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  });

  if (result.canceled || !result.assets.length) return [];

  const attachments: Attachment[] = [];

  for (const asset of result.assets) {
    if (asset.size && asset.size > MAX_FILE_SIZE) continue;

    const persistedUri = await persistAttachment(asset.uri, asset.name);

    attachments.push({
      id: uuidv4(),
      type: 'document',
      uri: persistedUri,
      name: asset.name,
      mimeType: asset.mimeType || 'application/octet-stream',
      size: asset.size || 0,
    });
  }

  return attachments;
}
```

---

## Task 9.3.6 — Create AttachmentTray Component

**File:** `src/components/chat/AttachmentTray.tsx`

Renders preview chips for pending attachments above the InputBar text field.

```tsx
import React from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { X, FileText, Image as ImageIcon } from 'lucide-react-native';
import { formatFileSize } from '@/lib/attachments/storage';
import type { Attachment } from '@/types';

interface AttachmentTrayProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}

export function AttachmentTray({ attachments, onRemove }: AttachmentTrayProps) {
  if (attachments.length === 0) return null;

  return (
    <View className="flex-row flex-wrap gap-2 px-1 pb-2">
      {attachments.map((att) => (
        <View
          key={att.id}
          className="flex-row items-center bg-muted rounded-lg px-2 py-1.5 gap-2 max-w-[180px]"
        >
          {/* Thumbnail or icon */}
          {att.type === 'image' ? (
            <Image
              source={{ uri: att.uri }}
              className="w-8 h-8 rounded"
              resizeMode="cover"
            />
          ) : (
            <View className="w-8 h-8 rounded bg-surface-container items-center justify-center">
              <FileText size={14} color="hsl(0, 0%, 63%)" />
            </View>
          )}

          {/* File info */}
          <View className="flex-1 min-w-0">
            <Text className="text-foreground text-[12px]" numberOfLines={1}>
              {att.name}
            </Text>
            <Text className="text-muted-foreground text-[10px]">
              {formatFileSize(att.size)}
            </Text>
          </View>

          {/* Remove button */}
          <Pressable
            onPress={() => onRemove(att.id)}
            className="w-5 h-5 rounded-full bg-outline-variant/30 items-center justify-center"
            hitSlop={8}
          >
            <X size={10} color="hsl(0, 0%, 63%)" />
          </Pressable>
        </View>
      ))}
    </View>
  );
}
```

---

## Task 9.3.7 — Create AttachmentButton Component

**File:** `src/components/chat/AttachmentButton.tsx`

The "+" button that shows a bottom sheet or action menu for picking images/documents.

```tsx
import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { Plus, ImageIcon, FileText, Camera } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { pickImages, takePhoto, pickDocuments } from '@/lib/attachments/picker';
import type { Attachment } from '@/types';

interface AttachmentButtonProps {
  onAttach: (attachments: Attachment[]) => void;
  disabled?: boolean;
}

export function AttachmentButton({ onAttach, disabled }: AttachmentButtonProps) {
  const [showMenu, setShowMenu] = useState(false);

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowMenu(true);
  }, []);

  const handlePickImages = useCallback(async () => {
    setShowMenu(false);
    try {
      const attachments = await pickImages();
      if (attachments.length > 0) onAttach(attachments);
    } catch (e) {
      Alert.alert('Error', 'Failed to pick images');
    }
  }, [onAttach]);

  const handleTakePhoto = useCallback(async () => {
    setShowMenu(false);
    try {
      const attachment = await takePhoto();
      if (attachment) onAttach([attachment]);
    } catch (e) {
      Alert.alert('Error', 'Failed to take photo');
    }
  }, [onAttach]);

  const handlePickDocuments = useCallback(async () => {
    setShowMenu(false);
    try {
      const attachments = await pickDocuments();
      if (attachments.length > 0) onAttach(attachments);
    } catch (e) {
      Alert.alert('Error', 'Failed to pick documents');
    }
  }, [onAttach]);

  // Simple approach: use Alert.alert as action sheet
  // For a more polished UI, replace with a BottomSheet
  const showActionSheet = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      'Add Attachment',
      undefined,
      [
        { text: 'Photo Library', onPress: handlePickImages },
        { text: 'Take Photo', onPress: handleTakePhoto },
        { text: 'Document', onPress: handlePickDocuments },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, [handlePickImages, handleTakePhoto, handlePickDocuments]);

  return (
    <Pressable
      onPress={showActionSheet}
      disabled={disabled}
      className="w-8 h-8 rounded-full bg-muted items-center justify-center mb-1 active:scale-95"
    >
      <Plus size={18} color="hsl(0, 0%, 63%)" />
    </Pressable>
  );
}
```

> **Polish later:** Replace `Alert.alert` action sheet with a proper `@gorhom/bottom-sheet` picker menu using Nova design (dark bg, lucide icons, etc.). The logic stays the same.

---

## Task 9.3.8 — Integrate Attachments into InputBar

**File:** `src/components/chat/InputBar.tsx`

Update the InputBar to include AttachmentButton and AttachmentTray:

```tsx
// ADD these imports
import { AttachmentTray } from '@/components/chat/AttachmentTray';
import { AttachmentButton } from '@/components/chat/AttachmentButton';
import { deleteAttachmentFile } from '@/lib/attachments/storage';
import type { Attachment } from '@/types';

// ADD to InputBarProps
interface InputBarProps {
  onSend: (text: string, attachments?: Attachment[]) => void;  // ← updated signature
  onStop: () => void;
}

// Inside InputBar component, ADD state:
const [attachments, setAttachments] = useState<Attachment[]>([]);

// ADD handlers:
const handleAttach = useCallback((newAttachments: Attachment[]) => {
  setAttachments((prev) => [...prev, ...newAttachments].slice(0, 10)); // max 10
}, []);

const handleRemoveAttachment = useCallback((id: string) => {
  setAttachments((prev) => {
    const removed = prev.find((a) => a.id === id);
    if (removed) deleteAttachmentFile(removed.uri); // clean up file
    return prev.filter((a) => a.id !== id);
  });
}, []);

// UPDATE handleSend:
const handleSend = useCallback(() => {
  const trimmed = text.trim();
  if (!trimmed && attachments.length === 0) return; // need text OR attachments
  if (isStreaming) return;

  // ... existing animation + haptics ...

  onSend(trimmed, attachments.length > 0 ? attachments : undefined);
  setText('');
  setAttachments([]); // clear after send
}, [text, attachments, isStreaming, onSend, scaleAnim]);

// UPDATE hasText check — also consider attachments:
const canSend = text.trim().length > 0 || attachments.length > 0;
```

### Updated JSX Structure
```tsx
return (
  <View className="px-4 pt-2 bg-background" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
    {isRecording ? (
      <VoiceInput ... />
    ) : (
      <View className="bg-surface-container-low border border-outline-variant/20 rounded-2xl p-2">
        {/* Attachment preview tray */}
        <AttachmentTray
          attachments={attachments}
          onRemove={handleRemoveAttachment}
        />

        {/* Input row */}
        <View className="flex-row items-end gap-2">
          {/* Attachment button */}
          <AttachmentButton
            onAttach={handleAttach}
            disabled={isStreaming}
          />

          {/* Text input */}
          <TextInput ... />

          {/* Mic button — only when no text, no attachments, not streaming */}
          {!canSend && !isStreaming && (
            <Pressable onPress={handleMicPress} ...>
              <Mic size={16} ... />
            </Pressable>
          )}

          {/* Send / Stop button */}
          {isStreaming ? (
            <Pressable onPress={onStop} ...>
              <Square ... />
            </Pressable>
          ) : canSend ? (
            <Animated.View ...>
              <Pressable onPress={handleSend} ...>
                <ArrowUp ... />
              </Pressable>
            </Animated.View>
          ) : null}
        </View>
      </View>
    )}
  </View>
);
```

---

## Task 9.3.9 — Update ChatScreen to Pass Attachments

**File:** `src/components/chat/ChatScreen.tsx`

Update `handleSend` to accept and persist attachments:

```typescript
const handleSend = useCallback(
  async (text: string, attachments?: Attachment[]) => {
    const providerId = lastProvider || 'openrouter';
    const model = lastModel || getDefaultModel(providerId);
    let convId = currentConvId;

    if (!convId) {
      const title = text.replace(/\n/g, ' ').slice(0, 50);
      convId = createConversation(title, model);
      setCurrentConvId(convId);
      setActiveConversation(convId);
    }

    // Save user message with attachments
    const userMsgId = addMessage(convId, 'user', text, model, attachments || null);
    const userMsg: Message = {
      id: userMsgId,
      conversation_id: convId,
      role: 'user',
      content: text,
      reasoning: null,
      attachments: attachments || null,
      status: 'complete',
      model,
      tokens_used: null,
      created_at: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);

    // ... rest unchanged (auto-title, streamNewResponse) ...
  },
  [/* existing deps */]
);
```

---

## Task 9.3.10 — Show Attachments in MessageBubble

**File:** `src/components/chat/MessageBubble.tsx`

Add attachment rendering to user message bubbles. Add an image gallery and file chip display below the message text.

```tsx
// Inside MessageBubble, after the text content for user messages:
{message.attachments && message.attachments.length > 0 && (
  <View className="flex-row flex-wrap gap-2 mt-2">
    {message.attachments.map((att) => (
      att.type === 'image' ? (
        <Image
          key={att.id}
          source={{ uri: att.uri }}
          className="w-24 h-24 rounded-lg"
          resizeMode="cover"
        />
      ) : (
        <View
          key={att.id}
          className="flex-row items-center bg-muted/50 rounded-lg px-2 py-1.5 gap-1.5"
        >
          <FileText size={12} color="hsl(0, 0%, 63%)" />
          <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
            {att.name}
          </Text>
        </View>
      )
    ))}
  </View>
)}
```

---

## How to Test Phase 3

```
✅ "+" button visible in InputBar
✅ Tap "+" → action sheet shows Photo Library / Take Photo / Document
✅ Pick image from gallery → preview chip appears in attachment tray
✅ Pick multiple images → multiple chips appear (max 10)
✅ Pick document (PDF) → document chip with file icon appears
✅ Tap X on chip → attachment removed, file deleted from storage
✅ Send message with attachments → message bubble shows image thumbnails
✅ Send message with text + attachments → both visible in bubble
✅ Send with only attachments (empty text) → works
✅ Attachments persist in SQLite (restart app, open conversation → attachments still visible)
✅ File size shown on attachment chips
✅ Oversized files (>20MB) are silently skipped
✅ Camera permission requested on first "Take Photo" attempt
```

---

## 📘 Things to Remember

- Picked files are in temp/cache → MUST copy to `documentDirectory` for persistence
- SQLite stores attachments as JSON string — `JSON.parse` on read, `JSON.stringify` on write
- The `addMessage` signature change is **backward compatible** — `attachments` param is optional
- `expo-image-picker` `launchImageLibraryAsync` returns `{ canceled, assets }` — check `canceled` first
- `expo-document-picker` `getDocumentAsync` returns same shape `{ canceled, assets }`
- `selectionLimit: 5` limits multi-select in image picker (set 0 for unlimited)
- `quality: 0.8` compresses images — saves storage and makes base64 encoding faster for Phase 4
- `copyToCacheDirectory: true` in DocumentPicker ensures the file is accessible (some providers return content:// URIs)
- Don't store attachment files in cache directory — they get cleared. Use `documentDirectory/attachments/`
- When deleting a message with attachments, also delete the attachment files (cleanup)
- Max 10 attachments per message is a UX limit — adjust as needed
