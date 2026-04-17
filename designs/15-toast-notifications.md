# 15 — Toast / Snackbar Notifications

> Sprint 5, 7 · Transient feedback: "Copied", "Deleted", "Saved"

---

## Stitch Prompt

```
Design a mobile toast notification overlay for "Medha" — a premium AI chat client (Android, 393×852 viewport).

Design language:
- Style: shadcn Nova (--preset b0) — ultra-clean, monochromatic, dark-first
- Font: Inter for all text, Icons: Lucide stroke style
- No shadows, modern 2026 AI chat app

Show a normal active chat screen (a few messages visible, input bar at bottom). Overlaid at the bottom center (32px above the input bar):

TOAST:
- Floating pill shape, auto-width (fits content), centered horizontally
- Background: #FAFAFA
- Radius: 20px
- Height: 36px
- Padding: 8px vertical, 16px horizontal
- Content: Lucide Check 14px #09090B + "Copied to clipboard" 13sp Inter medium #09090B
- 4px gap between icon and text

The toast floats above the input bar and below the messages. It should feel like a brief, confident confirmation — appears for ~2 seconds then fades out.

Show 3 toast variants stacked vertically (for design reference, not actual stacking):
1. Lucide Check + "Copied to clipboard" (default)
2. Lucide Trash2 + "Message deleted" (with #09090B text, not red — toast is always white bg)
3. Lucide Bookmark + "Preset saved" (default)
```
