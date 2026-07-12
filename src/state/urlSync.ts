import {
  SDSS_TARGET_IDS,
  clampMassSolarMasses,
  clampPosition,
  clampVelocity,
  clampZoom,
  defaultSceneState,
  type BackgroundSource,
  type SceneState,
} from "./sceneState";

const HASH_KEY = "state";

/**
 * "upload" coerces to "starfield" here — an uploaded image's bytes never
 * make it into the URL, so restoring "upload" from a link would leave the
 * renderer with a background type and no actual image to show.
 */
function sanitizeBackground(value: unknown): BackgroundSource {
  if (typeof value !== "object" || value === null) return { type: "starfield" };
  const v = value as Record<string, unknown>;
  if (v.type === "sdss" && SDSS_TARGET_IDS.includes(v.target as (typeof SDSS_TARGET_IDS)[number])) {
    return { type: "sdss", target: v.target as (typeof SDSS_TARGET_IDS)[number] };
  }
  return { type: "starfield" };
}

/**
 * Validates and clamps an arbitrary decoded value into a SceneState,
 * falling back to defaults for anything missing or out of range. Never
 * trusts the URL — a hand-edited or stale link should degrade gracefully,
 * not throw or produce NaNs in the renderer.
 */
export function sanitizeSceneState(value: unknown): SceneState | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const object = v.object as Record<string, unknown> | undefined;
  const camera = v.camera as Record<string, unknown> | undefined;
  if (typeof object !== "object" || object === null) return null;
  if (typeof camera !== "object" || camera === null) return null;

  const position = object.position as Record<string, unknown> | undefined;
  const velocity = object.velocity as Record<string, unknown> | undefined;
  const defaults = defaultSceneState();

  const distanceObserverLensM = Number(camera.distanceObserverLensM);
  const distanceObserverSourceM = Number(camera.distanceObserverSourceM);

  return {
    object: {
      massSolarMasses: clampMassSolarMasses(Number(object.massSolarMasses)),
      position: {
        x: clampPosition(Number(position?.x)),
        y: clampPosition(Number(position?.y)),
      },
      velocity: {
        x: clampVelocity(Number(velocity?.x)),
        y: clampVelocity(Number(velocity?.y)),
      },
    },
    camera: {
      distanceObserverLensM:
        Number.isFinite(distanceObserverLensM) && distanceObserverLensM > 0
          ? distanceObserverLensM
          : defaults.camera.distanceObserverLensM,
      distanceObserverSourceM:
        Number.isFinite(distanceObserverSourceM) && distanceObserverSourceM > 0
          ? distanceObserverSourceM
          : defaults.camera.distanceObserverSourceM,
      zoom: clampZoom(Number(camera.zoom)),
    },
    background: sanitizeBackground(v.background),
    quality: v.quality === "high-fidelity" ? "high-fidelity" : "fast",
  };
}

export function readSceneStateFromUrl(): SceneState | null {
  const hash = window.location.hash.replace(/^#/, "");
  const raw = new URLSearchParams(hash).get(HASH_KEY);
  if (!raw) return null;
  try {
    return sanitizeSceneState(JSON.parse(raw));
  } catch {
    return null;
  }
}

let pendingWrite: number | null = null;

/**
 * Writes SceneState into the URL hash, debounced to one write per
 * animation frame (a slider drag fires many input events per second) and
 * using replaceState so it never spams browser history.
 */
export function writeSceneStateToUrl(state: SceneState): void {
  if (pendingWrite !== null) return;
  pendingWrite = requestAnimationFrame(() => {
    pendingWrite = null;
    const params = new URLSearchParams();
    params.set(HASH_KEY, JSON.stringify(state));
    const hash = `#${params.toString()}`;
    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", hash);
    }
  });
}
