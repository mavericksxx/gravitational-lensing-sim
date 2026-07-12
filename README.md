# Gravitational Lensing Simulator

A physically accurate, real-time gravitational lensing renderer that runs entirely in the
browser. See [gravitational-lensing-simulator-writeup.md](gravitational-lensing-simulator-writeup.md)
for the full project spec and [implementation-plan.md](implementation-plan.md) for the staged
build plan this repo follows.

## Status

Through Stage 9 of [implementation-plan.md](implementation-plan.md): physics core, shader
renderer, scene state/URL sync, backgrounds, camera + multi-object presets, and natural-language
scene steering backed by a real in-browser LLM (WebLLM). Deployment (Stage 10) is next.

## Setup

Requires Node 22+.

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check and produce a production build in dist/
npm test         # run the test suite once
npm run lint      # lint with eslint
npm run format    # format with prettier
```

## Project structure

```
src/
  physics/   pure math: deflection formulas, geodesics, lensing calculations
  render/    Three.js / WebGL / shader code
  ui/        DOM UI: panels, controls, command bar
  state/     SceneState model and serialization
  language/  natural-language scene steering: schema, validation, parser backends
```

## Language input (natural-language scene steering)

The command bar at the bottom of the screen turns a sentence like "two black holes orbiting
each other, 3 solar masses each" into scene state. It's a thin layer on top of everything
else: an LLM produces structured JSON (`{ objects: [{ massSolarMasses, position?, velocity? }] }`),
which is validated against a [zod schema](src/language/schema.ts) and clamped to physically
sane ranges ([src/language/validate.ts](src/language/validate.ts)) before it ever reaches the
renderer. Sliders, presets, and shareable URLs all keep working with the language layer
disabled or absent — it's an input method, not a dependency.

Two interchangeable backends implement the [`LlmClient`](src/language/llmClient.ts) interface:

- **WebLLM (default, what's deployed)** — runs a small open-weight model
  (`SmolLM2-360M-Instruct`, 4-bit quantized, ~376MB) entirely client-side via WebGPU. No server,
  no API key, works offline after the first load. The weights download lazily — only once you
  focus or submit the command bar, never on page load — and the command bar shows a progress
  indicator (size + percentage) while that happens; sliders and presets stay fully usable the
  whole time. Browsers without WebGPU (check at
  [caniuse.com/webgpu](https://caniuse.com/webgpu)) get a quiet "language input unavailable in
  this browser" note in the command bar instead of a broken feature — everything else keeps
  working.
- **Ollama (local dev / demo recording)** — talks to a locally running
  [Ollama](https://ollama.com) server instead of downloading anything into the browser. Faster
  and more capable for recording demo footage, but never used in the public deployment (per the
  spec's "local-only mode": the deployed site stays a zero-backend, zero-credential static
  build).

To use the Ollama backend locally:

```bash
ollama pull llama3.2     # or any instruction-tuned model you prefer
ollama serve              # usually already running as a background service
VITE_LLM_BACKEND=ollama npm run dev
```

`src/language/ollamaClient.ts` posts to `http://localhost:11434/api/chat` with a JSON-schema
`format` field (Ollama's structured-output support) and no other config. Set a different model
by editing `DEFAULT_MODEL` in that file, or extend `createOllamaClient()`'s parameters if you
want it configurable at runtime.
