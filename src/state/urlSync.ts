import {
  MAX_OBJECTS,
  SDSS_TARGET_IDS,
  clampMassSolarMasses,
  clampPan,
  clampPosition,
  clampVelocity,
  clampZoom,
  defaultSceneState,
  type BackgroundSource,
  type LensObjectState,
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

function sanitizeLensObject(value: unknown): LensObjectState | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const position = v.position as Record<string, unknown> | undefined;
  const velocity = v.velocity as Record<string, unknown> | undefined;
  if (!Number.isFinite(Number(v.massSolarMasses))) return null;

  return {
    massSolarMasses: clampMassSolarMasses(Number(v.massSolarMasses)),
    position: {
      x: clampPosition(Number(position?.x)),
      y: clampPosition(Number(position?.y)),
    },
    velocity: {
      x: clampVelocity(Number(velocity?.x)),
      y: clampVelocity(Number(velocity?.y)),
    },
  };
}

/**
 * Validates and clamps an arbitrary decoded value into a SceneState,
 * falling back to defaults for anything missing or out of range. Never
 * trusts the URL — a hand-edited or stale link should degrade gracefully,
 * not throw or produce NaNs in the renderer.
 *
 * Old links from before the second-object stage used a singular
 * `object` field rather than `objects`; those no longer match this
 * shape and fall back to a fresh default scene, same as any other
 * malformed input — no explicit migration, consistent with how any
 * other out-of-date shape is handled here.
 */
export function sanitizeSceneState(value: unknown): SceneState | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const camera = v.camera as Record<string, unknown> | undefined;
  if (typeof camera !== "object" || camera === null) return null;
  if (!Array.isArray(v.objects) || v.objects.length === 0) return null;

  const objects = v.objects
    .slice(0, MAX_OBJECTS)
    .map(sanitizeLensObject)
    .filter((o): o is LensObjectState => o !== null);
  if (objects.length === 0) return null;

  const defaults = defaultSceneState();
  const pan = camera.pan as Record<string, unknown> | undefined;

  const distanceObserverLensM = Number(camera.distanceObserverLensM);
  const distanceObserverSourceM = Number(camera.distanceObserverSourceM);

  return {
    objects,
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
      pan: {
        x: clampPan(Number(pan?.x)),
        y: clampPan(Number(pan?.y)),
      },
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
 *
 * Takes a getter rather than a state snapshot: if a second call arrives
 * before the pending frame fires, it must return early (per the debounce
 * guard below) without losing that update — reading getState() only when
 * the frame actually executes ensures the pending write always reflects
 * whatever is current *then*, not whatever was current when the first of
 * possibly several calls happened to schedule it.
 */
export function writeSceneStateToUrl(getState: () => SceneState): void {
  if (pendingWrite !== null) return;
  pendingWrite = requestAnimationFrame(() => {
    pendingWrite = null;
    const params = new URLSearchParams();
    params.set(HASH_KEY, JSON.stringify(getState()));
    const hash = `#${params.toString()}`;
    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", hash);
    }
  });
}
