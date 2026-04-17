# 05 — Model Picker (Bottom Sheet)

> Sprint 4 · Tap model pill → bottom sheet to select AI model

---

## Stitch Prompt

```
Design a mobile bottom sheet model picker for "Medha" — a premium AI chat client (Android, 393×852 viewport).

Design language:
- Style: shadcn Nova (--preset b0) — ultra-clean, monochromatic, dark-first
- Background: #09090B, surfaces: #18181B, borders: 1px #27272A
- Font: Inter for all text
- Icons: Lucide (stroke style, 20px default)
- No color accents — hierarchy through contrast and font weight only
- No shadows, modern 2026 AI chat app

Behind the sheet, the chat screen is visible but dimmed with #000000 50% overlay.

BOTTOM SHEET (slides up from bottom, 70% screen height):
- Background: #09090B
- Top corners: 16px radius
- Handle: centered pill, #27272A, 4px × 40px, 8px top margin
- Border-top: 1px #27272A

1. HEADER (16px padding):
   - "Select Model" 16sp Inter semibold #FAFAFA
   - Right: Lucide X icon 20px #A1A1AA (close)

2. SEARCH (16px horizontal padding):
   - Input: #18181B bg, 8px radius, 40px height
   - Lucide Search 16px #71717A + "Search models..." 13sp #71717A

3. MODEL LIST (scrollable, grouped by provider):

   Section: "OPENAI" 10sp #71717A uppercase, 16px left padding
   - "GPT-4o" — 52px row, 14sp #FAFAFA, right: "128K" in 11sp #71717A
   - "GPT-4o Mini" — right: "128K", Lucide Check 16px #FAFAFA (currently selected)
   - "o1" — right: "200K"

   Section: "ANTHROPIC"
   - "Claude 3.5 Sonnet" — right: "200K"
   - "Claude 3.5 Haiku" — right: "200K"
   - "Claude 3 Opus" — right: "200K"

   Section: "GOOGLE"
   - "Gemini 2.0 Flash" — right: "1M"
   - "Gemini 1.5 Pro" — right: "2M"

   Section: "META"
   - "Llama 3.1 405B" — right: "128K"
   - "Llama 3.1 70B" — right: "128K"

   Each row: 52px, left-aligned name, right-aligned context window badge.
   Selected row has a Lucide Check icon on the right in #FAFAFA.
   Rows have subtle 1px #27272A bottom borders (inset).

Dense but scannable. Model names are the star — context window is secondary info.
```
