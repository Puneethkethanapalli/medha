# 11 — Markdown Rendering Showcase

> Sprint 5 · Rich assistant output: headings, lists, code blocks, tables, inline formatting

---

## Stitch Prompt

```
Design a mobile chat screen showing a rich markdown response for "Medha" — a premium AI chat client (Android, 393×852 viewport).

Design language:
- Style: shadcn Nova (--preset b0) — ultra-clean, monochromatic, dark-first
- Background: #09090B, surfaces: #18181B, borders: 1px #27272A
- Font: Inter for all text, monospace for code (JetBrains Mono or Fira Code)
- Icons: Lucide (stroke style, 20px default)
- No color accents, no shadows, modern 2026 AI chat app

Show a chat where the user asked "Explain JavaScript array methods with examples" and the assistant responded with rich markdown. Only show the assistant response (scrolled past the user bubble).

ASSISTANT RESPONSE (left-aligned, no bubble bg, 16px horizontal padding):

1. HEADING:
   - "JavaScript Array Methods" in 18sp Inter semibold #FAFAFA
   - Thin 1px #27272A horizontal rule below, 8px vertical margin

2. PARAGRAPH:
   - "Here are the most commonly used array methods:" in 14sp Inter regular #FAFAFA
   - 12px gap

3. BOLD + ITALIC inline:
   - "The **map** method creates a _new array_ from the results." — bold words in Inter semibold #FAFAFA, italic in Inter italic #FAFAFA

4. BULLET LIST:
   - Bullet: small 4px circle #71717A, 16px left indent
   - Items in 14sp #FAFAFA:
     - "`map()` — transforms each element"
     - "`filter()` — removes elements that don't match"
     - "`reduce()` — accumulates into a single value"
   - Inline code (`map()` etc): #18181B bg, 4px radius, 2px horizontal padding, 13sp monospace #FAFAFA

5. CODE BLOCK:
   - Container: #18181B bg, 8px radius, 1px #27272A border
   - Header bar: #18181B bg, 1px #27272A bottom border, 8px padding
     - Left: "javascript" label 11sp monospace #71717A
     - Right: Lucide Copy icon 16px #71717A (tap to copy)
   - Code content: 13sp monospace, 12px padding
     - Syntax colored: keywords (#C084FC purple), strings (#86EFAC green), comments (#71717A), functions (#93C5FD blue), numbers (#FDE68A yellow)
   - Show 5-6 lines of realistic JavaScript code

6. TABLE:
   - #18181B bg, 8px radius, 1px #27272A border
   - Header row: 12sp Inter semibold #A1A1AA, #18181B bg, 1px #27272A bottom border
   - Data rows: 13sp Inter regular #FAFAFA, alternating #09090B and #0A0A0C bg
   - Columns: "Method", "Returns", "Mutates"
   - 3 data rows with content
   - Cell padding: 8px

7. BLOCKQUOTE:
   - Left border: 2px #27272A
   - Background: #0A0A0C
   - 12px left padding
   - "Note: Always prefer immutable methods in React." 14sp italic #A1A1AA

8. ACTION ROW (below response):
   - Lucide Copy 16px #71717A + Lucide RefreshCw 16px #71717A, 8px gap, 8px top margin

Show the input bar at the bottom (same as other screens). The markdown should feel native, not like rendered HTML. Clean, readable, well-spaced.
```
