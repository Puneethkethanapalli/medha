# Design System Document: The Monochromatic Monolith

## 1. Overview & Creative North Star
### The Creative North Star: "Quiet Intelligence"
This design system is not a utility; it is a digital sanctuary for thought. To move beyond the generic "SaaS chat" aesthetic, we embrace **Quiet Intelligence**. This means the UI should feel like an obsidian mirror—deep, dark, and reactive. We achieve a premium editorial feel through extreme intentionality: where most apps use shadows and vibrant colors to scream for attention, we use surgical precision, rigid monochromatic scales, and vast "negative space" to command respect.

The layout should break the standard 12-column grid. Think like a high-end magazine: use intentional asymmetry, let text breathe with oversized margins, and treat every AI response as a piece of curated typography rather than a simple message bubble.

---

## 2. Colors: Tonal Architecture
The palette is strictly monochromatic. Depth is not a product of light, but of **material density**. 

### The Core Palette
- **Primary Surface (Background):** `#09090B` (Used for the foundation).
- **Secondary Surface:** `#18181B` (Used for primary UI panels/sheets).
- **Hard Borders:** `#27272A` (1px precision lines).
- **Typography:** Primary `#FAFAFA`, Secondary `#A1A1AA`, Tertiary `#71717A`.

### The "No-Line" Rule & Tonal Nesting
While the system utilizes 1px borders for structural integrity, you must prioritize **Tonal Nesting** for sectioning. 
- **Nesting Principle:** Place a `surface_container_highest` (#353437) element inside a `surface_container_low` (#1C1B1D) section to create a perceived "lift" without a shadow.
- **The Glass Exception:** For floating menus or popovers, use a semi-transparent `surface_container_high` with a `20px` backdrop-blur. This "frosted obsidian" look ensures the AI’s intelligence feels integrated into the space, not just sitting on top of it.

---

## 3. Typography: Editorial Authority
We use **Inter** exclusively. To avoid a "default" look, we rely on high-contrast scaling between headers and body text.

| Level | Size | Token | Usage |
| :--- | :--- | :--- | :--- |
| **Display** | 3.5rem | `display-lg` | Large, atmospheric numbers or hero statements. |
| **Headline** | 1.5rem | `headline-sm` | AI response headers or section titles. |
| **Body (Large)** | 1.0rem | `body-lg` | The primary AI chat output. High readability. |
| **Label** | 0.75rem | `label-md` | Metadata, timestamps, and utility labels. |

**Editorial Note:** Increase the line-height of `body-lg` to 1.6 for AI responses. This gives the machine's output a "lettered" quality, making long-form information feel less daunting and more premium.

---

## 4. Elevation & Depth: Structural Precision
The user's request explicitly forbids shadows. Therefore, we define hierarchy through **The Layering Principle**.

- **Level 0 (The Void):** `background` (#09090B). Reserved for the deep background.
- **Level 1 (The Canvas):** `surface_container_low` (#1C1B1D). Used for the main chat feed area.
- **Level 2 (The Interactive):** `surface_container_high` (#2A2A2C). Used for input fields and active cards.
- **The "Ghost Border":** All borders must use `outline_variant` (#474747) but at **20% opacity** for internal dividers. Reserve the 100% opaque `#27272A` border only for the outer perimeter of major sheets.

---

## 5. Components: Precision Tools

### Buttons
- **Primary:** Background `primary` (#FFFFFF), Text `on_primary` (#1A1C1C). 8px radius. Use for "Send" or "Confirm."
- **Secondary:** Transparent background, 1px Border (#27272A), Text `primary`. Use for secondary actions.
- **Tertiary (Ghost):** No background, no border. Text `Text Secondary`. 

### Chat Blocks (The "Anti-Bubble")
Do not use rounded chat bubbles. Instead, use **Editorial Blocks**:
- **User Input:** Right-aligned, no background, 1px left-border of `Text Tertiary`.
- **AI Response:** Left-aligned, `surface_container_lowest` (#0E0E10) background, 12px top-left/top-right radius. No border on the bottom.

### Inputs
- **Chat Input:** A "pill" shape (20px radius). Background `surface_container_highest` (#353437). Minimize the footprint; the input should feel like a precision instrument at the bottom of the screen.

### Lists & Dividers
- **Forbidden:** Standard horizontal `<hr>` lines.
- **Preferred:** Use **80px of vertical whitespace** to separate time blocks, or a subtle background shift between `surface` and `surface_container_low`.

---

## 6. Do’s and Don’ts

### Do
- **Do** use Lucide icons at 20px with a 1.5px stroke weight for a spindly, high-end feel.
- **Do** use `Text Tertiary` for "ghost" information like character counts or secondary timestamps.
- **Do** allow for intentional asymmetry. An AI response doesn't need to fill the width of the screen; let it find its own "natural" width.

### Don't
- **Don't** use any color. Even "Success" or "Error" states should be monochromatic—use icons (Checkmark/Warning) and bold typography instead of green or red.
- **Don't** use shadows. If an element doesn't feel separated enough, increase the contrast of the 1px border or shift the background tone.
- **Don't** crowd the interface. If you think it needs more features, it probably needs more whitespace.