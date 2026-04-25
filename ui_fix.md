# UI Fix Reference — Bottom Sheets & Modal Overlays

## Bug: `@gorhom/bottom-sheet` Not Rendering

### Symptom
Pressing the Chat Settings button fired haptic feedback (proving the handler ran and Zustand state updated), but nothing appeared on screen. No error, no crash — just invisible.

### Root Cause
`@gorhom/bottom-sheet`'s `BottomSheet` component was used with a **conditional mount pattern**:

```tsx
// ❌ Broken pattern
if (!isOpen) return null;

return (
  <BottomSheet index={0} snapPoints={['50%']} ...>
    {/* content */}
  </BottomSheet>
);
```

**Why it fails:**
1. When `isOpen` becomes `true`, the component goes from returning `null` to rendering `<BottomSheet index={0}>`.
2. The sheet mounts fresh with `index={0}`, meaning it's *already* at the open position — but `@gorhom/bottom-sheet` doesn't trigger an animation for the initial mount.
3. Adding a `useEffect` to call `snapToIndex(0)` is a **no-op** because the sheet is already at index 0.
4. The result: the sheet's internal layout/animation state is inconsistent, and it renders invisibly or off-screen.

### What Didn't Work
1. **Adding `useEffect` with `snapToIndex(0)`** — No-op since `index` was already 0 on mount.
2. **Always-mounted with `index={-1}` + `snapToIndex(0)` on open** — Still unreliable in this app's component tree (likely z-index or provider issues with `@gorhom/bottom-sheet` outside a `BottomSheetModalProvider`).

### What Worked: React Native `Modal`
Replaced `@gorhom/bottom-sheet` entirely with RN's built-in `Modal` + a custom bottom card — the same pattern used by `ThemePicker` and `MessageActionsMenu` (both proven working).

```tsx
// ✅ Working pattern — matches ThemePicker, MessageActionsMenu
<Modal
  visible={isOpen}
  transparent
  animationType="slide"
  onRequestClose={close}
  statusBarTranslucent
>
  <KeyboardAvoidingView
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}
  >
    {/* Tap-to-dismiss */}
    <Pressable onPress={close} style={{ flex: 1 }} />

    {/* Bottom card */}
    <View style={{
      backgroundColor: cardBg,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingBottom: 40,
    }}>
      {/* content */}
    </View>
  </KeyboardAvoidingView>
</Modal>
```

---

## Rule: When to Use What

| Approach | Use When | Notes |
|---|---|---|
| **RN `Modal`** | Any overlay/sheet in Medha | Proven reliable. All working overlays use this. |
| `@gorhom/bottom-sheet` | **Avoid** unless absolutely needed (e.g. scrollable lists with drag-to-dismiss) | Requires careful provider setup, z-index management, and no conditional rendering. |

---

## Keyboard Handling in Modals

### Problem
`react-native-keyboard-controller`'s `KeyboardProvider` (in `_layout.tsx`) does **not** propagate into RN `Modal` components. So `KeyboardAwareScrollView` and `KeyboardStickyView` won't work inside modals.

### Solution
Use React Native's built-in `KeyboardAvoidingView` inside the Modal:

```tsx
<Modal visible={isOpen} transparent statusBarTranslucent>
  <KeyboardAvoidingView
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}
  >
    {/* backdrop + card content */}
  </KeyboardAvoidingView>
</Modal>
```

- `behavior="padding"` on iOS, `"height"` on Android
- Put the dimmed background on the `KeyboardAvoidingView`, not the backdrop `Pressable`
- The card naturally slides up when the keyboard appears

---

## Checklist for New Overlay Components

1. **Use `Modal`** — not `@gorhom/bottom-sheet`
2. **`animationType="slide"`** for bottom sheets, `"fade"` for centered dialogs
3. **`transparent` + `statusBarTranslucent`** always
4. **`onRequestClose`** — wire to close handler (required for Android back button)
5. **Tap-to-dismiss** — `<Pressable onPress={close} style={{ flex: 1 }} />`
6. **Keyboard inputs?** — Wrap in `KeyboardAvoidingView` (not `KeyboardAwareScrollView`)
7. **Theme-aware colors** — Read `currentTheme` from settings store, compute `isLight` flag
8. **Register in `_layout.tsx`** back-button handler priority chain
