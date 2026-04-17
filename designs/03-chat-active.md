# 03 — Chat Screen: Active Conversation

> Sprint 4 · Messages flowing, streaming indicator, input bar active

---

## Stitch Prompt

```
Design a mobile chat conversation screen for "Medha" — a premium AI chat client (Android, 393×852 viewport).

Design language:
- Style: shadcn Nova (--preset b0) — ultra-clean, monochromatic, dark-first
- Background: #09090B, surfaces: #18181B, borders: 1px #27272A
- Font: Inter for all text
- Icons: Lucide (stroke style, 20px default)
- No color accents — hierarchy through contrast and font weight only
- No shadows, no bottom tab bar — chat-first full-screen
- Modern 2026 AI chat app (like ChatGPT/Claude/Gemini)
- Status bar: dark, white icons

Active conversation with 5 messages. Layout:

1. TOP BAR (56px, floating):
   - Left: Lucide Menu, 24px, #A1A1AA
   - Center: model pill "Claude 3.5 Sonnet" 12sp #A1A1AA, #18181B bg, 20px radius
   - Right: Lucide MoreVertical, 20px, #A1A1AA

2. MESSAGE LIST (scrollable, full height):

   USER MESSAGE 1 (right-aligned, max-width 85%):
   - "Can you explain how React Server Components work?" 
   - #18181B bg, radius: 16px top-left, 16px top-right, 16px bottom-left, 4px bottom-right
   - 14sp Inter regular #FAFAFA, 12px padding

   ASSISTANT MESSAGE 1 (left-aligned, no bubble bg):
   - Small Lucide Sparkles icon 16px #71717A at top-left as role indicator
   - Full-width text on #09090B background
   - Contains a multi-paragraph response with a **bold heading**, bullet points, and an inline `code` span
   - Below message: action row — Lucide Copy (16px #71717A) and Lucide RefreshCw (16px #71717A), 8px gap

   USER MESSAGE 2 (right-aligned):
   - "Show me a code example"
   - Same bubble style as above

   ASSISTANT MESSAGE 2 (left-aligned, no bg):
   - Contains a code block: #18181B bg, 8px radius, monospace font
   - Code block header: "typescript" label 11sp #71717A left, Lucide Copy icon right
   - Actual code inside: 13sp monospace #FAFAFA with syntax coloring

   ASSISTANT STREAMING (currently typing):
   - Partial text visible "Here's how you would implement..."
   - Blinking cursor: "|" character at end, opacity animation
   - No action row yet (still streaming)

3. INPUT BAR (sticky bottom):
   - Container: #18181B bg, 12px radius, 1px #27272A border
   - Text input area (empty, placeholder hidden since streaming)
   - Right: STOP button — 32px circle, #FAFAFA bg, Lucide Square 14px #09090B (filled, indicating active stream)

Show realistic AI chat content. Messages should feel natural. The streaming message should look like it's actively generating.
```
