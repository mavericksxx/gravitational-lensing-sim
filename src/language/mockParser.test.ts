import { describe, expect, it } from "vitest";
import type { LensObjectState } from "../state/sceneState";
import { parseSceneDescription } from "./mockParser";
import { ParsedSceneSchema } from "./schema";

const noCurrentObjects: LensObjectState[] = [
  { massSolarMasses: 1e6, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } },
];

describe("parseSceneDescription", () => {
  it("parses a well-formed single-object phrase", () => {
    const result = parseSceneDescription("a 10 solar-mass black hole", noCurrentObjects);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].massSolarMasses).toBeCloseTo(10, 9);
    expect(result.objects[0].position).toEqual({ x: 0, y: 0 });
    expect(result.warnings).toHaveLength(0);
  });

  it("parses two objects orbiting each other with opposing tangential velocity", () => {
    const result = parseSceneDescription(
      "two black holes orbiting each other, 3 solar masses each",
      noCurrentObjects,
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.objects).toHaveLength(2);
    expect(result.objects[0].massSolarMasses).toBeCloseTo(3, 9);
    expect(result.objects[1].massSolarMasses).toBeCloseTo(3, 9);
    expect(result.objects[0].velocity.y).toBeGreaterThan(0);
    expect(result.objects[1].velocity.y).toBeLessThan(0);
  });

  it("parses an off-axis phrase into an offset position", () => {
    const result = parseSceneDescription(
      "a supermassive lens, slightly off-axis",
      noCurrentObjects,
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.objects[0].position).not.toEqual({ x: 0, y: 0 });
  });

  it("recognizes named mass keywords", () => {
    const result = parseSceneDescription("a stellar-mass black hole", noCurrentObjects);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.objects[0].massSolarMasses).toBeCloseTo(5, 9);
  });

  it("clamps an out-of-range mass and surfaces a warning instead of silently fixing it", () => {
    const result = parseSceneDescription("a 999999999999 solar-mass black hole", noCurrentObjects);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.objects[0].massSolarMasses).toBeLessThan(999999999999);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/clamped/);
  });

  it("fails on empty input without touching state", () => {
    const result = parseSceneDescription("   ", noCurrentObjects);
    expect(result.success).toBe(false);
  });

  it("fails when no mass can be found", () => {
    const result = parseSceneDescription("something something spacetime", noCurrentObjects);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.length).toBeGreaterThan(0);
  });
});

describe("ParsedSceneSchema", () => {
  it("accepts a well-formed candidate", () => {
    const result = ParsedSceneSchema.safeParse({
      objects: [{ massSolarMasses: 5, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-finite mass", () => {
    const result = ParsedSceneSchema.safeParse({ objects: [{ massSolarMasses: Number.NaN }] });
    expect(result.success).toBe(false);
  });

  it("rejects an empty objects array", () => {
    const result = ParsedSceneSchema.safeParse({ objects: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed shape entirely", () => {
    expect(ParsedSceneSchema.safeParse(null).success).toBe(false);
    expect(ParsedSceneSchema.safeParse({ objects: "not an array" }).success).toBe(false);
    expect(ParsedSceneSchema.safeParse({ objects: [{ massSolarMasses: "5" }] }).success).toBe(
      false,
    );
  });
});
