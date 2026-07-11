import "./style.css";
import { AU, SOLAR_MASS } from "./physics/constants";
import { einsteinRadius } from "./physics/deflection";
import { createLensScene, type PointMassLensConfig } from "./render/lensScene";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
if (!canvas) {
  throw new Error("Missing #scene canvas element");
}

// Same demo scene as Stage 1's CPU renderer (src/physics/renderLensedImage),
// so the two are directly visually comparable: a single point-mass lens,
// now ray-traced in real time on the GPU instead of a few seconds per
// frame on the CPU. Hardcoded — sliders/UI land in Stage 3.
const lens: PointMassLensConfig = {
  massKg: SOLAR_MASS * 1e6,
  angularPosition: { x: 0, y: 0 },
};
const distanceObserverLensM = 1000 * AU;
const distanceObserverSourceM = 2000 * AU;
const distanceLensSourceM = distanceObserverSourceM - distanceObserverLensM;
const thetaE = einsteinRadius(
  lens.massKg,
  distanceObserverLensM,
  distanceObserverSourceM,
  distanceLensSourceM,
);

const scene = createLensScene(canvas, lens, {
  distanceObserverLensM,
  distanceObserverSourceM,
  fieldOfViewRad: thetaE * 6, // auto-zoom so the Einstein ring is always framed nicely
});

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (width === 0 || height === 0) return;
  scene.setSize(width, height);
}
window.addEventListener("resize", resize);
resize();

function frame(): void {
  scene.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
