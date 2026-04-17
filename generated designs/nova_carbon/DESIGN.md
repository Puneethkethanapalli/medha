# Design System Document

## 1. Overview & Creative North Star
**The Creative North Star: "The Obsidian Monolith"**

This design system moves beyond the "standard chat interface" to create a high-end, editorial environment for artificial intelligence. By leaning into a strictly monochromatic, dark-first aesthetic, we eliminate the noise typical of modern SaaS. The goal is to make the interface feel like a single, seamless obsidian slab—intentional, authoritative, and void of unnecessary decoration. 

We break the "template" look through **intentional negative space** and **asymmetric information density**. Rather than filling every corner, we use whitespace as a luxury material. The interface should feel less like software and more like a premium physical device or a high-end digital broadsheet.

---

## 2. Colors & Tonal Depth
The palette is a study in grayscale. By removing all hue-based accents, we force the user’s focus onto the content and the AI’s intelligence.

### The "No-Line" Rule
Traditional 1px borders are largely prohibited for sectioning. To achieve a 2026-era premium feel, boundaries must be defined by **Background Color Shifts**. 
- A sidebar uses `surface_container_low` (#1C1B1D).
- The main chat canvas uses `surface` (#131315).
- A focused element uses `surface_container_high` (#2A2A2C).

### Surface Hierarchy & Nesting
Treat the UI as layered sheets of polished stone. 
- **Base Layer:** `surface` (#131315) - The foundation.
- **Secondary Sheets:** `surface_container` (#201F22) - For grouped information like history or settings.
- **Active Focus:** `surface_container_highest` (#353437) - Used for hovered states or active message bubbles.

### The "Glass & Texture" Rule
To prevent the dark theme from feeling "flat" or "muddy," implement **Glassmorphism** for floating UI elements (like the chat input bar or floating headers). Use the `surface_container_low` token with an 80% opacity and a `20px` backdrop-blur. 

---

## 3. Typography
We utilize **Inter** across the entire system, but we manipulate weight and scale to create an editorial hierarchy.

*   **The Power of Contrast:** Use `display-lg` (3.5rem) for empty states or welcome screens to create a bold, "poster-like" impact.
*   **The AI Voice:** AI-generated responses should utilize `body-lg` (1rem) with a slightly increased line-height (1.6) to ensure long-form readability.
*   **Metadata:** Use `label-sm` (0.6875rem) in `on_surface_variant` (#C6C6C6) for timestamps and secondary actions.

**Hierarchy Strategy:**
- **Headlines:** Medium weight, tight letter-spacing (-0.02em).
- **Body:** Regular weight, standard letter-spacing.
- **Monospaced Accents:** (Optional) Use a mono font for code snippets, but ensure it inherits the `primary` (#FFFFFF) color to maintain the monochromatic rigor.

---

## 4. Elevation & Depth
In this system, depth is not a shadow; it is a **Tonal Elevation**.

### The Layering Principle
We avoid traditional drop shadows. Instead, we "lift" elements by shifting their background color up the surface tier. 
- **Level 0 (Flat):** `background`
- **Level 1 (Raised):** `surface_container_low`
- **Level 2 (Pop-over):** `surface_container_high`

### The "Ghost Border" Fallback
Where contrast is legally or functionally required (e.g., separating a code block from chat text), use a **Ghost Border**. 
- **Token:** `outline_variant` (#474747) at **15% opacity**. 
- **Rule:** Never use 100% opaque borders for interior layout divisions.

### Ambient Glow (The 2026 AI Signature)
Instead of a shadow, a "Focused" AI response can have a subtle, 1px inner-glow using `primary` at 5% opacity. This makes the container feel energized rather than just "placed."

---

## 5. Components

### Chat Input (The Centerpiece)
- **Shape:** 8px radius (`md`).
- **Surface:** `surface_container_lowest` (#0E0E10).
- **Interaction:** On focus, the background transitions to `surface_container` (#201F22). No border change.

### Primary Action Buttons
- **Shape:** 8px radius (`md`).
- **Color:** `primary` (#FFFFFF) background with `on_primary` (#1A1C1C) text.
- **Style:** High-contrast, no shadow. The stark white-on-black serves as the only "call to action."

### Message Bubbles (Pills)
- **User Messages:** 20px radius (`xl`), `surface_container_high` background.
- **AI Messages:** No bubble. Use typography and generous vertical spacing (`48px` between exchanges) to define the conversation flow. Forbid dividers.

### Subtle Indicators (Checkboxes/Radios)
- **State:** When checked, use `primary` (#FFFFFF).
- **Unchecked:** `outline` (#919191) at 30% opacity. 

### Modern AI Context Chips
- **Shape:** 9999px (`full`).
- **Style:** `surface_container_low` with `label-md` text. Use these for suggested prompts or model switching.

---

## 6. Do's and Don'ts

### Do:
- **Do** use massive amounts of whitespace. If you think there’s enough space, double it.
- **Do** use `primary_fixed` (#5D5F5F) for "de-emphasized" text that still needs to be legible.
- **Do** ensure all transitions (hover, focus, state changes) are slow and cinematic (e.g., `300ms ease-out`).

### Don't:
- **Don't** use a single hex code of blue, green, or red unless it is a critical `error` state.
- **Don't** use 1px solid #27272A for every box. Use tonal shifts first.
- **Don't** use "Card" containers for everything. Let the typography and the background shifts do the heavy lifting of organization.
- **Don't** use standard "drop shadows." They break the obsidian monolith aesthetic.