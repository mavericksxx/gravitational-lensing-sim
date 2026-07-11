import "./style.css";
import "./ui/tokens.css";
import "./ui/panel.css";
import { SOLAR_MASS } from "./physics/constants";
import { einsteinRadius } from "./physics/deflection";
import {
  createLensScene,
  type LensSceneCameraConfig,
  type PointMassLensConfig,
} from "./render/lensScene";
import { defaultSceneState, type SceneState } from "./state/sceneState";
import { readSceneStateFromUrl, writeSceneStateToUrl } from "./state/urlSync";
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

createScenePanel(document.body, state, (next) => {
  state = next;
  writeSceneStateToUrl(state);
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
  const distanceLensSourceM = distanceObserverSourceM - distanceObserverLensM;
  const thetaE = einsteinRadius(
    massKg,
    distanceObserverLensM,
    distanceObserverSourceM,
    distanceLensSourceM,
  );
  const fieldOfViewRad = (thetaE * 6) / s.camera.zoom; // auto-zoom, scaled by the user's zoom control

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
