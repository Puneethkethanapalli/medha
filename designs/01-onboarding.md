# 01 — Onboarding Screen

> Sprint 3 · First-time setup: welcome → API key → validate → enter app

---

## Stitch Prompt

```
Design a mobile app onboarding screen for "Medha" — a premium AI chat client (Android, 393×852 viewport).

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

This is the API key setup step (the main step of onboarding). Layout top to bottom:

1. TOP SECTION (centered, 40% of screen):
   - App logo: a simple geometric "M" monogram or Lucide Sparkles icon, 48px, #FAFAFA
   - Below logo: "Medha" in 28sp Inter bold, #FAFAFA
   - Below name: "Your private AI assistant" in 14sp Inter regular, #A1A1AA
   - 32px gap

2. API KEY CARD (centered, horizontal padding 24px):
   - Card: #0A0A0C bg, 12px radius, 1px #27272A border, 20px padding
   - Card title: "Connect your AI provider" in 16sp Inter semibold, #FAFAFA
   - Below: "Your key stays on-device. We never see it." in 12sp, #71717A
   - 16px gap
   - Provider selector: horizontal row of 3 pill chips
     - "OpenRouter" (selected: #FAFAFA bg, #09090B text)
     - "Gemini" (unselected: #18181B bg, #A1A1AA text)
     - "Anthropic" (unselected: #18181B bg, #A1A1AA text)
   - 12px gap
   - API key input field:
     - #18181B bg, 8px radius, 1px #27272A border
     - Placeholder: "sk-or-..." in #71717A
     - 44px height
     - Right side: Lucide ClipboardPaste icon, 18px, #A1A1AA (paste from clipboard)
   - 16px gap
   - "Verify & Continue" button: full-width, #FAFAFA bg, #09090B text, 44px height, 8px radius, Inter medium 14sp

3. BOTTOM (centered, near bottom):
   - "Where do I get a key?" as a text link, 12sp Inter regular, #A1A1AA, underlined
   - 32px bottom padding (safe area)

Make it feel calm, trustworthy, and minimal. The privacy message is important — users are entering API keys. No decorative elements or illustrations. Just clean typography and clear hierarchy.
```

---

## Validation State Variant

```
Follow-up: Show the state after the user taps "Verify & Continue" with a valid key:
- The button changes to a success state: shows a Lucide Check icon + "Connected" text, #22C55E color
- Below the button, a subtle text appears: "Using OpenRouter · 200+ models available" in 12sp #A1A1AA
- After 1 second, this screen transitions to the chat empty state
```

## Error State Variant

```
Follow-up: Show the state when API key validation fails:
- The input field border changes to #EF4444
- Below the input: "Invalid API key. Check your key and try again." in 12sp #EF4444
- Button remains enabled for retry
```
