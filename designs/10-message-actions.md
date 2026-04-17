# 10 — Message Actions & Edit Mode

> Sprint 7 · Long-press actions, edit & resend, regenerate

---

## Stitch Prompt — Message Actions (long-press menu)

```
Design a mobile message action menu for "Medha" — a premium AI chat client (Android, 393×852 viewport).

Design language:
- Style: shadcn Nova (--preset b0) — ultra-clean, monochromatic, dark-first
- Background: #09090B, surfaces: #18181B, borders: 1px #27272A
- Font: Inter for all text, Icons: Lucide stroke style
- No color accents, no shadows, modern 2026 AI chat app

Show a chat conversation with a long-press context menu appearing over an assistant message.

1. BACKGROUND: dimmed chat screen, #000000 40% overlay
2. The long-pressed message is elevated (no visual change — just contextually focused)
3. ACTION MENU (floating, positioned near the message):
   - #0A0A0C bg, 12px radius, 1px #27272A border
   - 8px padding
   - Menu items (44px height each, 12px horizontal padding):
     - Lucide Copy 18px #A1A1AA + "Copy" 14sp #FAFAFA
     - Lucide Pencil 18px #A1A1AA + "Edit & Resend" 14sp #FAFAFA (only on user messages)
     - Lucide RefreshCw 18px #A1A1AA + "Regenerate" 14sp #FAFAFA (only on assistant messages)
     - Lucide Trash2 18px #EF4444 + "Delete" 14sp #EF4444
   - Dividers: 1px #27272A between items
```

---

## Stitch Prompt — Edit Mode

```
Design a mobile message edit mode for "Medha" — a premium AI chat client (Android, 393×852 viewport).

Same design language as above.

Show the chat screen where a user message is being edited in-place:

1. TOP BAR: same as normal chat but with "Editing" badge — 10sp #71717A in a pill
2. The user message bubble is replaced by an editable text area:
   - #18181B bg, 12px radius, 1px #D4D4D8 border (focus state — brighter border)
   - Contains the original message text, cursor blinking at end
   - Below the edit area: two buttons in a row (8px gap):
     - "Cancel" ghost button: #18181B bg, "Cancel" 13sp #A1A1AA, 36px height
     - "Send" primary button: #FAFAFA bg, "Send" 13sp #09090B, 36px height
3. All messages below the edited message are dimmed (#FAFAFA → #71717A) with a subtle "Will be replaced" label 10sp #71717A
4. Normal input bar at bottom is disabled/hidden during edit mode

Clear indication that editing will replay the conversation from this point.
```
