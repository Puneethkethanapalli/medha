# 14 — Delete Confirmation Dialog

> Sprint 4, 7 · Modal for destructive actions (delete conversation, delete message, delete all data)

---

## Stitch Prompt

```
Design a mobile confirmation dialog for "Medha" — a premium AI chat client (Android, 393×852 viewport).

Design language:
- Style: shadcn Nova (--preset b0) — ultra-clean, monochromatic, dark-first
- Background: #09090B, surfaces: #18181B, borders: 1px #27272A
- Font: Inter for all text, Icons: Lucide stroke style
- No color accents (except destructive red), no shadows

Show the conversation drawer open in the background, dimmed with #000000 60% overlay. A centered modal dialog in front:

DIALOG (centered vertically and horizontally):
- Background: #0A0A0C
- Border: 1px #27272A
- Radius: 12px
- Width: 85% screen width (max 320px)
- Padding: 24px

Content:
- Lucide Trash2 icon, 32px, #EF4444, centered
- 12px gap
- "Delete conversation?" 18sp Inter semibold #FAFAFA, centered
- 8px gap
- "This will permanently delete "React Server Components explanation" and all its messages." 13sp Inter regular #A1A1AA, centered, 2-3 lines
- 20px gap
- Button row (8px gap, full-width):
  - "Cancel" button: flex 1, #18181B bg, 8px radius, 44px height, "Cancel" 14sp Inter medium #FAFAFA
  - "Delete" button: flex 1, #EF4444 bg, 8px radius, 44px height, "Delete" 14sp Inter medium #FAFAFA

The dialog should feel serious but not alarming. Clear what's being deleted, easy to cancel.
```
