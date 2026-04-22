# Phase 1 — Keyboard Controller Swap

> **Goal:** Replace all `KeyboardAvoidingView` usage with `react-native-keyboard-controller` for proper keyboard avoidance on New Architecture.
> **Duration:** ~1 hour
> **Risk:** Low — package already installed, just needs wiring
> **Verify:** Keyboard opens → InputBar stays above keyboard → no overlapping → no jank

---

## Why This Matters

`KeyboardAvoidingView` from React Native has known issues:
- Android edge-to-edge displays: padding calculation is wrong
- New Architecture (Fabric): timing mismatches cause jank
- No native-driven animations — JS thread controls the shift

`react-native-keyboard-controller` solves all three — keyboard movement is driven by native animations on the UI thread.

---

## Task 9.1.1 — Wrap App in KeyboardProvider

**File:** `src/app/_layout.tsx`

The `KeyboardProvider` must wrap the entire app. It should go **outside** `SafeAreaProvider` but **inside** `GestureHandlerRootView`.

### Current Code (lines 186-194)
```tsx
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthGate />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
```

### Target Code
```tsx
import { KeyboardProvider } from 'react-native-keyboard-controller';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <AuthGate />
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
```

### Verification
- App boots without crash
- Open any screen with a TextInput → keyboard opens normally

---

## Task 9.1.2 — Replace KeyboardAvoidingView in ChatScreen

**File:** `src/components/chat/ChatScreen.tsx`

This is the most important swap — the chat input must stick above the keyboard.

### Current Code (lines 1-2, import)
```tsx
import { View, Pressable, KeyboardAvoidingView, AppState, type AppStateStatus } from 'react-native';
```

### Remove from import
Remove `KeyboardAvoidingView` from the react-native import.

### Add new import
```tsx
import { KeyboardStickyView } from 'react-native-keyboard-controller';
```

### Current JSX (lines 409-461)
```tsx
<KeyboardAvoidingView
  className="flex-1 bg-background"
  behavior="padding"
  keyboardVerticalOffset={0}
>
  {/* Top Bar */}
  <View ... >
    ...
  </View>

  {/* Offline Banner */}
  <OfflineBanner />

  {/* Content */}
  <View className="flex-1">
    {hasMessages ? (
      <MessageList ... />
    ) : (
      <EmptyState ... />
    )}
  </View>

  {/* Input */}
  <InputBar onSend={handleSend} onStop={handleStop} />
  <Toast ... />

  {/* Message Actions Menu */}
  <MessageActionsMenu ... />
</KeyboardAvoidingView>
```

### Target JSX
```tsx
<View className="flex-1 bg-background">
  {/* Top Bar */}
  <View
    className="flex-row items-center px-4 h-14"
    style={{ marginTop: insets.top }}
  >
    <Pressable onPress={openDrawer} className="w-10 h-10 items-center justify-center">
      <Menu size={24} color="hsl(0, 0%, 63%)" />
    </Pressable>
    <View className="flex-1 items-center px-2">
      <ModelPill />
    </View>
    <Pressable onPress={handleNewChat} className="w-10 h-10 items-center justify-center">
      <PenSquare size={20} color="hsl(0, 0%, 63%)" />
    </Pressable>
  </View>

  {/* Offline Banner */}
  <OfflineBanner />

  {/* Content */}
  <View className="flex-1">
    {hasMessages ? (
      <MessageList
        messages={messages}
        targetMessageId={focusMessageId}
        targetRequestKey={focusRequestKey}
        highlightedMessageId={highlightedMessageId}
        onEditSubmit={handleEditSubmit}
        onEditCancel={handleEditCancel}
        onRetry={handleRetry}
      />
    ) : (
      <EmptyState onSuggestionPress={handleSuggestion} />
    )}
  </View>

  {/* Input — sticks above keyboard */}
  <KeyboardStickyView
    offset={{ closed: 0, opened: 0 }}
  >
    <InputBar onSend={handleSend} onStop={handleStop} />
  </KeyboardStickyView>

  <Toast bottomOffset={Math.max(insets.bottom, 12) + 84} />

  {/* Message Actions Menu */}
  <MessageActionsMenu
    onEditAndResend={handleEditAndResend}
    onRegenerate={handleRegenerate}
    onDelete={handleDeleteMessage}
  />
</View>
```

### Key Changes
1. `<KeyboardAvoidingView>` → `<View>` (outer wrapper)
2. `<InputBar>` wrapped in `<KeyboardStickyView>` — this makes it stick above the keyboard natively
3. `behavior="padding"` and `keyboardVerticalOffset` are gone — `KeyboardStickyView` handles everything
4. The `offset` prop: `closed: 0` = position when keyboard is hidden, `opened: 0` = offset when keyboard is visible. If the InputBar has bottom padding from safe area, you may need `opened: -insets.bottom` to avoid double-padding.

### Verification
- Open chat → tap text input → keyboard opens → InputBar stays visible above keyboard
- Type message → send → keyboard stays open, InputBar stays in place
- Dismiss keyboard → InputBar returns to bottom with safe area padding
- No jank or jump during keyboard animation

---

## Task 9.1.3 — Update InputBar Bottom Padding

**File:** `src/components/chat/InputBar.tsx`

The InputBar currently applies its own bottom safe area padding. With `KeyboardStickyView`, when the keyboard is **open** the safe area padding should be removed (keyboard already provides the bottom boundary). When keyboard is **closed**, safe area padding should remain.

### Current Code (lines 46-49)
```tsx
const insets = useSafeAreaInsets();

return (
  <View className="px-4 pt-2 bg-background" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
```

### Option A — Simple (keep as-is)
If `KeyboardStickyView` with `offset={{ closed: 0, opened: 0 }}` works correctly and doesn't double-pad, leave the InputBar unchanged. Test this first.

### Option B — Dynamic (if double-padding occurs)
Use `useKeyboardHandler` from `react-native-keyboard-controller` to detect keyboard state:

```tsx
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle, interpolate } from 'react-native-reanimated';

// Inside InputBar:
const { height: kbHeight } = useReanimatedKeyboardAnimation();
const insets = useSafeAreaInsets();

const animatedPadding = useAnimatedStyle(() => ({
  paddingBottom: interpolate(
    kbHeight.value,
    [0, 1],           // keyboard closed → opened
    [Math.max(insets.bottom, 12), 8]  // safe area → minimal
  ),
}));

return (
  <Animated.View className="px-4 pt-2 bg-background" style={animatedPadding}>
    ...
  </Animated.View>
);
```

> **Try Option A first.** Only use Option B if you see a gap between the keyboard and InputBar.

---

## Task 9.1.4 — Replace KeyboardAvoidingView in Onboarding

**File:** `src/app/onboarding.tsx`

### Current (line 2, 142, 268)
```tsx
import { ..., KeyboardAvoidingView } from 'react-native';
// ...
<KeyboardAvoidingView behavior="padding" className="flex-1">
  <ScrollView ...>
    ...
  </ScrollView>
</KeyboardAvoidingView>
```

### Target
```tsx
import { ..., /* remove KeyboardAvoidingView */ } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
// ...
<View className="flex-1">
  <KeyboardAwareScrollView
    bottomOffset={62}
    contentContainerStyle={{ flexGrow: 1 }}
  >
    {/* existing ScrollView content, but remove the ScrollView wrapper */}
    ...
  </KeyboardAwareScrollView>
</View>
```

`KeyboardAwareScrollView` automatically scrolls to keep the focused input visible. The `bottomOffset` is the space between the focused input and the keyboard top.

---

## Task 9.1.5 — Replace KeyboardAvoidingView in API Keys

**File:** `src/app/settings/api-keys.tsx`

Same pattern as onboarding:

### Current (line 2, 127, 258)
```tsx
import { ..., KeyboardAvoidingView } from 'react-native';
<KeyboardAvoidingView behavior="padding" className="flex-1">
  <ScrollView ...>
```

### Target
```tsx
import { ..., /* remove KeyboardAvoidingView */ } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
// Replace ScrollView + KeyboardAvoidingView with:
<KeyboardAwareScrollView bottomOffset={62} contentContainerStyle={{ flexGrow: 1 }}>
  {/* existing content */}
</KeyboardAwareScrollView>
```

---

## How to Test Phase 1

```
✅ App boots without crash after adding KeyboardProvider
✅ ChatScreen: tap input → keyboard opens → InputBar sticks above keyboard (native animation)
✅ ChatScreen: send message while keyboard is open → InputBar stays in place
✅ ChatScreen: dismiss keyboard → InputBar returns to bottom with safe area padding
✅ ChatScreen: no double-padding gap between InputBar and keyboard
✅ Onboarding: tap API key input → keyboard opens → input scrolls into view
✅ API Keys settings: same keyboard behavior as onboarding
✅ Android back button still dismisses keyboard before navigating
✅ Drawer still opens/closes correctly with keyboard dismissed
```

---

## 📘 Things to Remember

- `KeyboardProvider` must be in the component tree before any `KeyboardStickyView` or `KeyboardAwareScrollView` usage
- `KeyboardStickyView` is for chat-style UIs where the input should "stick" to the keyboard
- `KeyboardAwareScrollView` is for form-style UIs where inputs should scroll into view
- The keyboard animation is native-driven (UI thread) — no JS thread blocking
- If you see crashes about "KeyboardControllerView not found", you need `npx expo prebuild --clean`
- `react-native-keyboard-controller` is already installed (v1.21.5) — no install needed
- Don't nest `KeyboardAwareScrollView` inside `KeyboardAvoidingView` — they conflict
