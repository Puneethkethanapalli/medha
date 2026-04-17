# 09 — Search

> Sprint 6 · Full-text search across all conversations and messages

---

## Stitch Prompt

```
Design a mobile search screen for "Medha" — a premium AI chat client (Android, 393×852 viewport).

Design language:
- Style: shadcn Nova (--preset b0) — ultra-clean, monochromatic, dark-first
- Background: #09090B, surfaces: #18181B, borders: 1px #27272A
- Font: Inter for all text, Icons: Lucide stroke style
- No color accents, no shadows, modern 2026 AI chat app

Full-screen search overlay (replaces current view).

1. SEARCH BAR (top, 56px, 16px padding):
   - Left: Lucide ArrowLeft 24px #A1A1AA (close search)
   - Input: full-width, no border, no background, "Search messages..." 16sp #71717A
   - Active state: user has typed "python" — "python" in 16sp #FAFAFA
   - Right: Lucide X 16px #71717A (clear text)
   - Bottom border: 1px #27272A

2. SEARCH RESULTS (scrollable):
   - Results header: "3 conversations" 12sp #71717A, 16px padding

   RESULT ROW 1 (16px padding, 8px vertical):
   - Conversation title: "Python async patterns" 14sp Inter medium #FAFAFA
   - Matched message preview: "...use **python** asyncio to handle concurrent..." 13sp #A1A1AA
     - The matched word "python" is highlighted in #FAFAFA (bold)
   - Timestamp: "Yesterday" 12sp #71717A right-aligned
   - Bottom border: 1px #27272A inset

   RESULT ROW 2:
   - "Debug memory leak in Node" 14sp #FAFAFA
   - "...similar to **python**'s garbage collection..." 13sp #A1A1AA
   - "Apr 12"

   RESULT ROW 3:
   - "Help me write a script" 14sp #FAFAFA
   - "...here's a **python** script that..." 13sp #A1A1AA
   - "Apr 10"

Instant, responsive feel. Results appear as user types (debounced). Matched text is highlighted by making the keyword bold white against the gray preview text.
```
