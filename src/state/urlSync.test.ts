import { describe, expect, it } from "vitest";
import { MASS_LOG_MAX, MASS_LOG_MIN, defaultLensObject, defaultSceneState } from "./sceneState";
import { sanitizeSceneState } from "./urlSync";

describe("sanitizeSceneState", () => {
  it("round-trips a well-formed state unchanged", () => {
    const state = defaultSceneState();
    state.objects[0].massSolarMasses = 42;
    state.objects[0].position = { x: 0.2, y: -0.1 };
    const result = sanitizeSceneState(JSON.parse(JSON.stringify(state)))!;
    // mass passes through the log-scale clamp, which reintroduces float noise
    expect(result.objects[0].massSolarMasses).toBeCloseTo(42, 9);
    const resultWithExactMass = {
      ...result,
      objects: [{ ...result.objects[0], massSolarMasses: 42 }],
    };
    expect(resultWithExactMass).toEqual(state);
  });

  it("clamps an out-of-range mass into the slider's log range", () => {
    const state = defaultSceneState();
    state.objects[0].massSolarMasses = 1e20;
    const result = sanitizeSceneState(state)!;
    expect(result.objects[0].massSolarMasses).toBeCloseTo(10 ** MASS_LOG_MAX, 0);
  });

  it("clamps a non-positive mass up to the slider minimum", () => {
    const state = defaultSceneState();
    state.objects[0].massSolarMasses = -5;
    const result = sanitizeSceneState(state)!;
    expect(result.objects[0].massSolarMasses).toBeCloseTo(10 ** MASS_LOG_MIN, 0);
  });

  it("falls back to default camera distances when missing", () => {
    const state = defaultSceneState() as unknown as Record<string, unknown>;
    (state.camera as Record<string, unknown>).distanceObserverLensM = undefined;
    const result = sanitizeSceneState(state)!;
    expect(result.camera.distanceObserverLensM).toBe(
      defaultSceneState().camera.distanceObserverLensM,
    );
  });

  it("preserves two objects", () => {
    const state = defaultSceneState();
    state.objects.push(defaultLensObject());
    state.objects[1].massSolarMasses = 500;
    state.objects[1].position = { x: 0.3, y: 0 };
    const result = sanitizeSceneState(JSON.parse(JSON.stringify(state)))!;
    expect(result.objects).toHaveLength(2);
    expect(result.objects[1].massSolarMasses).toBeCloseTo(500, 6);
  });

  it("caps more than the maximum number of objects", () => {
    const state = defaultSceneState();
    state.objects.push(defaultLensObject(), defaultLensObject());
    const result = sanitizeSceneState(JSON.parse(JSON.stringify(state)))!;
    expect(result.objects).toHaveLength(2);
  });

  it("drops individually malformed objects but keeps valid ones", () => {
    const state = defaultSceneState() as unknown as Record<string, unknown>;
    state.objects = [defaultLensObject(), { massSolarMasses: "not-a-number" }];
    const result = sanitizeSceneState(state)!;
    expect(result.objects).toHaveLength(1);
  });

  it("rejects an old single-object link and falls back to null", () => {
    const legacy = {
      object: defaultLensObject(),
      camera: defaultSceneState().camera,
      background: { type: "starfield" },
      quality: "fast",
    };
    expect(sanitizeSceneState(legacy)).toBeNull();
  });

  it("clamps camera pan into range", () => {
    const state = defaultSceneState() as unknown as Record<string, unknown>;
    (state.camera as Record<string, unknown>).pan = { x: 999, y: -999 };
    const result = sanitizeSceneState(state)!;
    expect(Math.abs(result.camera.pan.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.camera.pan.y)).toBeLessThanOrEqual(1);
  });

  it("rejects garbage input entirely", () => {
    expect(sanitizeSceneState(null)).toBeNull();
    expect(sanitizeSceneState("not an object")).toBeNull();
    expect(sanitizeSceneState({ objects: [] })).toBeNull();
    expect(sanitizeSceneState(42)).toBeNull();
  });

  it("defaults an invalid quality value to fast", () => {
    const state = defaultSceneState() as unknown as Record<string, unknown>;
    state.quality = "nonsense";
    expect(sanitizeSceneState(state)!.quality).toBe("fast");
  });

  it("preserves a valid sdss background target", () => {
    const state = defaultSceneState();
    state.background = { type: "sdss", target: "andromeda" };
    const result = sanitizeSceneState(JSON.parse(JSON.stringify(state)))!;
    expect(result.background).toEqual({ type: "sdss", target: "andromeda" });
  });

  it("rejects an unknown sdss target and falls back to starfield", () => {
    const state = defaultSceneState() as unknown as Record<string, unknown>;
    state.background = { type: "sdss", target: "not-a-real-target" };
    expect(sanitizeSceneState(state)!.background).toEqual({ type: "starfield" });
  });

  it("coerces an upload background to starfield, since the file can't be restored from a URL", () => {
    const state = defaultSceneState() as unknown as Record<string, unknown>;
    state.background = { type: "upload" };
    expect(sanitizeSceneState(state)!.background).toEqual({ type: "starfield" });
  });

  it("defaults a missing background to starfield", () => {
    const state = defaultSceneState() as unknown as Record<string, unknown>;
    delete state.background;
    expect(sanitizeSceneState(state)!.background).toEqual({ type: "starfield" });
  });
});
