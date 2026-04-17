# 02 — Chat Screen: Empty State

> Sprint 4 · New conversation — suggestion chips + input bar

---

## Stitch Prompt

```
Design a mobile app chat empty state for "Medha" — a premium AI chat client (Android, 393×852 viewport).

Design language:
- Style: shadcn Nova (--preset b0) — ultra-clean, monochromatic, dark-first
- Background: #09090B, surfaces: #18181B, borders: 1px #27272A
- Font: Inter for all text
- Icons: Lucide (stroke style, 20px default)
- Radius: 12px sheets/cards, 8px buttons/inputs, 20px pills
- No color accents — hierarchy through contrast and font weight only
- No shadows — depth via 1px borders
- No bottom tab bar — chat-first full-screen layout
- Modern 2026 AI chat app pattern (like ChatGPT/Claude/Gemini)
- Primary buttons: solid #FAFAFA bg with #09090B text
- Status bar: dark background, white text/icons

This is the main screen — a new empty chat. Full-screen, no tab bar, no sidebar visible.

Layout top to bottom:

1. TOP BAR (56px, floating, no background):
   - Left: Lucide Menu icon, 24px, #A1A1AA
   - Center: model selector pill — #18181B bg, 20px radius, 1px #27272A border, "GPT-4o" 12sp #A1A1AA + ChevronDown 14px
   - Right: Lucide PenSquare icon, 20px, #A1A1AA (new chat)

2. CENTER CONTENT (vertically centered):
   - Lucide Sparkles icon, 40px, #27272A
   - "What can I help with?" in 22sp Inter semibold, #FAFAFA
   - 32px gap
   - 2×2 grid of suggestion chips (8px gap):
     - Each: #18181B bg, 12px radius, 1px #27272A border, 12px pad
     - Chip 1: Lucide Code + "Help me debug a React component" 13sp #A1A1AA
     - Chip 2: Lucide FileText + "Summarize a long document" 13sp #A1A1AA
     - Chip 3: Lucide Lightbulb + "Brainstorm startup ideas" 13sp #A1A1AA
     - Chip 4: Lucide Languages + "Translate text to Spanish" 13sp #A1A1AA

3. INPUT BAR (sticky bottom):
   - Container: #18181B bg, 12px radius, 1px #27272A border
   - Placeholder: "Message Medha..." 14sp #71717A
   - Right: 32px circle send button, #27272A bg, ArrowUp 18px #71717A (disabled)

Spacious, calm, inviting. Like a fresh notebook.
```
