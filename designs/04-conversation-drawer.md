# 04 — Conversation Drawer

> Sprint 4 · Slide-from-left drawer with conversation history, search, pinned chats

---

## Stitch Prompt

```
Design a mobile app conversation drawer for "Medha" — a premium AI chat client (Android, 393×852 viewport).

Design language:
- Style: shadcn Nova (--preset b0) — ultra-clean, monochromatic, dark-first
- Background: #09090B, surfaces: #18181B, borders: 1px #27272A
- Font: Inter for all text
- Icons: Lucide (stroke style, 20px default)
- No color accents — hierarchy through contrast and font weight only
- No shadows, modern 2026 AI chat app pattern
- Status bar: dark, white icons

This drawer slides from the left edge, covering 85% of screen width. Behind it, the chat screen is dimmed with #000000 50% overlay.

DRAWER LAYOUT (left panel, 85% width, full height, #09090B bg):

1. HEADER (64px, 16px horizontal padding):
   - Left: "Medha" in 18sp Inter semibold #FAFAFA
   - Right: New chat button — pill shape, #18181B bg, 1px #27272A border, 20px radius
     - Lucide Plus 16px #A1A1AA + "New" 12sp #A1A1AA

2. SEARCH BAR (below header, 16px horizontal padding, 8px vertical padding):
   - #18181B bg, 8px radius, 1px #27272A border, 40px height
   - Lucide Search icon 16px #71717A left, "Search conversations..." 13sp #71717A

3. PINNED SECTION:
   - Section header: "PINNED" 10sp Inter medium #71717A uppercase, 16px left padding, 8px vertical padding
   - 2 pinned conversations:
     - Row: 48px height, 16px padding, 14sp Inter regular #FAFAFA
     - Lucide Pin icon 14px #71717A right-aligned
     - Example: "Project architecture notes"
     - Example: "API reference cheatsheet"

4. RECENT SECTION (scrollable):
   - Section header: "TODAY" 10sp #71717A uppercase
   - 3 conversations with titles like:
     - "React Server Components explanation" (active — #18181B bg, 2px left #FAFAFA border)
     - "Python async patterns"
     - "Debug memory leak in Node"
   - Section header: "YESTERDAY" 10sp #71717A
   - 2 more conversations:
     - "SQL query optimization"
     - "Design system color tokens"
   - Section header: "LAST 7 DAYS" 10sp #71717A
   - 3 more conversations
   - Each row: 48px, 14sp #FAFAFA, single-line truncated

5. FOOTER (sticky bottom, 1px #27272A top border):
   - Row: Lucide Settings 20px #A1A1AA + "Settings" 14sp #A1A1AA, 52px height, 16px padding

BACKGROUND (right 15%):
   - The chat screen visible but dimmed with black 50% overlay
   - Tapping this area closes the drawer

Clean, scannable, fast to navigate. Conversations are just text — no avatars or previews.
```
