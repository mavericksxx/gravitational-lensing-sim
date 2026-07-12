import "./style.css";
import "./ui/tokens.css";
import "./ui/panel.css";
import "./ui/ambient.css";
import "./ui/presetsStrip.css";
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
import { SOLAR_MASS } from "./physics/constants";
import { einsteinRadius } from "./physics/deflection";
import { PRESETS } from "./state/presets";
import {
  clampPan,
  clampZoom,
  defaultSceneState,
  type BackgroundSource,
  type SceneState,
} from "./state/sceneState";
import { readSceneStateFromUrl, writeSceneStateToUrl } from "./state/urlSync";
import { mountAmbientLayer } from "./ui/ambient";
import { attachCameraControls } from "./ui/cameraControls";
import { mountPresetsStrip } from "./ui/presetsStrip";
import { createScenePanel } from "./ui/scenePanel";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
if (!canvas) {
  throw new Error("Missing #scene canvas element");
}

// SceneState is the single source of truth. The panel, presets, and
// camera drag/zoom all write to it; the render loop reads from it.
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

const panel = createScenePanel(
  document.body,
  state,
  (next) => {
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
// (a slider edit or a camera drag), per spec.
const presetsStrip = mountPresetsStrip(document.body, PRESETS, (next) => {
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
    state.camera.pan = { x: clampPan(pan.x), y: clampPan(pan.y) };
    writeSceneStateToUrl(() => state);
    // No panel.setState() here, unlike onZoomChange below: pan has no
    // panel control to go stale (it's drag-only), and this fires on
    // every pointermove during a drag, so skipping the rebuild matters.
  },
  onZoomChange: (zoom) => {
    state.camera.zoom = clampZoom(zoom);
    writeSceneStateToUrl(() => state);
    // Camera controls mutate `state` directly, bypassing the panel's own
    // change path — without this, the zoom slider silently goes stale
    // after a wheel-zoom (it has no way to know state changed elsewhere).
    panel.setState(state);
  },
  onInteraction: () => presetsStrip.notifyInteraction(),
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
  const elapsedSeconds = (performance.now() - startTime) / 1000;
  const { lenses, camera } = deriveLensesAndCamera(state, elapsedSeconds);
  scene.update(lenses, camera);
  scene.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
