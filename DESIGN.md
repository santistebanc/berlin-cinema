---
name: OV Berlin
description: A fast, reliable tool for finding original-version film showtimes across Berlin cinemas.
colors:
  ov-signal: "#ea580c"
  ov-signal-strong: "#c2410c"
  ov-signal-soft: "#ffedd5"
  ov-signal-text: "#9a3412"
  slate-bg: "#f8fafc"
  slate-surface: "#ffffff"
  slate-surface-muted: "#f1f5f9"
  slate-text: "#0f172a"
  slate-text-muted: "#475569"
  slate-text-soft: "#64748b"
  slate-border: "#e2e8f0"
  slate-border-strong: "#cbd5e1"
  info-soft: "#dbeafe"
  info-border: "#93c5fd"
  info-text: "#1e40af"
  danger-soft: "#fef2f2"
  danger-border: "#fecaca"
  danger-text: "#991b1b"
typography:
  display:
    fontFamily: "'DM Serif Display', Georgia, serif"
    fontSize: "1.875rem"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "'DM Sans', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "'DM Sans', system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "'DM Sans', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0.08em"
rounded:
  sm: "2px"
  md: "4px"
  lg: "5px"
  xl: "6px"
  2xl: "8px"
  3xl: "10px"
  card: "0.75rem"
spacing:
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.ov-signal}"
    textColor: "#ffffff"
    rounded: "{rounded.card}"
    padding: "0.5rem 1rem"
  button-primary-hover:
    backgroundColor: "{colors.ov-signal-strong}"
    textColor: "#ffffff"
    rounded: "{rounded.card}"
    padding: "0.5rem 1rem"
  button-outline:
    backgroundColor: "{colors.slate-surface}"
    textColor: "{colors.slate-text-muted}"
    rounded: "{rounded.card}"
    padding: "0.5rem 1rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.slate-text-muted}"
    rounded: "{rounded.card}"
    padding: "0.5rem 1rem"
  card-default:
    backgroundColor: "{colors.slate-surface}"
    textColor: "{colors.slate-text}"
    rounded: "{rounded.card}"
    padding: "1rem"
  input-default:
    backgroundColor: "{colors.slate-surface}"
    textColor: "{colors.slate-text}"
    rounded: "{rounded.card}"
    padding: "0.5rem 0.75rem"
  badge-accent:
    backgroundColor: "{colors.ov-signal-soft}"
    textColor: "{colors.ov-signal-text}"
    rounded: "{rounded.md}"
    padding: "0.125rem 0.5rem"
---

# Design System: OV Berlin

## 1. Overview: The Essential Programme

**Creative North Star: "The Essential Programme"**

A cinema programme stripped to only what you need. No decorative flourishes, no marketing noise — just film titles, showtimes, and cinema names arranged with the clarity of a well-designed transit board. The warmth comes from careful typography (DM Serif Display lending film titles their proper weight) and a single functional accent color that marks what matters. Every pixel serves information density or readability. Nothing else.

This system rejects the commercial cinema chain aesthetic — no hero banners, no upsell clutter, no social proof. It also rejects the tastemaker community vibe of film-social platforms. This is a tool you open, use, and close. Success is measured in seconds-to-showtime.

**Key Characteristics:**
- Flat surfaces by default; tonal layering conveys depth
- Single warm accent used sparingly as a signal, not decoration
- Serif display for film titles only; everything else is clean sans-serif
- Generous whitespace around information, tight packing within information groups
- Light and dark modes treated as equals — neither is primary

## 2. Colors: The Signal & Slate Palette

A warm orange accent against a cool slate neutral system. The accent's job is to mark: active states, variants, selected items, and calls-to-action. Its rarity on any given screen is the point. The slate neutrals provide maximum readability across both light and dark modes.

### Primary
- **OV Signal Orange** (#ea580c): The functional accent. Used for primary buttons, active filter states, selected suggestion borders, and variant badges. It marks what matters without shouting.
- **OV Signal Strong** (#c2410c): Hover and pressed states for signal elements. Darker, more saturated — a step of emphasis, not a different color.

### Neutral
- **Slate Background** (#f8fafc): The page ground in light mode. Cool-tinted, almost white, providing gentle separation from pure white surfaces.
- **Slate Surface** (#ffffff): Cards, inputs, dropdowns, and elevated surfaces in light mode. Pure white for maximum contrast against the slightly tinted background.
- **Slate Surface Muted** (#f1f5f9): Secondary surfaces, hover backgrounds, and subtle grouping areas. One step darker than the page ground.
- **Slate Text** (#0f172a): Primary text. Near-black with a cool slate tint. Never pure #000.
- **Slate Text Muted** (#475569): Secondary text — showtime counts, director names, helper copy.
- **Slate Text Soft** (#64748b): Tertiary text — placeholders, disabled states, metadata. The lightest readable gray.
- **Slate Border** (#e2e8f0): Default borders for cards, inputs, dividers. Thin, unobtrusive.
- **Slate Border Strong** (#cbd5e1): Focus rings, input strokes, and emphasized boundaries. One step darker for visibility.

### Named Rules
**The Signal Rarity Rule.** The OV Signal Orange occupies ≤10% of any given screen. Its power comes from restraint. If more than 10% of a view is orange, the hierarchy has failed.

**The Tinted Neutral Rule.** No pure #000 or #ffffff in the system (surface white excepted for functional contrast). Every neutral carries a cool slate tint so the palette feels intentional, not default.

## 3. Typography

**Display Font:** DM Serif Display (with Georgia, serif fallback)
**Body Font:** DM Sans (with system-ui, sans-serif fallback)

**Character:** The serif gives film titles their proper weight and cultural resonance — a printed programme, not a digital feed. The sans handles everything else with quiet efficiency. The pairing is warm but never decorative; the serif earns its place by distinguishing film titles from UI chrome.

### Hierarchy
- **Display** (400 weight, 1.875rem / 30px, line-height 1.15): Page titles and film titles in detail views. Used sparingly — only where a film title needs to feel like a headline.
- **Headline** (600 weight, 1rem / 16px, line-height 1.3): Section titles, card headings, filter group labels. The workhorse of the hierarchy.
- **Body** (400 weight, 0.9375rem / 15px, line-height 1.6): Descriptions, cinema addresses, long-form content. Capped at 65–75ch for readability.
- **Label** (600 weight, 0.75rem / 12px, line-height 1.5, letter-spacing 0.08em, uppercase): Eyebrows, tags, metadata labels, badge text. Small but never faint — the weight and spacing keep it scannable.

### Named Rules
**The One Serif Rule.** DM Serif Display appears only on film titles and page headings. Every other text element — buttons, labels, badges, body copy — uses DM Sans. The serif is a privilege, not a default.

## 4. Elevation: Flat by Default

This system is flat. Depth is conveyed through tonal layering (background → surface → surface-muted) rather than shadows. Surfaces sit at rest with no shadow; elevation appears only as a response to state.

Shadows are reserved for two purposes: (1) dropdown menus and floating panels that must separate from the page ground, and (2) hover lifts on interactive cards where a subtle shadow signals affordance. Even then, the shadows are diffuse and low-contrast — a whisper, not a statement.

### Shadow Vocabulary
- **Ambient Low** (`box-shadow: 0 1px 2px 0 rgb(15 23 42 / 0.06)`): The default shadow for header bars and resting elevated surfaces. Barely perceptible in light mode; stronger in dark mode (`rgb(0 0 0 / 0.24)`) to compensate for reduced contrast.
- **Ambient High** (`box-shadow: 0 12px 28px -14px rgb(15 23 42 / 0.28)`): Dropdowns, search suggestion panels, and modal-like overlays. Creates separation without floating. Dark mode equivalent uses `rgb(0 0 0 / 0.5)`.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows appear only as a response to state (hover, elevation, focus) or when a panel must visually detach from its parent surface.

## 5. Components

### Buttons
- **Shape:** Fully rounded ends (0.75rem / 12px radius) with generous horizontal padding. Inline-flex with centered content and 0.5rem internal gap.
- **Primary:** OV Signal Orange background (#ea580c), white text, no border. The system's loudest element — used sparingly for the single most important action on a screen.
- **Hover / Focus:** Background shifts to OV Signal Strong (#c2410c). No transform or scale — color change only, 150ms ease transition.
- **Outline:** White/light surface background, Slate Border Strong stroke, Slate Text Muted text. For secondary actions that need boundary definition.
- **Subtle:** Slate Surface Muted background, Slate Text Muted text. For tertiary actions that should recede.
- **Ghost:** Transparent background, Slate Text Muted text. For icon-only controls and inline actions.
- **Link:** OV Signal Orange text, no padding, no radius, no background. Underline on hover.

### Chips / Badges
- **Shape:** Small rounded corners (0.5rem / 8px radius), tight padding (0.125rem vertical, 0.5rem horizontal).
- **Accent:** OV Signal Soft background (#ffedd5), OV Signal Text color (#9a3412), border at 40% accent opacity. Used for film variants (OV, OmU, etc.) — the only place where the accent appears in a non-interactive element.
- **Info:** Blue-tinted soft background, blue border, blue text. For system messages and informational tags.
- **Muted:** Slate Surface Muted background, Slate Border border, Slate Text Muted text. For neutral tags and disabled filters.

### Cards / Containers
- **Corner Style:** 0.75rem / 12px radius — gently curved, not pill-shaped.
- **Background:** Slate Surface in light mode; dark surface in dark mode.
- **Shadow Strategy:** Flat at rest. On hover, border shifts to 35% accent opacity and Ambient High shadow appears. The hover treatment is border-first, shadow-second.
- **Border:** 1px solid Slate Border by default; 2px solid on movie cards for stronger definition.
- **Internal Padding:** 1rem (16px) default; 0.75rem–1rem for compact variants.

### Inputs / Fields
- **Style:** 0.75rem / 12px radius, 1px Slate Border Strong stroke, Slate Surface background, Slate Text color.
- **Focus:** Border shifts to OV Signal Orange, with a 3px glow at 18% accent opacity (`0 0 0 3px rgb(234 88 12 / 0.18)`). No outline — the glow provides both visibility and brand presence.
- **Placeholder:** Slate Text Soft. Never italic.

### Navigation
- **Style:** Full-width header bar with bottom border (Slate Border). Slate Surface background, Ambient Low shadow.
- **Typography:** DM Sans, 0.875rem / 14px, semibold weight, tight letter-spacing (-0.01em).
- **Logo:** Film icon in OV Signal Orange, "OV Berlin" wordmark in Slate Text.
- **Default / Hover / Active:** Logo link uses transition-colors; no background shift. Search bar and theme toggle use ghost buttons.

### Cinema Badges
- **Style:** A deliberate multi-color palette where each cinema gets a stable hue so users can identify it at a glance across the schedule. 16 predefined color pairs (light/dark mode) ranging from red through purple. This is a functional color-coding system, not decoration — it reduces cognitive load when scanning schedules.

## 6. Do's and Don'ts

### Do:
- **Do** use DM Serif Display exclusively for film titles and page headings. Let the serif carry the cultural weight.
- **Do** keep the OV Signal Orange to ≤10% of any screen. One primary button, a few variant badges, a selected state — that's the budget.
- **Do** use labels over icons wherever space allows. Plain English reduces cognitive load for non-native speakers.
- **Do** respect `prefers-reduced-motion`. All transitions should be disableable.
- **Do** ensure all state changes (hover, focus, active, selected) are conveyed through more than color alone — pattern, text, or icon changes.
- **Do** use the cinema badge color system consistently. Each cinema keeps its assigned hue across every view.

### Don't:
- **Don't** use hero banners, upsell modules, or sales-first hierarchy. This is a tool, not a commercial cinema chain site. (PRODUCT.md: "Fandango / Odeon / Vue — Never this.")
- **Don't** add ratings, reviews, social proof, or community features. OV Berlin is not a taste network. (PRODUCT.md: "Letterboxd — Never this.")
- **Don't** use gradient text, glassmorphism, or decorative blurs. Every surface should be opaque and readable.
- **Don't** let the accent color dominate. If a screen feels "orange," the signal has become noise.
- **Don't** use pure #000 or #ffffff for text or backgrounds. The slate tint is intentional — it prevents the sterile default-computer look.
- **Don't** wrap everything in cards. Most information doesn't need a container; use cards only when the boundary genuinely helps scanning.
