# 07 — API Key Management

> Sprint 3 · View, add, test, delete provider API keys

---

## Stitch Prompt

```
Design a mobile API key management screen for "Medha" — a premium AI chat client (Android, 393×852 viewport).

Design language:
- Style: shadcn Nova (--preset b0) — ultra-clean, monochromatic, dark-first
- Background: #09090B, surfaces: #18181B, borders: 1px #27272A
- Font: Inter for all text, Icons: Lucide stroke style
- No color accents, no shadows, modern 2026 AI chat app

1. TOP BAR (56px):
   - Left: Lucide ArrowLeft 24px #A1A1AA
   - Center: "API Keys" 16sp Inter semibold #FAFAFA

2. PROVIDER CARDS (16px padding, 12px gap between cards):

   CARD — OpenRouter (connected):
   - #0A0A0C bg, 12px radius, 1px #27272A border, 16px padding
   - Header row: "OpenRouter" 16sp Inter semibold #FAFAFA + green dot 8px #22C55E (connected)
   - Key display: "sk-or-...x4f2" 13sp Inter mono #71717A
   - 12px gap
   - Button row (8px gap):
     - "Test" pill: #18181B bg, 20px radius, Lucide Zap 14px + "Test" 12sp #A1A1AA
     - "Delete" pill: #18181B bg, 20px radius, Lucide Trash2 14px + "Delete" 12sp #EF4444

   CARD — Gemini (not connected):
   - Same card style but no key shown
   - "Not connected" 13sp #71717A
   - "Add Key" button: full-width, #18181B bg, 8px radius, 1px #27272A border dashed
     - Lucide Plus 16px #A1A1AA + "Add Gemini API Key" 14sp #A1A1AA
     - 44px height

   CARD — Anthropic (not connected):
   - Same as Gemini card above

3. BOTTOM NOTE (centered, 24px top margin):
   - Lucide Shield 16px #71717A
   - "Keys are encrypted and stored locally on your device" 12sp #71717A

Trustworthy, clear status indication. Connected providers feel confirmed, disconnected ones invite action.
```
