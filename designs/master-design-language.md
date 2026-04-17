# Medha — Master Design Language

> Reference: shadcn/ui `--preset b0` (Nova style), adapted for modern AI chat UX (2026)
> Target: Android mobile app (React Native / Expo)
> Icons: `lucide-react-native` (stroke-style, 20–24px)
> Tool: Google Stitch — paste prompts per-screen

---

## Navigation Paradigm

Modern AI chat apps (ChatGPT, Claude, Gemini — 2026) share the same pattern:

| Pattern | Implementation |
|---------|---------------|
| **No bottom tab bar** | Chat IS the entire app |
| **No visible sidebar** | Conversation history lives in a left-edge drawer (swipe or hamburger) |
| **Settings** | Accessed from drawer footer or profile avatar in drawer header |
| **Model picker** | Inline pill/chip at top of chat, opens bottom sheet on tap |
| **Chat-first** | App opens directly to the last conversation (or empty new chat) |
| **Full-screen immersive** | Chat fills the viewport, input bar at very bottom |

### Screen Map

```
App opens
  ├── First launch → Onboarding (API key setup)
  └── Returning user → Chat Screen
        ├── Empty state (new chat) → suggestion chips
        ├── Active conversation → message list + streaming
        ├── ← Swipe right / tap ☰ → Conversation Drawer
        │     ├── Search bar
        │     ├── Conversation list (pinned + recent)
        │     └── Footer: Settings link
        ├── Tap model pill → Model Picker (bottom sheet)
        └── Tap ⋮ → Chat Actions (system prompt, clear, etc.)
```

---

## Core Design Tokens

| Token | Value |
|-------|-------|
| **Style** | Nova (shadcn b0) |
| **Palette** | Neutral — pure grays, no color tint |
| **Theme** | Dark-first, light mode supported |
| **Font** | Inter — all text (headings: semibold/bold, body: regular/medium) |
| **Icons** | `lucide-react-native`, 20px default, 24px for primary actions, stroke style |
| **Radius** | 12px cards/sheets, 8px buttons/inputs, 20px pills/chips |
| **Controls** | Solid fill, no outline-only buttons |
| **Elevation** | None — 1px borders for depth, no shadows |

---

## Color System — Dark Mode (Primary)

| Role | Hex | Usage |
|------|-----|-------|
| **Background** | `#09090B` | Root app background |
| **Surface** | `#0A0A0C` | Cards, sheets, drawers |
| **Surface raised** | `#18181B` | Input fields, code blocks, user bubbles |
| **Border** | `#27272A` | Card borders, dividers, separators |
| **Border focus** | `#D4D4D8` | Focus rings, active input borders |
| **Text primary** | `#FAFAFA` | Headings, body text |
| **Text secondary** | `#A1A1AA` | Timestamps, placeholders, labels |
| **Text tertiary** | `#71717A` | Section headers, disabled text |
| **Accent** | `#FAFAFA` | Primary buttons (white-on-dark) |
| **Accent foreground** | `#09090B` | Text on accent buttons |
| **Destructive** | `#EF4444` | Delete actions, errors |
| **Success** | `#22C55E` | Validation pass, connected status |

---

## Color System — Light Mode

| Role | Hex |
|------|-----|
| **Background** | `#FFFFFF` |
| **Surface** | `#FFFFFF` |
| **Surface raised** | `#F4F4F5` |
| **Border** | `#E4E4E7` |
| **Text primary** | `#09090B` |
| **Text secondary** | `#71717A` |
| **Text tertiary** | `#A1A1AA` |
| **Accent** | `#18181B` |
| **Accent foreground** | `#FAFAFA` |

---

## Typography Scale

| Level | Size | Weight | Use |
|-------|------|--------|-----|
| Hero | 28sp | Bold 700 | Onboarding title |
| H1 | 22sp | Semibold 600 | Screen titles (rare — mostly in drawer) |
| H2 | 18sp | Semibold 600 | Section headers |
| H3 | 16sp | Medium 500 | Card titles, conversation titles |
| Body | 14sp | Regular 400 | Messages, descriptions |
| Small | 12sp | Regular 400 | Timestamps, captions, chip labels |
| Tiny | 10sp | Medium 500 | Badges, dot labels |
| Mono | 13sp | Regular 400 | Code blocks (JetBrains Mono or Fira Code) |

---

## Component Patterns

### Message Bubbles — Assistant
- No bubble background — text sits directly on `#09090B` background
- 14sp Inter regular, `#FAFAFA`
- Left-aligned, 16px horizontal padding
- Small `lucide-react-native` Sparkles icon (16px, `#71717A`) top-left as role indicator
- Markdown rendered inline (code blocks get `#18181B` bg, 8px radius)
- Action row below message: Copy, Regenerate icons in `#71717A`, 16px, appear on tap/hold

### Message Bubbles — User
- Background: `#18181B` (surface raised)
- Radius: 16px (top-left, top-right, bottom-left), 4px (bottom-right) — chat bubble shape
- 14sp Inter regular, `#FAFAFA`
- Right-aligned, max-width 85%
- No avatar — the alignment IS the indicator

### Input Bar
- Sticky bottom, full-width
- Background: `#09090B`
- Inner container: `#18181B` bg, 12px radius, 1px `#27272A` border
- Multi-line text input, auto-grows to max 6 lines
- Placeholder: "Message Medha..." in `#71717A`
- Right: Send button — `lucide-react-native` ArrowUp in a 32px circle
  - Active (has text): `#FAFAFA` bg, `#09090B` icon
  - Disabled (empty): `#27272A` bg, `#71717A` icon
- During streaming: send becomes Stop button — `lucide-react-native` Square, 14px, filled, same circle
- 8px bottom padding (safe area aware)

### Model Selector Pill
- Centered at top of chat screen, below status bar
- Pill shape: `#18181B` bg, 20px radius, 1px `#27272A` border
- Content: model name in 12sp `#A1A1AA` + ChevronDown icon 14px
- Tap → opens model picker bottom sheet
- e.g. "GPT-4o ▾" or "Claude 3.5 ▾"

### Bottom Sheets
- Background: `#09090B`
- Handle: centered pill, `#27272A`, 4px × 40px, 8px top margin
- Corner radius: 16px top-left/right
- Border-top: 1px `#27272A`
- List items: 52px height, `lucide-react-native` icon left (20px, `#A1A1AA`), label 14sp `#FAFAFA`
- Selected item: `#FAFAFA` checkmark right-aligned
- Section headers: 12sp `#71717A` uppercase, 16px left padding

### Drawer (Conversation List)
- Slides from left edge, 85% screen width
- Background: `#09090B`
- Header: "Medha" in 18sp semibold + New Chat button (pill: `#18181B` bg, `lucide-react-native` Plus + "New" label)
- Search bar below header: `#18181B` bg, `lucide-react-native` Search icon, 8px radius
- List items: 52px height, conversation title 14sp `#FAFAFA`, truncated single line
  - Active conversation: `#18181B` bg highlight, left 2px `#FAFAFA` border
  - Timestamp right-aligned: 12sp `#71717A`
- Pinned section: "PINNED" header 10sp `#71717A` uppercase
- Footer: Settings row with `lucide-react-native` Settings icon, 14sp `#A1A1AA`
- Overlay: `#000000` 50% opacity on main content

### Cards (Settings)
- Background: `#0A0A0C`
- Border: 1px `#27272A`
- Radius: 12px
- Padding: 16px
- No shadows

### Buttons
- **Primary**: `#FAFAFA` bg, `#09090B` text, 8px radius, 44px height
- **Ghost**: transparent bg, `#FAFAFA` text, press → `#18181B` bg
- **Destructive**: `#EF4444` bg, `#FAFAFA` text
- **Chip/Pill**: `#18181B` bg, `#A1A1AA` text, 20px radius, 32px height

### Switches / Toggles
- Track: `#27272A` off, `#FAFAFA` on
- Thumb: `#09090B` on white track, `#71717A` on dark track

---

## Spacing System

| Token | px | Usage |
|-------|-----|-------|
| xs | 4 | Icon gaps, tight padding |
| sm | 8 | Inner padding, list gaps |
| md | 12 | Input padding, card inner margins |
| lg | 16 | Screen horizontal padding, section gaps |
| xl | 24 | Between major sections |
| 2xl | 32 | Onboarding vertical spacing |
| 3xl | 48 | Hero section spacing |

---

## Interaction Principles

1. **Chat-first** — no chrome between user and conversation
2. **Monochromatic hierarchy** — weight and size, never color, for emphasis
3. **Borders, not shadows** — 1px borders only
4. **Solid fills** — buttons are filled, not outlined
5. **Generous touch targets** — minimum 44px height for tappable elements
6. **Subtle transitions** — 150ms fade/slide, no bounce or spring
7. **Content over decoration** — no illustrations, gradients, or ornamental elements
8. **Progressive disclosure** — show only what's needed, rest in sheets/drawers

---

## Stitch Preamble (include in every prompt)

```
Design a mobile app screen for "Medha" — a premium AI chat client (Android, 393×852 viewport).

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
```

---

## Screen Prompt Index

| # | Screen / Component | File |
|---|-------------------|------|
| 01 | Onboarding (welcome + API key) | `01-onboarding.md` |
| 02 | Chat — Empty State (new chat) | `02-chat-empty.md` |
| 03 | Chat — Active Conversation | `03-chat-active.md` |
| 04 | Conversation Drawer | `04-conversation-drawer.md` |
| 05 | Model Picker (bottom sheet) | `05-model-picker.md` |
| 06 | Settings Screen | `06-settings.md` |
| 07 | API Key Management | `07-api-key-management.md` |
| 08 | System Prompt Editor | `08-system-prompts.md` |
| 09 | Search | `09-search.md` |
| 10 | Message Actions & Edit Mode | `10-message-actions.md` |
| 11 | Markdown Rendering Showcase | `11-markdown-rendering.md` |
| 12 | Theme Picker (bottom sheet) | `12-theme-picker.md` |
| 13 | Error & Offline States | `13-error-offline-states.md` |
| 14 | Delete Confirmation Dialog | `14-delete-confirmation.md` |
| 15 | Toast / Snackbar Notifications | `15-toast-notifications.md` |
