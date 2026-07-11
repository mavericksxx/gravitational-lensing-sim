import type { BackgroundSampler } from "./backgrounds";
import { einsteinRadius, shadowAngularRadius } from "./deflection";
import { pointLensMap, type AngularPosition } from "./lensMap";

export interface PointMassLens {
  massKg: number;
  /** Angular position of the lens on the sky, radians, relative to the optical axis. */
  angularPosition: AngularPosition;
}

export interface LensCameraConfig {
  distanceObserverLensM: number;
  distanceObserverSourceM: number;
  /** Full angular width of the rendered view, radians. */
  fieldOfViewRad: number;
  width: number;
  height: number;
}

/**
 * A rendered RGBA image, deliberately not a DOM `ImageData` — this keeps
 * src/physics free of any browser dependency, so it stays usable as a
 * fallback renderer (e.g. off the main thread, or without a canvas) and
 * stays trivially testable outside a browser environment.
 */
export interface RenderedImage {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
}

const SHADOW_COLOR = { r: 0, g: 0, b: 0 };

/**
 * Backward ray-traces a single point-mass lens against a background
 * source: for each pixel, maps the image-plane angle to a source-plane
 * angle via the point lens equation and samples the background there.
 *
 * Not optimized for real-time use — this is the CPU reference
 * implementation the GLSL shader (Stage 2) gets checked against, and the
 * fallback path for browsers without WebGL.
 */
export function renderLensedImage(
  lens: PointMassLens,
  camera: LensCameraConfig,
  backgroundSampler: BackgroundSampler,
): RenderedImage {
  const { width, height, fieldOfViewRad, distanceObserverLensM, distanceObserverSourceM } = camera;
  const distanceLensSourceM = distanceObserverSourceM - distanceObserverLensM;

  const thetaE = einsteinRadius(
    lens.massKg,
    distanceObserverLensM,
    distanceObserverSourceM,
    distanceLensSourceM,
  );
  const shadowRadius = shadowAngularRadius(lens.massKg, distanceObserverLensM);

  const data = new Uint8ClampedArray(width * height * 4);
  const radPerPixel = fieldOfViewRad / width;

  for (let py = 0; py < height; py++) {
    const thetaY = (py - height / 2 + 0.5) * radPerPixel;
    for (let px = 0; px < width; px++) {
      const thetaX = (px - width / 2 + 0.5) * radPerPixel;

      const source = pointLensMap(
        { x: thetaX, y: thetaY },
        lens.angularPosition,
        thetaE,
        shadowRadius,
      );
      const color = source === null ? SHADOW_COLOR : backgroundSampler(source.x, source.y);

      const i = (py * width + px) * 4;
      data[i] = color.r;
      data[i + 1] = color.g;
      data[i + 2] = color.b;
      data[i + 3] = 255;
    }
  }

  return { width, height, data };
}
