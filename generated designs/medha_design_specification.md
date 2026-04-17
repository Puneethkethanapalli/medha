# Medha — Master Design Language

## Navigation Paradigm
Modern AI chat apps (ChatGPT, Claude, Gemini — 2026) share the same pattern:
- **No bottom tab bar**: Chat IS the entire app.
- **No visible sidebar**: Conversation history lives in a left-edge drawer.
- **Model picker**: Inline pill/chip at top of chat.
- **Chat-first**: App opens directly to the last conversation.

## Core Design Tokens
- **Style**: Nova (shadcn b0)
- **Palette**: Neutral — pure grays, no color tint.
- **Theme**: Dark-first.
- **Font**: Inter.
- **Radius**: 12px cards/sheets, 8px buttons/inputs, 20px pills/chips.
- **Elevation**: None — 1px borders only.

## Dark Mode Colors
- **Background**: `#09090B`
- **Surface**: `#0A0A0C`
- **Surface raised**: `#18181B`
- **Border**: `#27272A`
- **Text primary**: `#FAFAFA`
- **Text secondary**: `#A1A1AA`
- **Accent**: `#FAFAFA` (white-on-dark buttons)
- **Destructive**: `#EF4444`
- **Success**: `#22C55E`

## Components
- **Input Bar**: Sticky bottom, `#18181B` bg, 12px radius, 1px border.
- **Message Bubbles**: User (`#18181B` bg), Assistant (no bubble, text on bg).
- **Primary Button**: `#FAFAFA` bg, `#09090B` text.