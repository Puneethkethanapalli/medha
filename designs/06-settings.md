# 06 — Settings Screen

> Sprint 3, 7 · API keys, theme, biometrics, app info

---

## Stitch Prompt

```
Design a mobile settings screen for "Medha" — a premium AI chat client (Android, 393×852 viewport).

Design language:
- Style: shadcn Nova (--preset b0) — ultra-clean, monochromatic, dark-first
- Background: #09090B, surfaces: #18181B, borders: 1px #27272A
- Font: Inter for all text
- Icons: Lucide (stroke style, 20px default)
- No color accents — hierarchy through contrast and font weight only
- No shadows, modern 2026 AI chat app
- Status bar: dark, white icons

Full-screen settings, pushed from conversation drawer.

1. TOP BAR (56px):
   - Left: Lucide ArrowLeft 24px #A1A1AA (back to chat)
   - Center: "Settings" 16sp Inter semibold #FAFAFA

2. SETTINGS LIST (scrollable, grouped into cards):

   CARD 1 — "AI Providers" (#0A0A0C bg, 12px radius, 1px #27272A border, 16px margin):
   - Row: Lucide Key 20px #A1A1AA + "API Keys" 14sp #FAFAFA → Lucide ChevronRight 16px #71717A
   - Divider: 1px #27272A inset
   - Row: Lucide Bot 20px #A1A1AA + "Default Model" 14sp #FAFAFA → "GPT-4o" 13sp #71717A + ChevronRight
   - Divider
   - Row: Lucide MessageSquare 20px #A1A1AA + "System Prompt" 14sp #FAFAFA → ChevronRight

   CARD 2 — "Appearance":
   - Row: Lucide Palette 20px #A1A1AA + "Theme" 14sp #FAFAFA → "Dark" 13sp #71717A + ChevronRight
   - Divider
   - Row: Lucide Moon 20px #A1A1AA + "OLED Black Mode" 14sp #FAFAFA → Toggle switch (off: #27272A track)

   CARD 3 — "Security":
   - Row: Lucide Fingerprint 20px #A1A1AA + "Biometric Lock" 14sp #FAFAFA → Toggle switch (on: #FAFAFA track, #09090B thumb)

   CARD 4 — "Data":
   - Row: Lucide Download 20px #A1A1AA + "Export Conversations" 14sp #FAFAFA → ChevronRight
   - Divider
   - Row: Lucide Trash2 20px #EF4444 + "Delete All Data" 14sp #EF4444 → ChevronRight

   FOOTER (centered, 32px top margin):
   - "Medha v1.0.0" 12sp #71717A
   - "Built with ❤️ in India" 12sp #71717A

Each card has 16px horizontal margin. Rows are 52px height with 16px horizontal padding. Clean, iOS-settings-inspired grouping but with the dark monochromatic Nova aesthetic.
```
