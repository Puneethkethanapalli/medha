# 12 — Theme Picker

> Sprint 7 · Dark / Light / OLED black theme selection

---

## Stitch Prompt

```
Design a mobile theme picker bottom sheet for "Medha" — a premium AI chat client (Android, 393×852 viewport).

Design language:
- Style: shadcn Nova (--preset b0) — ultra-clean, monochromatic, dark-first
- Background: #09090B, surfaces: #18181B, borders: 1px #27272A
- Font: Inter for all text, Icons: Lucide stroke style
- No color accents, no shadows

Bottom sheet over a dimmed settings screen (#000000 50% overlay).

BOTTOM SHEET (slides up, 40% screen height):
- Background: #09090B, 16px top radius, handle pill #27272A 4px×40px

1. HEADER (16px padding):
   - "Theme" 16sp Inter semibold #FAFAFA
   - Right: Lucide X 20px #A1A1AA

2. THEME OPTIONS (16px padding, 12px gap):
   Three side-by-side theme preview cards (equal width, ~33% each):

   CARD — "Dark" (selected):
   - 64px tall preview rectangle: #09090B bg, 8px radius, 1px #FAFAFA border (selected indicator)
   - Inside preview: tiny mock chat lines — 2 gray bars representing messages
   - Below: "Dark" 12sp Inter medium #FAFAFA
   - Lucide Check 14px #FAFAFA below label

   CARD — "Light":
   - Preview: #FFFFFF bg, 8px radius, 1px #27272A border
   - Inside: tiny dark gray bars
   - Below: "Light" 12sp #A1A1AA
   - No check

   CARD — "OLED":
   - Preview: #000000 bg (pure black), 8px radius, 1px #27272A border
   - Inside: tiny gray bars
   - Below: "OLED" 12sp #A1A1AA
   - No check

3. SYSTEM TOGGLE (16px padding, 8px above):
   - Row: "Match system theme" 14sp #FAFAFA + toggle switch right-aligned (off state)

Compact, visual selection. The preview cards let users see the theme before committing.
```
