import "./style.css";
import "./ui/tokens.css";
import "./ui/panel.css";
import "./ui/ambient.css";
import "./ui/presetsStrip.css";
import "./ui/commandBar.css";
import {
  buildSdssCutoutUrl,
  loadFileAsTexture,
  loadImageAsTexture,
} from "./render/backgroundLoader";
import {
  createLensScene,
  type LensSceneCameraConfig,
  type PointMassLensConfig,
} from "./render/lensScene";
import { createOllamaClient } from "./language/ollamaClient";
import { createWebLlmClient } from "./language/webllmClient";
import { isWebGPUSupported } from "./language/webgpu";
import { parseSceneDescriptionWithLLM } from "./language/llmParser";
import { SOLAR_MASS } from "./physics/constants";
import { einsteinRadius } from "./physics/deflection";
import { PRESETS } from "./state/presets";
import {
  clampPan,
  clampZoom,
  defaultSceneState,
  type BackgroundSource,
  type LensObjectState,
  type SceneState,
} from "./state/sceneState";
import { readSceneStateFromUrl, writeSceneStateToUrl } from "./state/urlSync";
import { mountAmbientLayer } from "./ui/ambient";
import { attachCameraControls } from "./ui/cameraControls";
import { mountCommandBar } from "./ui/commandBar";
import { mountPresetsStrip } from "./ui/presetsStrip";
import { createScenePanel } from "./ui/scenePanel";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
if (!canvas) {
  throw new Error("Missing #scene canvas element");
}

// SceneState is the single source of truth. The panel, presets, camera
// drag/zoom, and now the language layer all write to it; the render
// loop reads from it.
let state: SceneState = readSceneStateFromUrl() ?? defaultSceneState();

const scene = createLensScene(canvas);

mountAmbientLayer(document.body);

// Auto-zoom framing follows the first object's mass. With two objects
// present, the second doesn't influence the field of view — simplest to
// reason about, and the zoom control/wheel is always available to widen
// the view if the second object needs more room.
function computeFieldOfViewRad(s: SceneState): number {
  const massKg = s.objects[0].massSolarMasses * SOLAR_MASS;
  const { distanceObserverLensM, distanceObserverSourceM } = s.camera;
  const thetaE = einsteinRadius(
    massKg,
    distanceObserverLensM,
    distanceObserverSourceM,
    distanceObserverSourceM - distanceObserverLensM,
  );
  return (thetaE * 6) / s.camera.zoom;
}

// Background loading is async (file read / network fetch) and reacts to
// state.background changes rather than running every frame. "upload" is
// the odd one out: its actual bytes never live in SceneState (see
// sceneState.ts), so it's driven by a separate file-selected callback
// instead of this key comparison.
let lastBackgroundKey = "";

function backgroundKey(bg: BackgroundSource): string {
  return JSON.stringify(bg);
}

async function syncBackground(bg: BackgroundSource): Promise<void> {
  const key = backgroundKey(bg);
  if (key === lastBackgroundKey) return;
  lastBackgroundKey = key;

  if (bg.type === "starfield") {
    panel.setBackgroundStatus(null);
    scene.setBackground({ mode: "starfield" });
    return;
  }

  if (bg.type === "upload") {
    panel.setBackgroundStatus("Choose an image file to upload.");
    return; // the actual texture load happens in onBackgroundFileSelected
  }

  panel.setBackgroundStatus(`Loading ${bg.target} cutout from SDSS…`);
  try {
    const texture = await loadImageAsTexture(buildSdssCutoutUrl(bg.target));
    scene.setBackground({ mode: "texture", texture, scaleRad: computeFieldOfViewRad(state) });
    panel.setBackgroundStatus(null);
  } catch {
    scene.setBackground({ mode: "starfield" });
    panel.setBackgroundStatus("Couldn't reach SDSS — showing starfield instead.");
  }
}

// Slider-animation tween: when the language layer successfully parses a
// scene, the affected objects interpolate to their new values over
// ~400ms instead of snapping — "the render following the sentence" is
// the whole thesis of the language-steering feature. Only tweens when
// the object count is unchanged (there's no natural in-between shape for
// 1 object turning into 2), and any direct user interaction (a slider
// edit, a camera drag, a preset click) cancels an in-progress tween
// outright, since manual control should always win.
interface ObjectTween {
  from: LensObjectState[];
  to: LensObjectState[];
  startTime: number;
}
const TWEEN_DURATION_MS = 400;
let activeTween: ObjectTween | null = null;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function logLerp(a: number, b: number, t: number): number {
  return Math.exp(lerp(Math.log(a), Math.log(b), t));
}
// Close approximation of the design system's --ease-out
// (cubic-bezier(0.22, 1, 0.36, 1)) — a standard easeOutCubic, cheap to
// evaluate per frame without a full bezier solver.
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function applyParsedObjects(newObjects: LensObjectState[]): void {
  if (state.objects.length !== newObjects.length) {
    activeTween = null;
    state = { ...state, objects: newObjects };
    panel.setState(state);
    writeSceneStateToUrl(() => state);
    return;
  }
  activeTween = {
    from: structuredClone(state.objects),
    to: structuredClone(newObjects),
    startTime: performance.now(),
  };
}

function updateTween(): void {
  if (!activeTween) return;
  const rawT = Math.min(1, (performance.now() - activeTween.startTime) / TWEEN_DURATION_MS);
  const t = easeOutCubic(rawT);

  state.objects = activeTween.to.map((to, i) => {
    const from = activeTween!.from[i];
    return {
      massSolarMasses: logLerp(from.massSolarMasses, to.massSolarMasses, t),
      position: {
        x: lerp(from.position.x, to.position.x, t),
        y: lerp(from.position.y, to.position.y, t),
      },
      velocity: {
        x: lerp(from.velocity.x, to.velocity.x, t),
        y: lerp(from.velocity.y, to.velocity.y, t),
      },
    };
  });
  panel.setState(state);

  if (rawT >= 1) {
    state.objects = activeTween.to;
    panel.setState(state);
    writeSceneStateToUrl(() => state);
    activeTween = null;
  }
}

const panel = createScenePanel(
  document.body,
  state,
  (next) => {
    activeTween = null; // direct panel edits always win over an in-progress tween
    state = next;
    writeSceneStateToUrl(() => state);
    void syncBackground(state.background);
    presetsStrip.notifyInteraction();
  },
  (file) => {
    panel.setBackgroundStatus(`Loading ${file.name}…`);
    loadFileAsTexture(file)
      .then((texture) => {
        scene.setBackground({ mode: "texture", texture, scaleRad: computeFieldOfViewRad(state) });
        panel.setBackgroundStatus(null);
      })
      .catch(() => {
        panel.setBackgroundStatus(`Couldn't load ${file.name} — showing starfield instead.`);
        scene.setBackground({ mode: "starfield" });
      });
  },
);

// Selecting a preset is not "interaction" for tuck-away purposes — the
// strip only tucks once the user starts genuinely exploring on their own
// (a slider edit, a camera drag, or a command-bar submit), per spec.
const presetsStrip = mountPresetsStrip(document.body, PRESETS, (next) => {
  activeTween = null;
  state = next;
  panel.setState(state);
  writeSceneStateToUrl(() => state);
  void syncBackground(state.background);
});

void syncBackground(state.background); // also picks up a shared SDSS link on first load

attachCameraControls(canvas, {
  getPanRad: () => state.camera.pan,
  getZoom: () => state.camera.zoom,
  getFieldOfViewRad: () => computeFieldOfViewRad(state),
  onPanChange: (pan) => {
    activeTween = null;
    state.camera.pan = { x: clampPan(pan.x), y: clampPan(pan.y) };
    writeSceneStateToUrl(() => state);
    // No panel.setState() here, unlike onZoomChange below: pan has no
    // panel control to go stale (it's drag-only), and this fires on
    // every pointermove during a drag, so skipping the rebuild matters.
  },
  onZoomChange: (zoom) => {
    activeTween = null;
    state.camera.zoom = clampZoom(zoom);
    writeSceneStateToUrl(() => state);
    // Camera controls mutate `state` directly, bypassing the panel's own
    // change path — without this, the zoom slider silently goes stale
    // after a wheel-zoom (it has no way to know state changed elsewhere).
    panel.setState(state);
  },
  onInteraction: () => presetsStrip.notifyInteraction(),
});

// Real LLM backend selection: WebLLM (in-browser, WebGPU) is the
// deployed default; set VITE_LLM_BACKEND=ollama for local dev/demo
// recording against a local Ollama server instead (see README). Either
// way, main.ts only ever talks to the LlmClient interface — the mock
// parser from Stage 7 is no longer wired in, but stays in the codebase
// (and its tests) as a fast, deterministic reference for the schema/
// validation pipeline.
const llmBackend = import.meta.env.VITE_LLM_BACKEND === "ollama" ? "ollama" : "webllm";
const webGpuSupported = isWebGPUSupported();
const languageUnavailable = llmBackend === "webllm" && !webGpuSupported;
const llmClient = languageUnavailable
  ? null
  : llmBackend === "ollama"
    ? createOllamaClient()
    : createWebLlmClient();

mountCommandBar(document.body, {
  onSubmit: (text) => {
    if (!llmClient) {
      return Promise.resolve({
        success: false,
        error: "Language input unavailable in this browser.",
      });
    }
    return parseSceneDescriptionWithLLM(text, state.objects, llmClient);
  },
  onSuccess: (result) => {
    applyParsedObjects(result.objects);
    presetsStrip.notifyInteraction();
  },
  ensureReady: llmClient ? (onProgress) => llmClient.ensureReady(onProgress) : undefined,
  unavailableReason: languageUnavailable
    ? "Language input unavailable in this browser — no WebGPU. Sliders and presets still work."
    : undefined,
});

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (width === 0 || height === 0) return;
  scene.setSize(width, height);
}
window.addEventListener("resize", resize);
resize();

/**
 * Each object's position/velocity are the *initial conditions* — they
 * only change when the user edits a control. The instantaneous position
 * rendered each frame is derived here from position + velocity *
 * elapsedTime, so SceneState stays a clean, URL-serializable snapshot
 * instead of something that free-runs every frame. With two objects,
 * this is also how the "orbiting binary" preset works: each object
 * drifts independently at constant velocity — a straight-line
 * approximation of an orbit, not real two-body gravity between the
 * lenses (see the shader's own comment on weak-field superposition).
 */
function deriveLensesAndCamera(
  s: SceneState,
  elapsedSeconds: number,
): { lenses: PointMassLensConfig[]; camera: LensSceneCameraConfig } {
  const fieldOfViewRad = computeFieldOfViewRad(s); // auto-zoom, scaled by the user's zoom control
  const { distanceObserverLensM, distanceObserverSourceM } = s.camera;

  const lenses = s.objects.map((object) => {
    const positionFovX = object.position.x + object.velocity.x * elapsedSeconds;
    const positionFovY = object.position.y + object.velocity.y * elapsedSeconds;
    return {
      massKg: object.massSolarMasses * SOLAR_MASS,
      angularPosition: {
        x: positionFovX * fieldOfViewRad,
        y: positionFovY * fieldOfViewRad,
      },
    };
  });

  return {
    lenses,
    camera: {
      distanceObserverLensM,
      distanceObserverSourceM,
      fieldOfViewRad,
      panRad: s.camera.pan,
    },
  };
}

const startTime = performance.now();
function frame(): void {
  updateTween();
  const elapsedSeconds = (performance.now() - startTime) / 1000;
  const { lenses, camera } = deriveLensesAndCamera(state, elapsedSeconds);
  scene.update(lenses, camera);
  scene.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
