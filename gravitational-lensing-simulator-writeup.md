# Language-Steered Gravitational Lensing Simulator

## One-line pitch

A physically accurate, real-time gravitational lensing renderer that runs entirely in the browser, where you describe a mass distribution in plain English ("two black holes orbiting each other, three solar masses each") and watch it warp a field of background light — built and hosted for $0.

## Why this project

Most "AI + physics" side projects fall into one of two traps: either the physics is a toy (a spring-mass demo dressed up with a chat interface), or the visualization is a toy (a JSON config wrapped in a chatbot). This project avoids both by keeping the actual general-relativity ray-tracing as the real engineering work, and treating the LLM purely as a nicer input layer than a form full of sliders. If you deleted the language layer entirely, you'd still have a legitimate physics simulator worth showing off. That's the test for whether an "AI" project has real substance.

It also sits at a nice intersection: systems/rendering work (shaders, real-time graphics), physics correctness (geodesics in curved spacetime, not Newtonian approximations), and a constrained, well-scoped use of an LLM (parameter extraction, not open-ended generation) — which is a healthier LLM use case than most portfolio projects attempt.

## What it actually does

1. User enters a scene description in natural language, or drags sliders directly.
2. An LLM parses the description into structured parameters: mass, position, velocity, spin, for one or more compact objects (point masses, or full Schwarzschild/Kerr black holes).
3. A ray-tracer computes light paths bent by the resulting spacetime curvature.
4. The result renders in real time: a background field (starfield, an uploaded image, or real astronomical data) visibly distorted — multiple images, arcs, Einstein rings, or a black hole shadow with a photon ring, depending on the configuration.
5. Everything after step 2 runs client-side, in-browser, with no backend.

## Architecture

### 1. Physics core (the actual project)

- **Model**: light rays as null geodesics in a Schwarzschild metric (single non-rotating mass) to start; Kerr metric (rotating mass) as a stretch goal, since it enables asymmetric photon rings and frame-dragging effects that look genuinely different.
- **Method**: backward ray-tracing — for each pixel, trace a ray from the camera through the curved spacetime and see what background source it hits. This is the standard approach used in physically-based black hole renderers (e.g. the methodology behind the *Interstellar* visualization work by Double Negative / Kip Thorne).
- **Simplification for real-time**: precompute a deflection-angle lookup table as a function of impact parameter, rather than numerically integrating the full geodesic equation per-pixel per-frame. Full numerical integration (Runge-Kutta on the geodesic ODEs) is the "do it properly offline" mode; the lookup table is the "keep it interactive" mode.
- **Multi-object case**: for more than one mass, this stops being analytically clean — approximate with a weak-field superposition of deflections for orbiting binaries (astrophysically imprecise but visually and pedagogically reasonable), and clearly label it as an approximation rather than quietly overselling its rigor.

### 2. Rendering layer

- **Three.js** scene with a **custom GLSL fragment shader** performing the per-pixel ray-tracing/deflection lookup. This is what makes it real-time in a browser rather than a multi-second Python render.
- Background source options: procedural starfield (default, zero dependencies), a user-uploaded image, or real astronomical imagery pulled from free public archives (SDSS, ESO) for a scene that's literally warping a real patch of sky.
- Camera controls (orbit/zoom) via Three.js `OrbitControls` equivalent for WebGL 2 (note: `THREE.OrbitControls` isn't available in some sandboxed environments — plan for a manual orbit-camera implementation if needed).

### 3. Language-steering layer

- Constrained-output prompting: the LLM's only job is to emit a small structured JSON object (mass, position, velocity per object), not free text. This keeps the "AI" surface area small and testable.
- **Free, no-backend options**:
  - **WebLLM** — a small open-weight model running entirely client-side via WebGPU. Zero cost, zero server, works offline after first load. Tradeoff: needs a WebGPU-capable browser and has a multi-second first load to fetch model weights.
  - **Client-side call to a free-tier hosted API** (e.g. Groq or Gemini free tier) — faster and more capable, but the API key is exposed in browser devtools if called directly from the client. Acceptable for a rate-limited demo, not for anything at scale.
  - **Local-only mode** — run the language layer via Ollama on your own machine for development/demo videos, and ship the public deployment with direct parameter controls only. This is the safest default: the deployed site is 100% free with no exposed credentials, and the language-steering capability lives in your README/demo footage.

### 4. Scene state & validation (the glue)

- A single typed `SceneState` object (objects with mass/position/velocity/spin, camera, background source, render quality) is the **only source of truth**. Sliders, the LLM parser, presets, and the URL all read from and write to this one object; the renderer just consumes it. This is what makes "the LLM is just an input layer" literally true in the code — deleting the language layer removes a writer, not a data model.
- LLM output is **validated and clamped before it touches the renderer**: parse the JSON against a schema (e.g. zod), clamp values to physically sane ranges (mass > 0, positions within the scene volume), and surface anything that was clamped or dropped rather than silently repairing it. The renderer should never see malformed state, no matter what the model emits.
- `SceneState` serializes into the **URL hash**, so every configuration is a shareable, bookmarkable link. For a portfolio project this is disproportionately valuable: "click this link and see the Einstein ring" beats "clone the repo" every time. It also gives you deep links for the README and demo posts for free.

### 5. Deployment

- Fully static build (HTML/JS/CSS + shader files) — no backend, no database, no API server.
- **GitHub Pages** for free hosting, or **Cloudflare Pages** as an alternative with a slightly friendlier CI setup.
- **GitHub Actions** (free compute minutes) to build and deploy on every push to main.
- Total infrastructure cost: **$0**, indefinitely, as long as you're on the local-only or WebLLM path for the language layer.

## Frontend design

### Design principle: the render is the product

Everything on screen competes with a black hole warping a starfield, and everything loses. So the design stance is **full-bleed canvas, minimal chrome**: the WebGL render fills the entire viewport, and all UI floats over it as translucent panels. The mental model is an observatory instrument panel, not a SaaS dashboard — the UI annotates the physics, it doesn't frame it.

### Layout

- **Full-viewport canvas** underneath everything. No page scroll, no margins, no header bar.
- **Command bar, bottom-center** — the natural-language input. A single line, styled like a command palette (Spotlight/Raycast), not a chat window. No message history, no avatars, no "assistant is typing". This is an input method, and the design should say so.
- **Scene panel, left edge** — collapsible stack of per-object cards plus global controls (background source, quality mode). Collapsed by default on first visit so the render gets the first impression.
- **Presets strip** — a row of 4–6 named, thumbnailed configurations (Einstein ring, orbiting binary, black hole shadow, off-axis microlensing). Sits above the command bar on first load, tucks away after first interaction. This doubles as a self-running demo and as a set of regression-test fixtures.
- **Top-right corner** — quality toggle (fast / high-fidelity), screenshot button, share-link button, and an FPS readout behind a debug toggle. Nothing else.

### Visual language

- **Background:** near-black with a hint of blue (`#050508`-ish), matched to the render's empty-space color so panel edges dissolve into the scene instead of boxing it in.
- **Panels:** translucent dark fills with backdrop blur and a 1px low-contrast border. The starfield should be faintly visible *through* the controls — that one detail sells the "instrument panel over glass" feel.
- **One accent color** (a warm amber reads well against blue-black space and evokes redshift; cyan is the safe alternative). Reserved strictly for interactive states and highlighted physics values. No decorative gradients — the gravitational lens is the gradient.
- **Type:** a clean sans for labels; a monospace with tabular numerals for every numeric readout (masses, distances, angles) so values don't jitter horizontally as they change. Physics quantities always carry units (M☉, r_s, arcsec) — the units are part of the credibility.

### Per-object cards

- One card per mass: name/type badge (point mass / Schwarzschild / Kerr), then mass, position, velocity — each as a **slider paired with a direct numeric input**. Sliders for exploration, typed values for precision; never force one or the other.
- Mass slider on a **log scale** (the interesting range spans stellar to supermassive).
- Add/remove object buttons on the panel; 2–3 objects is the realistic ceiling, so no virtualized lists or drag-reordering needed.
- Stretch: drag an object's marker directly on the canvas to reposition it — the panel updates live, reinforcing that panel and render share one state.

### The language input — the core UX problem

The whole pitch is "the LLM is a nicer input layer than sliders," so the UI has to make that *visible*, not just claim it:

- On submit, the command bar shows a brief in-flight state (subtle spinner in the bar itself, never a modal or overlay).
- When the parse lands, **the sliders animate to their new values** over ~400ms while the render updates. The user literally watches their sentence become parameters. This single interaction is the thesis of the project, demo-ready by construction.
- Below the bar, show the parsed interpretation as a compact editable summary — e.g. `2 objects · 3 M☉ each · circular orbit, r = 20 r_s` — with changed values briefly highlighted in the accent color. If the model misread something, the user corrects a slider, not a prompt.
- **Parse failure or out-of-range values:** inline message under the bar ("couldn't determine a mass — try including one, e.g. 'a 10 solar-mass black hole'"), state untouched. Never a modal, never a red error page.
- Placeholder text rotates through 3–4 real example prompts so the empty state teaches the feature.

### States to design deliberately (not discover in production)

- **WebLLM weight download** (hundreds of MB on first load): a small progress indicator on the command bar with size and percentage — and crucially, **the simulator stays fully usable via sliders and presets during the download**. Language input is an enhancement layer; it must never block the physics.
- **No WebGPU:** command bar shows a quiet "language input unavailable in this browser" note and the app degrades to sliders + presets. A banner, never a gate.
- **No WebGL 2 / shader compile failure / context loss:** fall back to the CPU-canvas renderer from build step 1 at reduced resolution, with a notice. The step-1 prototype is kept alive as the fallback path, not thrown away.
- **First visit:** load directly into a preset (single mass, visible Einstein ring) — never an empty scene. The first pixel the user sees should already be lensed.

### Performance UX

- **Adaptive resolution:** render at reduced internal resolution while the camera moves or a slider is being dragged, then refine to full resolution when input goes idle. Interaction smoothness beats static sharpness on every frame the user is touching something.
- Quality toggle maps to the two physics modes already in the spec: lookup-table (fast) vs. numerically integrated (high-fidelity), with the current mode always visible so screenshots are honest about which mode produced them.

### Responsive & accessibility

- Desktop-first (this is a GPU showcase), but on mobile the scene panel becomes a bottom sheet and the command bar stays put; touch-drag orbits the camera, pinch zooms.
- Honor `prefers-reduced-motion`: no auto-orbit, no slider animation — values snap instead.
- Every control reachable by keyboard; sliders respond to arrow keys with sensible steps. Don't encode meaning in color alone (the accent highlight on changed values also gets a brief underline or similar).

## Suggested build order

1. **Static single-mass lens, no shader** — CPU-side deflection math on a canvas grid (like the demo you just saw), to validate the physics formulas before touching GLSL. Alongside it, write the physics unit tests: deflection at the solar limb ≈ 1.75″, Einstein radius against the analytic formula, and symmetry checks (a centered mass produces a symmetric ring). These tests are what let you refactor the shader later without wondering if you broke the physics. Keep this CPU renderer — it becomes the no-WebGL fallback path.
2. **Port to a GLSL fragment shader in Three.js** — same math, real-time, full-screen.
3. **Build the UI shell around `SceneState`** — full-bleed canvas, scene panel with one object card, slider ↔ numeric input wiring, URL-hash serialization. Getting the single-source-of-truth state model right *before* adding more writers (LLM, presets) is much cheaper than retrofitting it.
4. **Add a real background** — starfield generator, then optional image/SDSS data as a texture.
5. **Add camera movement and a second mass** — this is where the "orbiting binary" visual payoff shows up. Add the presets strip here; each preset is just a saved `SceneState`.
6. **Add the language-steering layer** — start with a hardcoded parser (regex/keyword extraction) to validate the JSON schema, the validation/clamping layer, and the slider-animation UX, then swap in the actual LLM call. The command bar's error and loading states are designed here, not bolted on.
7. **Deploy to GitHub Pages via GitHub Actions.**
8. **Stretch**: Kerr metric (rotating black holes), gravitational time dilation visualized via a clock/redshift overlay, numerically-integrated "high fidelity" render mode as a toggle against the lookup-table fast mode, drag-to-reposition masses on the canvas.

## Honest scope note

A fully correct Kerr-metric renderer with numerically integrated geodesics is genuinely research-grade work — the goal here isn't to reproduce a NASA visualization team's output, it's to build something that's physically grounded (real deflection formulas, not made-up bending) and honest about where it simplifies (lookup tables instead of full integration, weak-field superposition for multi-body scenes). That honesty is itself worth stating explicitly in the project README — it's the difference between "I built a physically accurate simulator" and "I built a physically accurate simulator, and here specifically is where and why it approximates."

## Tech stack summary

| Layer | Tool | Cost |
|---|---|---|
| Rendering | Three.js + custom GLSL shader | Free |
| Physics | Custom (Schwarzschild deflection, optionally Kerr) | Free |
| Build tooling | Vite + TypeScript (raw GLSL imports via `?raw` or vite-plugin-glsl) | Free |
| UI | Vanilla CSS (surface is small; a framework buys little here) | Free |
| State validation | zod schema on all LLM output | Free |
| Testing | Vitest for physics unit tests against analytic values | Free |
| Language steering | WebLLM (in-browser) or local Ollama | Free |
| Hosting | GitHub Pages | Free |
| CI/CD | GitHub Actions | Free |
| Background data | SDSS / ESO public archives | Free |
