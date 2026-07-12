import "./style.css";
import "./ui/tokens.css";
import "./ui/panel.css";
import "./ui/ambient.css";
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
import { defaultSceneState, type BackgroundSource, type SceneState } from "./state/sceneState";
import { readSceneStateFromUrl, writeSceneStateToUrl } from "./state/urlSync";
import { mountAmbientLayer } from "./ui/ambient";
import { createScenePanel } from "./ui/scenePanel";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
if (!canvas) {
  throw new Error("Missing #scene canvas element");
}

// SceneState is the single source of truth. The panel writes to it; the
// render loop reads from it. Later stages (URL already does this today;
// presets and the language layer will too) become additional writers
// without the renderer needing to change at all.
let state: SceneState = readSceneStateFromUrl() ?? defaultSceneState();

const scene = createLensScene(canvas);

mountAmbientLayer(document.body);

function computeFieldOfViewRad(s: SceneState): number {
  const massKg = s.object.massSolarMasses * SOLAR_MASS;
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
    writeSceneStateToUrl(state);
    void syncBackground(state.background);
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

void syncBackground(state.background); // also picks up a shared SDSS link on first load

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (width === 0 || height === 0) return;
  scene.setSize(width, height);
}
window.addEventListener("resize", resize);
resize();

/**
 * SceneState.object.position/velocity are the *initial conditions* —
 * they only change when the user edits a control. The instantaneous
 * position rendered each frame is derived here from position +
 * velocity * elapsedTime, so SceneState stays a clean, URL-serializable
 * snapshot instead of something that free-runs every frame. The same
 * pattern will carry over to real orbital motion once a second mass
 * lands (Stage 6).
 */
function deriveLensAndCamera(
  s: SceneState,
  elapsedSeconds: number,
): { lens: PointMassLensConfig; camera: LensSceneCameraConfig } {
  const massKg = s.object.massSolarMasses * SOLAR_MASS;
  const { distanceObserverLensM, distanceObserverSourceM } = s.camera;
  const fieldOfViewRad = computeFieldOfViewRad(s); // auto-zoom, scaled by the user's zoom control

  const positionFovX = s.object.position.x + s.object.velocity.x * elapsedSeconds;
  const positionFovY = s.object.position.y + s.object.velocity.y * elapsedSeconds;

  return {
    lens: {
      massKg,
      angularPosition: {
        x: positionFovX * fieldOfViewRad,
        y: positionFovY * fieldOfViewRad,
      },
    },
    camera: { distanceObserverLensM, distanceObserverSourceM, fieldOfViewRad },
  };
}

const startTime = performance.now();
function frame(): void {
  const elapsedSeconds = (performance.now() - startTime) / 1000;
  const { lens, camera } = deriveLensAndCamera(state, elapsedSeconds);
  scene.update(lens, camera);
  scene.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
