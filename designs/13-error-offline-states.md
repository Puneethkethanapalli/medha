# 13 — Error & Offline States

> Sprint 8 · API error bubbles, offline banner, retry flow

---

## Stitch Prompt — Error Bubble

```
Design a mobile chat error state for "Medha" — a premium AI chat client (Android, 393×852 viewport).

Design language:
- Style: shadcn Nova (--preset b0) — ultra-clean, monochromatic, dark-first
- Background: #09090B, surfaces: #18181B, borders: 1px #27272A
- Font: Inter for all text, Icons: Lucide stroke style
- No shadows, modern 2026 AI chat app

Show a conversation where the last assistant response failed. Layout:

1. Normal top bar with model pill
2. MESSAGE LIST with 2 prior messages (user + assistant, normal)
3. USER MESSAGE 3: "What's the weather today?" (normal user bubble, right-aligned)
4. ERROR MESSAGE (where assistant response would be):
   - Left-aligned, same position as assistant messages
   - Container: #18181B bg, 8px radius, 1px #EF4444/30 border (subtle red tint)
   - Lucide AlertTriangle 18px #EF4444 top-left
   - "Failed to get a response" 14sp Inter medium #FAFAFA
   - "Rate limited by OpenRouter. Try again in 30 seconds." 12sp #A1A1AA
   - 12px gap
   - "Retry" pill button: #18181B bg, 1px #27272A border, 20px radius
     - Lucide RefreshCw 14px #A1A1AA + "Retry" 12sp #A1A1AA
5. Normal input bar at bottom
```

---

## Stitch Prompt — Offline Banner

```
Same design language as above. Show a chat screen with an offline indicator:

1. OFFLINE BANNER (top of screen, below status bar, above model pill):
   - Full-width bar, #18181B bg, 1px #27272A bottom border, 36px height
   - Center: Lucide WifiOff 14px #A1A1AA + "No internet connection" 12sp #A1A1AA
   - The banner sits between the status bar and the model pill, pushing content down slightly

2. Rest of chat screen is normal but the send button is disabled (#27272A bg, #71717A icon)
3. Input placeholder changes to "Offline — reconnect to send" in #71717A

Keep it non-intrusive. A quiet notification, not a dramatic takeover.
```
