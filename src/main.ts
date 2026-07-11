import "./style.css";
import { checkerboardBackground } from "./physics/backgrounds";
import { AU, SOLAR_MASS } from "./physics/constants";
import { einsteinRadius } from "./physics/deflection";
import {
  renderLensedImage,
  type LensCameraConfig,
  type PointMassLens,
} from "./physics/renderLensedImage";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
if (!canvas) {
  throw new Error("Missing #scene canvas element");
}

const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("2D canvas context unavailable");
}

// Stage 1 demo scene: a single point-mass lens, ray-traced on the CPU to
// validate the deflection math (see src/physics/) before porting it to a
// GLSL shader in Stage 2. Not real-time by design.
const lens: PointMassLens = {
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

function render(): void {
  const width = canvas!.width;
  const height = canvas!.height;
  if (width === 0 || height === 0) return;

  const camera: LensCameraConfig = {
    distanceObserverLensM,
    distanceObserverSourceM,
    fieldOfViewRad: thetaE * 6, // auto-zoom so the Einstein ring is always framed nicely
    width,
    height,
  };

  const background = checkerboardBackground(camera.fieldOfViewRad / 12);
  const image = renderLensedImage(lens, camera, background);
  ctx!.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
}

let renderScheduled = false;
function scheduleRender(): void {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    render();
  });
}

function resize(): void {
  canvas!.width = window.innerWidth;
  canvas!.height = window.innerHeight;
  scheduleRender();
}
window.addEventListener("resize", resize);
resize();
