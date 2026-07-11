# Gravitational Lensing Simulator

A physically accurate, real-time gravitational lensing renderer that runs entirely in the
browser. See [gravitational-lensing-simulator-writeup.md](gravitational-lensing-simulator-writeup.md)
for the full project spec and [implementation-plan.md](implementation-plan.md) for the staged
build plan this repo follows.

## Status

Stage 0 (project scaffolding) — no physics or rendering yet, just the build pipeline.

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
```
