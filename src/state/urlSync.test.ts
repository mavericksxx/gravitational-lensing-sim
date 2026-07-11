import { describe, expect, it } from "vitest";
import { MASS_LOG_MAX, MASS_LOG_MIN, defaultSceneState } from "./sceneState";
import { sanitizeSceneState } from "./urlSync";

describe("sanitizeSceneState", () => {
  it("round-trips a well-formed state unchanged", () => {
    const state = defaultSceneState();
    state.object.massSolarMasses = 42;
    state.object.position = { x: 0.2, y: -0.1 };
    const result = sanitizeSceneState(JSON.parse(JSON.stringify(state)))!;
    // mass passes through the log-scale clamp, which reintroduces float noise
    expect(result.object.massSolarMasses).toBeCloseTo(42, 9);
    expect({ ...result, object: { ...result.object, massSolarMasses: 42 } }).toEqual(state);
  });

  it("clamps an out-of-range mass into the slider's log range", () => {
    const state = defaultSceneState();
    (state.object as { massSolarMasses: number }).massSolarMasses = 1e20;
    const result = sanitizeSceneState(state)!;
    expect(result.object.massSolarMasses).toBeCloseTo(10 ** MASS_LOG_MAX, 0);
  });

  it("clamps a non-positive mass up to the slider minimum", () => {
    const state = defaultSceneState();
    (state.object as { massSolarMasses: number }).massSolarMasses = -5;
    const result = sanitizeSceneState(state)!;
    expect(result.object.massSolarMasses).toBeCloseTo(10 ** MASS_LOG_MIN, 0);
  });

  it("falls back to default camera distances when missing", () => {
    const state = defaultSceneState() as unknown as Record<string, unknown>;
    (state.camera as Record<string, unknown>).distanceObserverLensM = undefined;
    const result = sanitizeSceneState(state)!;
    expect(result.camera.distanceObserverLensM).toBe(
      defaultSceneState().camera.distanceObserverLensM,
    );
  });

  it("rejects garbage input entirely", () => {
    expect(sanitizeSceneState(null)).toBeNull();
    expect(sanitizeSceneState("not an object")).toBeNull();
    expect(sanitizeSceneState({ object: {} })).toBeNull();
    expect(sanitizeSceneState(42)).toBeNull();
  });

  it("defaults an invalid quality value to fast", () => {
    const state = defaultSceneState() as unknown as Record<string, unknown>;
    state.quality = "nonsense";
    expect(sanitizeSceneState(state)!.quality).toBe("fast");
  });
});
