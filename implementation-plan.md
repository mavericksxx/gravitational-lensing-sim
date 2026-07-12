# Implementation Plan

Companion to [gravitational-lensing-simulator-writeup.md](gravitational-lensing-simulator-writeup.md). That doc is the spec; this doc is the execution plan.

## How to use this

Each stage below is scoped to be **one prompt in one Claude Code session**. Work through them in order — later stages assume earlier ones are committed. At the end of every stage:

1. Verify the acceptance criteria for that stage before moving on.
2. Commit the working state (`git commit`) so each stage is a clean checkpoint you can diff, revert to, or resume from later.
3. Start a **fresh session** for the next stage and paste its prompt. Don't chain stages in one long session — a fresh session keeps context small and forces the acceptance criteria to actually be met (not just "probably fine, moving on").

Each stage entry has: what exists at the end, what NOT to build yet (scope fence), the prompt to paste, and how to verify it worked. The scope fences matter as much as the prompts — the biggest risk in a plan like this is a stage quietly swallowing the next one.

---

## Stage 0 — Scaffolding

**End state:** empty but running Vite + TypeScript project, deployable shell, nothing physics-related yet.

**Scope fence:** no physics, no shader, no UI beyond a placeholder canvas. Resist the urge to "just add" anything from Stage 1.

**Prompt:**
> Set up a new Vite + TypeScript project for a browser-based physics simulator (no framework — vanilla TS). Add Vitest for testing, ESLint + Prettier with a sane default config, and a basic folder structure: `src/physics/`, `src/render/`, `src/ui/`, `src/state/`. Add a full-viewport `<canvas>` element with a placeholder animation (anything — a moving gradient is fine) just to prove the render loop and build pipeline work. Set up a GitHub Actions workflow file that runs lint + test + build on every push (deployment comes later — for now it should just verify the build doesn't break). Write a minimal README with setup instructions.

**Verify:** `npm run dev` shows the placeholder canvas; `npm run build` and `npm test` succeed; CI workflow is present (doesn't need a real deploy target yet).

---

## Stage 1 — Physics core + CPU reference renderer

**End state:** Schwarzschild deflection math, validated against known analytic values, rendering a single-mass lens on a 2D canvas (no WebGL, no shader — pure CPU per-pixel loop). This is the fallback renderer for later, and the ground truth the shader gets checked against.

**Scope fence:** single static mass only, no camera movement, no background image (procedural test pattern is enough), no UI panel. This stage is physics correctness, not product.

**Prompt:**
> Implement the Schwarzschild gravitational lensing deflection math in `src/physics/` (TypeScript, no dependencies). Given a point mass and a camera/observer setup, compute the deflection angle as a function of impact parameter, and use it to backward-ray-trace a 2D canvas: for each pixel, determine what point on a background source (a simple procedural checkerboard or starfield pattern is fine for now) that ray originated from, accounting for the bending. Render this on a `<canvas>` at a fixed resolution (doesn't need to be real-time — a few seconds per frame is fine at this stage). Write Vitest unit tests against known analytic values: deflection angle at the solar limb (~1.75 arcseconds for the Sun's mass and radius), the Einstein radius formula for a simple symmetric lens configuration, and a symmetry check (a centered mass on a symmetric background produces a symmetric ring). Keep this CPU renderer isolated behind a clean function signature (something like `renderLensedImage(mass, cameraConfig, backgroundSampler) -> ImageData`) — it needs to be reusable later as a fallback path when WebGL isn't available.

**Verify:** unit tests pass and match known physical values; visually, a single mass over a checkerboard produces a visible Einstein ring / arc distortion when the camera looks straight at it.

---

## Stage 2 — GLSL shader port

**End state:** the same single-mass deflection math running in real time as a Three.js full-screen fragment shader.

**Scope fence:** still one mass, still no UI controls — hardcode the mass/camera values for now. The only goal is "CPU math now runs per-pixel on the GPU at interactive framerates."

**Prompt:**
> Port the Schwarzschild deflection math from `src/physics/` (Stage 1) into a GLSL fragment shader, rendered via a Three.js full-screen quad. The shader should reproduce the same backward ray-tracing approach: for each pixel/fragment, compute the deflected ray direction and sample a background texture (a simple procedural starfield generated in the shader, or a placeholder texture, is fine). Precompute a deflection-angle lookup table as a function of impact parameter (as a 1D texture or uniform array) rather than doing the full analytic calculation per-fragment, matching the "lookup table for real-time, full integration offline" approach from the project spec. Hardcode a single mass and a fixed camera position for now — no controls yet. Confirm it runs at interactive framerates (aim for 60fps at a reasonable canvas size) and that the visual result (ring/arc shape) matches what the Stage 1 CPU renderer produced for the same configuration, as a sanity check.

**Verify:** shader renders in real time (not multi-second); visual comparison against the Stage 1 CPU output for the same mass/camera config looks consistent (same ring shape/size).

---

## Stage 3 — SceneState, URL persistence, and the UI shell

**End state:** a single typed `SceneState` object is the source of truth; a slider-and-numeric-input panel for one object writes to it; the shader reads from it; the state round-trips through the URL hash. This is the architectural backbone every later stage plugs into.

**Scope fence:** still one object, no presets, no language input, no background variety. This stage is entirely about getting the state model and panel UI right before there are multiple writers competing for it.

**Prompt:**
> Referencing the "Scene state & validation" and "Frontend design" sections of `gravitational-lensing-simulator-writeup.md`, implement a single typed `SceneState` object (in `src/state/`) covering one lensing object (mass, position, velocity) plus camera and render-quality fields. Wire it as the single source of truth: build a left-edge, collapsible, translucent panel (per the visual language in the spec — near-black background, backdrop blur, one accent color, monospace tabular numerals for values with units) with one object card containing sliders paired with direct numeric inputs (mass on a log scale). Slider/input changes update `SceneState`, which feeds the Stage 2 shader's uniforms in real time. Serialize `SceneState` to and from the URL hash on change, so reloading or sharing a URL restores the exact scene. Full-viewport canvas underneath, no page scroll. Don't build presets, language input, or additional objects yet — this stage is purely the state model and single-object panel.

**Verify:** dragging a slider updates the render live; typing a numeric value matches slider behavior; reloading the page (or pasting the URL fresh) restores the same scene; state shape is a single object, not scattered across components.

---

## Stage 4 — Backgrounds

**End state:** three interchangeable background sources feeding the shader: procedural starfield (default), user-uploaded image, and a real astronomical image (SDSS/ESO).

**Scope fence:** no new physics, no new objects — this is purely "what texture does the shader sample."

**Prompt:**
> Add background source options to the lensing simulator (Three.js/GLSL shader from Stage 2, driven by `SceneState` from Stage 3). Implement: (1) a procedural starfield generator as the default background, (2) a user image upload that becomes the background texture, and (3) fetching a real astronomical image from a free public archive (SDSS or ESO cutout service) as a texture option. Add a background-source control to the existing scene panel. Store the selected source (and any relevant params, like an uploaded image reference or SDSS query params) in `SceneState` so it round-trips through the URL where feasible (obviously an uploaded image itself can't live in a URL — handle that gracefully, e.g. falling back to starfield on reload if no image is present).

**Verify:** all three background modes render correctly behind the lensing distortion; switching between them is instant; an uploaded image persists for the session and degrades gracefully on reload.

---

## Stage 5 — Space environment & UI atmosphere

**End state:** the areas outside the lensed scene read as deep space, not a flat dark fill — a multi-layer parallax starfield, one or two nebula-tinted glow washes, and an edge vignette sit behind everything. The Stage 3 scene panel gets HUD-style chrome (glowing top border, corner brackets) so it reads as an instrument readout instead of a generic card.

**Scope fence:** pure visual/ambient polish — no new physics, no new `SceneState` fields, no new panels or controls beyond what Stage 3 already built, no changes to the lens shader's math. Stay dependency-free: CSS plus a small ambient canvas/DOM layer, nothing more. If you catch yourself reaching for a particle-effects library, stop.

**Prompt:**
> Referencing the new "Space environment & HUD chrome" section of `gravitational-lensing-simulator-writeup.md`, add an ambient space atmosphere layer and HUD-style chrome polish on top of the existing UI (the Stage 3 scene panel, the Stage 4 starfield background). Specifically: (1) a lightweight multi-layer parallax starfield — 2–3 layers at different densities, sizes, and drift speeds — rendered behind the main lensed scene, drifting slowly and autonomously or reacting subtly to pointer movement, so the space outside the lensed content has visible depth instead of being a flat dark fill; (2) one or two very low-opacity radial nebula-tinted gradient washes (blues/purples, using the existing accent color sparingly) placed off-center; (3) a subtle vignette toward the viewport edges; (4) HUD treatment on the existing scene panel: a thin glowing top border in the accent color and fine corner-bracket accents on its outer corners, readable over the existing backdrop-blur fill. Respect `prefers-reduced-motion` — freeze all drift/twinkle animation, keep the static layers. No new dependencies, no new `SceneState` fields, no changes to the lens shader.

**Verify:** the negative space around the lensed scene visibly shows a layered, parallaxed starfield rather than a flat fill; the scene panel reads as an instrument/HUD element, not a plain card; toggling `prefers-reduced-motion` (OS setting or devtools emulation) freezes the ambient motion with no layout shift; existing slider/panel interactions still work exactly as before; no console errors.

---

## Stage 6 — Camera controls, second mass, presets

**End state:** orbit/zoom camera, a second lensing object with weak-field superposition, and a presets strip of named saved scenes. This is where the "orbiting binary" payoff from the spec shows up.

**Scope fence:** still no language input. Presets are just saved `SceneState` snapshots — resist building a generic preset "system" beyond what's needed for 4-6 hardcoded entries.

**Prompt:**
> Add orbit/zoom camera controls to the Three.js scene (implement manually if `THREE.OrbitControls` isn't available in the environment, per the spec's note). Extend `SceneState` and the scene panel to support a second lensing object — add/remove buttons on the panel, and implement weak-field superposition of deflections for the two-body case in the shader (approximate, and label it as such in a UI tooltip or note, per the spec's honesty-about-approximation stance). Add a presets strip (per the Frontend design section: a row of thumbnailed named configs above the command-bar area) with 4-6 hardcoded presets: an Einstein ring, an orbiting binary, a black-hole shadow, and 1-2 others of your choice. Each preset is just a saved `SceneState` that populates the panel and URL on click. Presets strip should be visible on first load and tuck away after the user's first manual interaction.

**Verify:** camera orbits and zooms smoothly; a second object can be added/removed and visibly affects the lensing; each preset button produces the expected distinct visual; presets tuck away after interacting with a slider.

---

## Stage 7 — Language layer: schema, validation, and mock parser

**End state:** the command bar UI, a JSON schema for LLM output, zod validation/clamping, and a hardcoded regex/keyword parser standing in for the real LLM. This validates the entire UX and data path before any model integration risk enters the picture.

**Scope fence:** explicitly no real LLM call yet — that's Stage 8. The parser here can be dumb (keyword/regex matching "two black holes", "3 solar masses", etc.) as long as the schema, validation, and UI states it exercises are the real ones.

**Prompt:**
> Referencing the "Language input" and "Scene state & validation" sections of `gravitational-lensing-simulator-writeup.md`, build the natural-language input path end to end, using a hardcoded regex/keyword parser in place of a real LLM for now. Define a zod schema for the structured output (objects with mass/position/velocity, one or more), validate and clamp any parsed values against physically sane ranges before they reach `SceneState`, and surface (rather than silently fix) anything that got clamped or dropped. Build the command-bar UI at bottom-center (command-palette style, single line, rotating placeholder examples) per the spec's visual language. On a successful parse, animate the affected sliders to their new values (~400ms) and show a compact editable summary of the interpretation below the bar with changed values briefly highlighted. On parse failure or an out-of-range result, show an inline message under the bar (never a modal) and leave state untouched. Wire the regex parser to handle a handful of realistic phrasings (mass, count of objects, basic orbit description) — it doesn't need to be smart, it needs to exercise every UI state (success, partial, failure) correctly.

**Verify:** typing a well-formed phrase animates sliders and shows the interpretation summary; typing nonsense or an out-of-range value shows the inline error without touching current state; the zod schema rejects malformed shapes cleanly.

---

## Stage 8 — Procedural nebula & richer starfield

**End state:** the default procedural background (the one actually being gravitationally lensed — not the Stage 5 ambient chrome layer, which is decorative and untouched by this stage) gains layered, colored nebula-like cloud structure and denser, more varied stars, closer to real astrophotography (think the Orion Nebula: dense colorful gas clouds, dark dust lanes, bright stars, some with diffraction spikes) than a sparse dot-field. This is a direct response to real feedback: with too few stars, there isn't enough visual structure for the eye to register that the background is being bent, which undercuts the entire point of the renderer.

**Scope fence:** shader/background-generation changes only. No new `SceneState` fields (the `background` union stays `starfield | upload | sdss`), no changes to the lens deflection math, no changes to camera/panel/presets/language layers. Stay dependency-free — hand-rolled noise directly in GLSL, no new texture assets or npm packages for the default path. If you're reaching for an external image/texture to fake the nebula look, stop; the point is a procedural generator, matching the existing starfield's zero-dependency, fully-deterministic design (same view always shows the same sky).

**Prompt:**
> The current procedural starfield (`starfield()` in `lens.frag.glsl`, from Stage 4) is too sparse — there isn't enough background structure for the lensing distortion to read clearly, especially away from the Einstein ring itself. Enrich it with two additions, layered so stars stay on top of nebula: (1) colored nebula-like cloud structure using a hand-rolled 2D value-noise function (lattice-hash + smooth interpolation) composited through 2-4 octaves of fractal Brownian motion for cloud-like density, mapped through a small palette of nebula colors (magenta/pink emission, blue/teal reflection) blended with darker dust-lane occlusion from a second independent noise layer, all at low-to-moderate opacity so it reads as atmospheric depth without hurting contrast against the UI panels or overpowering the lensing distortion itself; (2) denser point stars with more size/brightness variety than currently, plus an occasional brighter "hero" star rendered with a simple 4-point diffraction-spike cross, similar to bright stars in real astrophotography. Keep everything fully deterministic (hash-based on angular position, same convention as the existing star placement) so screenshots and shared URLs stay reproducible. Don't touch the upload or SDSS background paths, the lens equation, or anything outside `src/render/`.

**Verify:** the default starfield background visibly shows colored nebula structure and a denser star field; lensing distortion (ring, arcs, shadow) is clearly visible against the richer background at the default zoom and at least one zoomed-in preset; still renders as a single fragment-shader pass at interactive framerates (no new textures, no extra draw calls); all existing presets, the upload/SDSS background modes, and the full test suite still pass unchanged; no console errors.

---

## Stage 9 — Real LLM integration

**End state:** the mock parser from Stage 7 is replaced by a real LLM call — WebLLM (in-browser, WebGPU) as the deployed path, with an Ollama-based local dev path documented for demo recording. Same schema, same validation, same UI — only the parser implementation changes.

**Scope fence:** don't touch the UI built in Stage 7 beyond swapping the parser implementation behind its existing interface. If you find yourself redesigning the command bar here, stop — that's scope creep from Stage 7.

**Prompt:**
> Replace the hardcoded regex parser from Stage 7 with a real LLM call, behind the same interface (same input string in, same zod-validated structured output out — no changes to the command bar UI or `SceneState` wiring). Implement WebLLM (in-browser via WebGPU) as the primary path: constrained-output prompting so the model only emits the structured JSON object matching the existing schema. Add a loading/progress state on the command bar for the model weight download on first use (size + percentage), and make sure the simulator remains fully usable via sliders and presets during that download — language input is an enhancement, not a blocker. Detect lack of WebGPU support and degrade gracefully to a quiet inline note ("language input unavailable in this browser") with sliders/presets still fully functional. Also document (in the README) how to run the language layer against local Ollama instead, for development and demo recording, per the spec's "local-only mode" option.

**Verify:** a real natural-language prompt produces correct structured output and updates the scene; the app is fully usable via sliders while weights are downloading; a browser without WebGPU shows the graceful-degradation note rather than breaking.

---

## Stage 10 — Deployment

**End state:** live on GitHub Pages, auto-deployed on push to main via the Stage 0 GitHub Actions workflow.

**Scope fence:** deployment config only — no feature work. If something breaks in production that didn't break locally, fix the deployment issue, don't "improve" unrelated code while you're in there.

**Prompt:**
> Extend the GitHub Actions workflow from Stage 0 to build and deploy this Vite project to GitHub Pages on every push to main. Handle the details that commonly break static deploys: correct `base` path config in Vite for a project-pages URL, correct MIME/headers for any WASM/shader/model-weight assets WebLLM needs, and confirming WebGPU/WebGL features work under the deployed origin (not just localhost). Update the README with the live URL and a short "what you're looking at" explainer for a first-time visitor.

**Verify:** pushing to main triggers a deploy; the live URL loads correctly with no console errors, the shader renders, and (if WebGPU is available in the visiting browser) the language input works.

---

## Stage 11 — Stretch goals (pick per session, don't batch)

Each of these is independently sized to be its own prompt — do them in any order, or skip any of them, based on time remaining. Don't combine more than one per session; they touch the shader/physics core in ways that are easier to debug in isolation.

- **Kerr metric**: rotating black holes, frame-dragging, asymmetric photon rings. Extends the physics core and shader from Stages 1-2; needs its own validation against known Kerr deflection values.
- **High-fidelity mode**: a numerically-integrated (Runge-Kutta on the geodesic ODEs) render mode as a toggle against the existing lookup-table fast mode, surfaced via the quality toggle from the Frontend design spec. Slower, used for "ground truth" screenshots.
- **Time dilation / redshift overlay**: a visual overlay (e.g. a clock or color-shift indicator) showing gravitational time dilation at a point in the scene.
- **Drag-to-reposition**: click-drag an object's marker directly on the canvas to move it, with the scene panel updating live — reinforcing that panel and render share one `SceneState`.

**Prompt template for any of these:**
> Implement [stretch goal] as described in `gravitational-lensing-simulator-writeup.md`, building on the existing physics core (`src/physics/`), shader (Stage 2), and `SceneState` (Stage 3). [Add specifics: e.g. "Validate against known Kerr metric deflection formulas with new unit tests" or "Surface this as a new option in the existing quality toggle, don't add a new UI control."] Don't modify the command bar, presets, or deployment config — this is additive to the render/physics layer only.
