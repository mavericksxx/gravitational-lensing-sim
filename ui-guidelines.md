# UI Guidelines

Companion to [gravitational-lensing-simulator-writeup.md](gravitational-lensing-simulator-writeup.md) (the spec, especially its "Frontend design" and "Space environment & HUD chrome" sections) and [implementation-plan.md](implementation-plan.md). The spec describes intent; this doc fixes the actual values. Every stage from Stage 3 onward follows this doc instead of re-deciding colors, sizes, or timings. If a value here conflicts with a guess you were about to make, this doc wins. If a value here turns out to be wrong in practice, change it *here* first, then in code.

Ground rule from the spec, restated as law: **the render is the product**. Chrome is translucent, dim, and quiet. The single accent color is the only saturated thing the UI is allowed to contribute; the lens does the rest.

---

## 1. Design tokens

Implement these as CSS custom properties on `:root` (e.g. `--color-accent`, `--space-3`). Vanilla CSS per the tech stack — no preprocessor, no theme framework.

### 1.1 Color

There is one theme. No light mode — the app *is* a dark scene.

| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#050508` | Viewport/body background; must exactly match the shader's empty-space clear color so panel edges dissolve into the scene |
| `--color-panel` | `rgba(10, 12, 20, 0.62)` | Panel/command-bar/card fill (over backdrop blur). 0.62 alpha is a floor, not a suggestion — see §5.1 |
| `--color-panel-solid` | `#0d1018` | Fallback fill when `backdrop-filter` is unsupported |
| `--color-border` | `rgba(158, 173, 204, 0.14)` | 1px borders on panels, cards, inputs |
| `--color-border-strong` | `rgba(158, 173, 204, 0.28)` | Hovered/active input borders, dividers that must read |
| `--color-accent` | `#FFB454` | The one accent. Warm amber, per the spec's redshift rationale. Interactive states and highlighted physics values only — never decorative |
| `--color-accent-hover` | `#FFC77D` | Hover on accent-colored interactive elements |
| `--color-accent-active` | `#E89A38` | Pressed/active |
| `--color-accent-muted` | `rgba(255, 180, 84, 0.40)` | Disabled accent elements, inactive slider track fill |
| `--color-accent-glow` | `rgba(255, 180, 84, 0.35)` | Glow/box-shadow color for HUD accents (see §1.6) |
| `--color-text` | `#E8EAF2` | Primary text: values, labels in focus, headings |
| `--color-text-dim` | `#9BA3B8` | Secondary text: units, captions, placeholder, inactive labels |
| `--color-text-faint` | `rgba(155, 163, 184, 0.55)` | Tertiary: disabled text, the FPS readout at rest |
| `--color-error` | `#FF7A6B` | Inline parse-error text and error border tint. Warm red, distinguishable from amber; always paired with an icon or text per §5.4 |
| `--color-shadow` | `rgba(0, 0, 0, 0.5)` | Drop shadows under floating panels |

Nebula wash colors (ambient layer only, never UI): indigo `#2E3D7A`, violet `#4A2E7A`. See §2.6.

### 1.2 Spacing

4px base. Use the scale; don't invent intermediate values.

| Token | Value | Typical use |
|---|---|---|
| `--space-1` | `4px` | Icon-to-label gap, slider-to-value gap |
| `--space-2` | `8px` | Gaps inside a control row; button padding-y |
| `--space-3` | `12px` | Card internal padding; gaps between control rows |
| `--space-4` | `16px` | Panel internal padding; gap between cards |
| `--space-5` | `24px` | Panel offset from viewport edges; command-bar bottom offset |
| `--space-6` | `32px` | Separation between major floating elements (presets strip ↔ command bar) |

### 1.3 Typography

Two faces, both system/free — no webfont download blocking a GPU demo:

- **Sans (labels, headings, messages):** `Inter, -apple-system, "Segoe UI", Roboto, sans-serif` — ship Inter via `@font-face` self-hosted with `font-display: swap`; system fallback is fine until it loads.
- **Mono (every numeric readout, units, the FPS counter, parsed-summary values):** `"JetBrains Mono", "SF Mono", "Cascadia Code", Consolas, monospace` with `font-variant-numeric: tabular-nums` set globally on the mono class. Self-host JetBrains Mono the same way. Any number that changes at runtime is mono — no exceptions, that's what kills jitter.

Type scale (root `16px`; all sizes in rem):

| Style | Size | Weight | Face | Letter-spacing | Use |
|---|---|---|---|---|---|
| `panel-title` | `0.8125rem` (13px) | 600 | Sans | `0.08em`, uppercase | Panel/section headers ("SCENE", "OBJECT 1") |
| `label` | `0.75rem` (12px) | 500 | Sans | `0.02em` | Slider/control labels ("Mass", "Position x") |
| `value` | `0.8125rem` (13px) | 500 | Mono | `0` | Numeric readouts and inputs |
| `unit` | `0.6875rem` (11px) | 400 | Mono | `0` | Units after values (`M☉`, `r_s`, `arcsec`), in `--color-text-dim` |
| `badge` | `0.625rem` (10px) | 600 | Sans | `0.1em`, uppercase | Object type badge (POINT MASS / SCHWARZSCHILD / KERR), quality-mode tag |
| `input` | `0.875rem` (14px) | 400 | Sans | `0` | Command-bar text and placeholder |
| `caption` | `0.75rem` (12px) | 400 | Sans | `0` | Inline errors, parsed summary, notices |

Line-height `1.4` everywhere except single-line controls (`1`). Units are part of the value's markup, always rendered, never implied by context alone.

### 1.4 Border radius

| Token | Value | Use |
|---|---|---|
| `--radius-1` | `3px` | Numeric inputs, badges, slider thumb (if square-ish) |
| `--radius-2` | `6px` | Buttons, preset thumbnails, object cards |
| `--radius-3` | `10px` | Panels, command bar, bottom sheet top corners |

Nothing fully rounded except the slider thumb (circle, see §2.2).

### 1.5 Backdrop blur

| Token | Value | Use |
|---|---|---|
| `--blur-panel` | `blur(14px)` | Scene panel, command bar, presets strip, bottom sheet |
| `--blur-control` | `blur(8px)` | Small floating elements: top-right cluster buttons, FPS readout |

Always pair `backdrop-filter` with `-webkit-backdrop-filter` and an `@supports not (backdrop-filter: blur(1px))` fallback swapping `--color-panel` for `--color-panel-solid`. The starfield being faintly visible through panels is the point — but only faintly (§5.1).

### 1.6 Glow / shadow

| Token | Value | Use |
|---|---|---|
| `--shadow-panel` | `0 8px 32px rgba(0, 0, 0, 0.5)` | All floating panels — separates glass from starfield |
| `--glow-hud` | `0 0 8px var(--color-accent-glow)` | The scene panel's top border (§2.1), focused command bar |
| `--glow-focus` | `0 0 0 2px rgba(255, 180, 84, 0.25)` | Outer ring accompanying `:focus-visible` outline (§5.2) |

Glow is reserved for HUD structure (top border, corner brackets) and focus. Buttons and sliders do not glow on hover — they brighten.

---

## 2. Component specs

### 2.1 Scene panel shell

Left edge, floating (`position: fixed`), `--space-5` from the left and top edges, `max-height: calc(100vh - 2 * var(--space-5))` with internal scroll (`overflow-y: auto`, thin styled scrollbar).

- **Expanded:** width `320px`. Fill `--color-panel`, blur `--blur-panel`, border `1px solid var(--color-border)`, radius `--radius-3`, shadow `--shadow-panel`. Internal padding `--space-4`.
- **Collapsed (default on first visit):** shrinks to a `44px × 44px` tab pinned at the same top-left offset, showing a single icon (sliders glyph) at `--color-text-dim`. Click or `Enter` expands. Collapse control in the expanded state is a chevron button in the panel header, top-right, `24px` hit area.
- **HUD top border:** a `2px` top border in `--color-accent` at 85% opacity, with `--glow-hud`. Implement as an absolutely-positioned `::before` strip spanning the panel's top inside the radius — not `border-top`, so the glow doesn't distort the corner radii.
- **Corner brackets:** on the panel's two *outer* corners (top-left, bottom-left), fine L-shaped brackets: two `1px` strokes, `12px` arm length, `--color-accent` at 60% opacity, offset `-4px` outside the panel edge. Implement as `::before`/`::after` on a wrapper, or two small absolutely-positioned elements with `border-left` + `border-top`. Purely decorative: `aria-hidden`, no pointer events.
- Section order inside: panel header → object card(s) → add-object button → global controls (background source, quality) — separated by `1px` `--color-border` dividers with `--space-3` padding.
- Optional scanline texture (spec calls it optional polish): a repeating linear gradient overlay, `rgba(255,255,255,0.015)` lines `1px` every `3px`, on the panel only. If it's visible enough to notice in a screenshot, it's too strong.

### 2.2 Per-object cards

Card: fill `rgba(255, 255, 255, 0.03)` over the panel (no extra blur), border `1px solid var(--color-border)`, radius `--radius-2`, padding `--space-3`, cards stacked with `--space-3` gaps.

Header row: object name (`label` style, `--color-text`) + type badge (`badge` style, `--color-text-dim` on `rgba(255,255,255,0.06)` pill, padding `2px 6px`) + remove button (`×`, `20px` hit area, right-aligned, `--color-text-faint` → `--color-error` on hover).

Each parameter (mass, position, velocity) is one two-line group:

```
Mass                    [ 3.00 ] M☉
[========|--------------------]
```

- Line 1: label left; numeric `<input type="text" inputmode="decimal">` right, width `72px`, text-align right, `value` type style, fill `rgba(255,255,255,0.05)`, border `1px solid var(--color-border)` (→ `--color-border-strong` on hover, accent on focus), radius `--radius-1`, padding `2px 6px`; unit after the input in `unit` style.
- Line 2: full-width `<input type="range">`, restyled. Track `4px` tall, radius `2px`, fill `rgba(255,255,255,0.10)`; filled portion (left of thumb) `--color-accent-muted`. Thumb: `14px` circle, `--color-accent`, `1px` border of `--color-bg` (crisp against the track), scales to `16px` on hover/drag. No tick marks except on the mass slider.
- Slider and input are two views of the same `SceneState` field: input commits on `Enter` or blur, clamped to the slider's range; out-of-range typed values clamp and flash the input border in `--color-error` for `800ms` — never silently ignored.

**Log-scale mass slider:** the range input's value is `log10(mass in M☉)`; the numeric input and readout always show linear mass. Range `10⁰`–`10⁹ M☉`, `step="0.01"` in log units. Subtle tick marks below the track at each decade (1, 10, 100, … `1e9`), `1px × 4px` lines in `--color-border-strong`; label only the decades `1`, `10³`, `10⁶`, `10⁹` in `unit` style. Displayed value formatting: 3 significant figures, switching to `×10ⁿ` notation at ≥ `10⁴`.

### 2.3 Command bar

Bottom-center: `position: fixed; bottom: var(--space-5); left: 50%; transform: translateX(-50%)`. Width `min(560px, calc(100vw - 2 * var(--space-5)))`, height `48px`. Fill/blur/border/radius/shadow per panel tokens. Left-aligned `›` prompt glyph in `--color-accent` at 70%, then the input (`input` type style, no visible inner border).

| State | Treatment |
|---|---|
| Idle | Border `--color-border`; placeholder in `--color-text-dim`, rotating (below) |
| Focused | Border `1px solid var(--color-accent)` at 60% opacity + `--glow-hud`; prompt glyph to full accent |
| Loading | Border stays focused-style; a `16px` circular spinner (1.5px stroke, `--color-accent`, 0.9s linear rotation) replaces the prompt glyph; input disabled but text remains visible. Never a modal or overlay |
| Error | Border tints to `--color-error` at 50%; one-line inline message *below* the bar (`caption` style, `--color-error`, `--space-2` gap) with a `⚠` glyph prefix. Clears on next input focus. State untouched, per spec |
| Success | Border flashes `--color-accent` (full) for `600ms`, then returns to idle; parsed summary appears below the bar (`caption` style, values in mono; changed values per §5.4) |
| Unavailable (no WebGPU) | Bar remains rendered but input disabled; static placeholder "language input unavailable in this browser" in `--color-text-faint`. A note, never a gate |
| Downloading weights | Thin `2px` progress bar along the bar's bottom edge in `--color-accent-muted`, plus `caption` text below: "downloading language model — 214 / 640 MB (33%)". Bar stays fully interactive for typing once loaded; sliders/presets always live |

**Placeholder rotation:** 4 example prompts (e.g. "a 10 solar-mass black hole", "two black holes orbiting each other, 3 M☉ each", "a supermassive lens, slightly off-axis", "an Einstein ring"). Cross-fade every `6s` (`400ms` opacity fade out/in, no slide). Rotation pauses while focused and freezes entirely (first prompt shown) under `prefers-reduced-motion`.

### 2.4 Presets strip

A row of 4–6 preset buttons, horizontally centered `--space-6` above the command bar.

- Each preset: thumbnail `96px × 54px` (16:9), pre-rendered static images shipped as assets (not live renders), radius `--radius-2`, border `1px solid var(--color-border)`, `filter: brightness(0.85)` at rest → `brightness(1)` + border `--color-accent` at 60% on hover/focus. Name below in `label` style, `--color-text-dim` → `--color-text` on hover. Gap between presets `--space-3`.
- The strip itself gets no panel fill — thumbnails float directly over the scene (they're already images; glass adds nothing).
- **Tuck-away:** visible on first load; after the user's first manual interaction (any slider/input change, command-bar submit, or camera drag — *not* hover, *not* clicking a preset), the strip animates out per §3 and is replaced by a `28px`-tall pill tab ("Presets", `badge` style) sitting where the strip's bottom edge was. Clicking the tab restores the strip; it does not auto-tuck again that session. Tucked state is session-only (not in `SceneState`, not in the URL).

### 2.5 Top-right control cluster

`position: fixed; top: var(--space-5); right: var(--space-5)`. A horizontal row, `--space-2` gaps.

- **Buttons (screenshot, share-link):** `32px × 32px`, icon-only (`16px` icons), fill `rgba(10, 12, 20, 0.5)` + `--blur-control`, border `1px solid var(--color-border)`, radius `--radius-2`. Icon `--color-text-dim` → `--color-text` on hover, `--color-accent` while active (e.g. "copied!" moment — show a `1.5s` `caption` toast below the button, no color-only signaling).
- **Quality toggle:** a two-segment control, same height, segments "FAST" / "HI-FI" in `badge` style. Active segment: `--color-accent-muted` fill, `--color-text` label; inactive: transparent, `--color-text-dim`. The active mode label is always visible — screenshots must be honest about which physics mode produced them, per spec.
- **FPS readout:** hidden by default, shown via debug toggle (keybind ``` ` ```). When shown: mono `value` style in `--color-text-faint`, no background, right-aligned under the cluster, format `60 fps`. It's telemetry, not a control — no border, no blur.

### 2.6 Ambient background layers

All pure CSS/DOM/2D-canvas, behind the WebGL canvas in paint order but visually "around" the lensed content (the lens render has its own transparent-to-`--color-bg` surroundings). Stacking, bottom → top: nebula washes → starfield layers → WebGL canvas → vignette → UI. None of it touches `SceneState` or the lens shader.

**Parallax starfield — 3 layers**, each its own canvas or pre-generated tiled background image:

| Layer | Star size | Density | Opacity | Drift | Pointer parallax |
|---|---|---|---|---|---|
| Far | `1px` | ~1 star / 6,000 px² | 0.5 | `2px / 10s` diagonal (up-left), linear, looped | translate `±2px` |
| Mid | `1.5px` | ~1 star / 14,000 px² | 0.7 | `4px / 10s`, same direction | translate `±5px` |
| Near | `2–2.5px` | ~1 star / 40,000 px² | 0.9 | `7px / 10s` | translate `±10px` |

Star color: white with a scatter of `#C9D4FF` (cool) and `#FFD9A0` (warm) at roughly 80/12/8%. Twinkle: on the near layer only, ~10% of stars oscillate opacity `±0.25` on a `3–5s` ease-in-out loop with randomized phase. Pointer parallax eases with `transform` transitions of `600ms ease-out`; drift and parallax are `transform`-only (compositor-friendly), never layout.

**Nebula washes — exactly two**, fixed-position radial-gradient divs, `mix-blend-mode: screen`, `pointer-events: none`:

1. Indigo `#2E3D7A`: ellipse ~`110vw × 80vh`, centered at `(-15vw, 20vh)` (upper-left, mostly off-canvas), peak opacity `0.10`, fading to transparent at 65% radius.
2. Violet `#4A2E7A` with a core hint of `--color-accent` at `0.03`: ellipse ~`90vw × 90vh` centered at `(105vw, 85vh)` (lower-right), peak opacity `0.07`.

Static — no animation. If a wash is identifiable as a shape rather than felt as depth, reduce its opacity.

**Vignette:** full-viewport overlay, `pointer-events: none`, above the WebGL canvas, below the UI: `radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.45) 100%)`. Static.

---

## 3. Motion

One easing vocabulary, three curves:

| Token | Curve | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Things arriving/settling: slider animation, panel expand, strip return |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Things leaving: panel collapse, strip tuck-away |
| `--ease-linear` | `linear` | Continuous ambient loops: drift, spinner |

| Animation | Duration | Curve | Notes |
|---|---|---|---|
| Slider animation on LLM parse | `400ms` | `--ease-out` | Slider thumb, filled track, and numeric readout interpolate together; readout ticks through intermediate values (mono/tabular, so no jitter). Renderer updates live during the tween — the render following the sentence *is* the demo |
| Panel expand / collapse | `240ms` / `200ms` | `--ease-out` / `--ease-in-out` | Animate width + opacity of contents (contents fade over the first/last `120ms`); never animate blur radius (expensive) |
| Presets tuck-away / return | `300ms` / `260ms` | `--ease-in-out` / `--ease-out` | Slide down `16px` + fade to 0; tab fades in after `150ms` delay |
| Hover transitions | `120ms` | `--ease-out` | Color, border-color, brightness only |
| Focus ring | `0ms` | — | Focus indication is instant, always |
| Command-bar success flash | `600ms` | `--ease-out` | Border color out-fade |
| Changed-value highlight | `2s` hold + `400ms` fade | `--ease-out` | See §5.4 |
| Starfield drift | continuous | `--ease-linear` | Speeds per §2.6 |
| Twinkle | `3–5s` loop | ease-in-out | Near layer only |
| Placeholder rotation | `400ms` fade per `6s` cycle | `--ease-out` | §2.3 |

**`prefers-reduced-motion: reduce` — exact policy.** Static-but-present, never removed:

- **Frozen (animation removed, element stays):** starfield drift, twinkle, pointer parallax, placeholder rotation (first placeholder shown statically), auto-orbit (if any), success-flash and changed-value fades (highlight appears and disappears without transition).
- **Snapped (transition duration → 0):** slider animation on parse (values jump; the parsed-summary highlight still marks what changed), panel expand/collapse, presets tuck-away, hover transitions.
- **Kept:** the loading spinner (it's status information, not decoration) and the weight-download progress bar.

Implement as a single `@media (prefers-reduced-motion: reduce)` block zeroing the duration tokens and pausing the ambient canvas loop — not per-component special-casing.

---

## 4. Responsive breakpoints

Desktop-first. Two breakpoints, that's all:

| Breakpoint | Condition | Changes |
|---|---|---|
| Desktop (default) | `> 900px` | Layout as specified above |
| Compact | `≤ 900px` | Scene panel narrows to `280px`; presets strip becomes horizontally scrollable (`overflow-x: auto`, no scrollbar chrome); top-right cluster unchanged |
| Mobile | `≤ 640px` | Scene panel becomes a **bottom sheet**: full-width, top corners `--radius-3`, HUD top border and brackets retained (brackets move to the sheet's top corners). Peek state `56px` tall (drag handle + panel title); expanded state `60vh`, drag or tap to toggle, `240ms --ease-out`. Command bar stays bottom-center, sitting `--space-2` above the sheet's peek edge; presets strip moves above the command bar and scrolls horizontally. Touch-drag orbits the camera, pinch zooms. Thumb hit areas ≥ `44px` |

Never let the panel and command bar overlap: on mobile the sheet's expanded state pushes the command bar to sit on top of the sheet's upper edge (bar is above the sheet in z-order at all times).

---

## 5. Accessibility

### 5.1 Contrast over translucent panels — the scrim strategy

Targets: **4.5:1** for all text, **3:1** for large text (≥ 18.66px bold — effectively only `panel-title` never qualifies, so treat 4.5:1 as the universal bar) and for UI component boundaries (slider track vs. panel, borders on inputs).

A blurred, animated starfield behind glass makes background luminance unpredictable, so contrast is guaranteed by construction, not measured against the scene:

- **Minimum backing scrim:** `--color-panel`'s `0.62` alpha over `blur(14px)` is the contract. Worst realistic case behind a panel is blurred white starfield + nebula wash ≈ 12% luminance patches; blur averages it down and the 0.62 black-ish scrim caps the effective backdrop at ≈ `#2A2D38` luminance. `--color-text` (`#E8EAF2`) on `#2A2D38` clears 9:1; `--color-text-dim` clears 5:1. **Rule: any text-bearing surface uses at least `--color-panel` alpha 0.62. Decorative surfaces (preset thumbnails) may be clearer; text may never sit on less.**
- The blur fallback (`--color-panel-solid`, opaque) trivially passes — verify the accent and dim-text pairings against `#0d1018`: accent `#FFB454` clears 8:1, fine for text and borders.
- The FPS readout is the one text element without a scrim; it's debug-only and exempt, but keep it `--color-text-faint` at minimum size 13px mono, positioned in the vignette-darkened corner.
- Accent-on-panel (`#FFB454` on the scrim) ≈ 7:1 — accent text and accent borders both pass without adjustment.

### 5.2 Focus

`:focus-visible` (never bare `:focus`) on every interactive element: `outline: 2px solid var(--color-accent); outline-offset: 2px;` plus `box-shadow: var(--glow-focus)`. No transition on focus appearance. Keyboard traversal order: scene panel (top→bottom) → presets strip → command bar → top-right cluster. The collapsed panel tab, preset tab, and bottom-sheet handle are all real `<button>`s.

### 5.3 Keyboard interaction — sliders

Native `<input type="range">` semantics, with explicit steps:

| Key | Linear sliders (position, velocity) | Log mass slider |
|---|---|---|
| `←` / `→` (and `↓` / `↑`) | ±1 step = ±1% of range | ±0.05 in log₁₀ (≈ ±12% of current mass) |
| `Shift + ←/→` | ±10% of range | ±0.5 in log₁₀ (≈ ×3 / ÷3) |
| `PageUp` / `PageDown` | ±10% of range | ±1.0 in log₁₀ (×10 / ÷10) |
| `Home` / `End` | min / max | `10⁰` / `10⁹ M☉` |

Every slider has an `aria-label` including the unit ("Mass in solar masses") and, for the log slider, `aria-valuetext` reporting the *linear* value ("3 solar masses"), not the log position. Numeric inputs accept the same `↑`/`↓` stepping. `Escape` in the command bar clears input; `Escape` elsewhere collapses the panel/sheet.

### 5.4 Meaning beyond color

The rule: every state that is signaled with the accent (or error) color carries a second, non-color signal.

- **Changed values after an LLM parse (the canonical case):** the changed value in the parsed summary and on the affected card renders in `--color-accent` **and** gets a `1px solid` underline (`text-decoration-thickness: 1px; text-underline-offset: 3px`) in the same color, held for `2s`, then both fade over `400ms` (under reduced motion: appear/disappear with no fade). Color-blind users see the underline; screen readers get an `aria-live="polite"` region announcing "updated: mass 3 solar masses".
- **Errors:** `--color-error` text always accompanied by the `⚠` glyph and message text; error input borders always accompanied by the inline message.
- **Quality toggle:** active segment has the fill *and* the label — the state is readable as text ("FAST" vs "HI-FI"), not just as which side glows.
- **Clamped LLM values:** surfaced in the parsed summary as text ("mass clamped to 10⁹ M☉"), italic, with the underline treatment — never just a tinted number.

### 5.5 Miscellany

- All decorative layers (starfield, washes, vignette, brackets) are `aria-hidden="true"` and `pointer-events: none`.
- The canvas gets `role="img"` and a live `aria-label` summarizing the scene ("gravitational lens: 1 object, 3 solar masses").
- Hit areas ≥ `24px` on desktop pointers, ≥ `44px` on touch, regardless of visual size.
- Respect `prefers-contrast: more` by raising `--color-border` to `0.3` alpha and `--color-panel` to `0.85` alpha — one media query, token-level.
