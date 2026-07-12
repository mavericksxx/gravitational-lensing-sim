import { AU } from "../physics/constants";

export type QualityMode = "fast" | "high-fidelity";

export interface Vec2 {
  x: number;
  y: number;
}

export interface LensObjectState {
  massSolarMasses: number;
  /**
   * Screen-relative position, as a fraction of the field of view
   * (roughly -0.5..0.5 keeps the object on screen). Deliberately not
   * stored in radians — that keeps the slider range meaningful and
   * scale-independent as mass/zoom change the field of view.
   */
  position: Vec2;
  /**
   * Screen-relative drift, in field-of-view-fractions per second. This
   * is the *initial condition*: SceneState itself never changes on its
   * own. The render loop derives the instantaneous position from
   * position + velocity * elapsedTime each frame — the same pattern
   * multi-body orbits will need later.
   */
  velocity: Vec2;
}

export interface CameraState {
  distanceObserverLensM: number;
  distanceObserverSourceM: number;
  /** Multiplier on the auto-computed field of view; >1 zooms in. */
  zoom: number;
}

/** Known SDSS cutout targets — the RA/Dec each maps to lives in src/render/backgroundLoader.ts. */
export type SdssTargetId = "whirlpool" | "andromeda" | "sombrero";
export const SDSS_TARGET_IDS: readonly SdssTargetId[] = ["whirlpool", "andromeda", "sombrero"];

/**
 * An uploaded image's actual bytes never live in SceneState — they can't
 * be serialized into a URL. The "upload" tag just records the *intent*;
 * urlSync coerces it back to starfield on decode, since there's no file
 * to restore, per the spec's "handle that gracefully" instruction.
 */
export type BackgroundSource =
  { type: "starfield" } | { type: "upload" } | { type: "sdss"; target: SdssTargetId };

export interface SceneState {
  object: LensObjectState;
  camera: CameraState;
  background: BackgroundSource;
  /**
   * "high-fidelity" (numerically-integrated geodesics) is a Stage 10
   * stretch goal and has no renderer yet — this field exists so the URL
   * schema doesn't need a breaking change once it does.
   */
  quality: QualityMode;
}

export const MASS_LOG_MIN = 0; // 10^0 = 1 solar mass
export const MASS_LOG_MAX = 9; // 10^9 solar masses
export const POSITION_RANGE = 0.5;
export const VELOCITY_RANGE = 0.05;
export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 3;

export function defaultSceneState(): SceneState {
  return {
    object: {
      massSolarMasses: 1e6,
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
    },
    camera: {
      distanceObserverLensM: 1000 * AU,
      distanceObserverSourceM: 2000 * AU,
      zoom: 1,
    },
    background: { type: "starfield" },
    quality: "fast",
  };
}

export function clampMassSolarMasses(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 10 ** MASS_LOG_MIN;
  const clampedLog = Math.min(MASS_LOG_MAX, Math.max(MASS_LOG_MIN, Math.log10(value)));
  return 10 ** clampedLog;
}

export function clampPosition(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(POSITION_RANGE, Math.max(-POSITION_RANGE, value));
}

export function clampVelocity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(VELOCITY_RANGE, Math.max(-VELOCITY_RANGE, value));
}

export function clampZoom(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}
