# 08 — System Prompt Editor

> Sprint 6 · Per-conversation system prompt + preset selection

---

## Stitch Prompt

```
Design a mobile system prompt editor for "Medha" — a premium AI chat client (Android, 393×852 viewport).

Design language:
- Style: shadcn Nova (--preset b0) — ultra-clean, monochromatic, dark-first
- Background: #09090B, surfaces: #18181B, borders: 1px #27272A
- Font: Inter for all text, Icons: Lucide stroke style
- No color accents, no shadows, modern 2026 AI chat app

1. TOP BAR (56px):
   - Left: Lucide ArrowLeft 24px #A1A1AA
   - Center: "System Prompt" 16sp Inter semibold #FAFAFA
   - Right: "Save" 14sp Inter medium #FAFAFA

2. PRESET SELECTOR (horizontal scroll, 16px padding):
   - Row of pill chips, 8px gap:
     - "Default" (selected: #FAFAFA bg, #09090B text)
     - "Code Helper" (#18181B bg, #A1A1AA text)
     - "Creative Writer" (#18181B bg, #A1A1AA text)
     - "Translator" (#18181B bg, #A1A1AA text)
     - "+ Custom" (#18181B bg, Lucide Plus 14px + text, #A1A1AA)
   - 20px radius pills, 32px height, 12sp Inter medium

3. TEXT EDITOR (flex, fills remaining space):
   - #18181B bg, 12px radius, 1px #27272A border, 16px margin
   - 16px inner padding
   - Multiline text area with current prompt:
     "You are a helpful, concise assistant. Respond clearly and directly. When writing code, include comments. When uncertain, say so."
   - 14sp Inter regular #FAFAFA
   - Placeholder when empty: "Enter system prompt..." #71717A

4. INFO BAR (below editor, 16px padding):
   - "Applied to this conversation only" 12sp #71717A
   - Lucide Info 14px #71717A inline

5. ACTIONS (16px padding, 8px gap):
   - "Save as Preset" ghost button: #18181B bg, full-width, 44px, 8px radius
     - Lucide Bookmark 16px #A1A1AA + "Save as Preset" 14sp #A1A1AA
   - "Reset to Default" ghost button: same style
     - Lucide RotateCcw 16px #71717A + "Reset to Default" 14sp #71717A

Focused editing experience. The preset chips give quick switching, the editor gives full control.
```
