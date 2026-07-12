import { describe, expect, it } from "vitest";
import type { LensObjectState } from "../state/sceneState";
import type { LlmClient } from "./llmClient";
import { parseSceneDescriptionWithLLM } from "./llmParser";

const noCurrentObjects: LensObjectState[] = [
  { massSolarMasses: 1e6, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } },
];

/** A fake LlmClient that returns a fixed response, standing in for a real model call. */
function fakeClient(reply: string | (() => string)): LlmClient {
  return {
    async ensureReady() {},
    async chat() {
      return typeof reply === "function" ? reply() : reply;
    },
  };
}

function failingClient(): LlmClient {
  return {
    async ensureReady() {},
    async chat() {
      throw new Error("network down");
    },
  };
}

describe("parseSceneDescriptionWithLLM", () => {
  it("parses a well-formed model response", async () => {
    const client = fakeClient(
      JSON.stringify({ objects: [{ massSolarMasses: 10, position: { x: 0, y: 0 } }] }),
    );
    const result = await parseSceneDescriptionWithLLM(
      "a 10 solar-mass black hole",
      noCurrentObjects,
      client,
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].massSolarMasses).toBeCloseTo(10, 9);
    expect(result.warnings).toHaveLength(0);
  });

  it("parses a two-object response with velocities", async () => {
    const client = fakeClient(
      JSON.stringify({
        objects: [
          { massSolarMasses: 3, position: { x: -0.2, y: 0 }, velocity: { x: 0, y: 0.015 } },
          { massSolarMasses: 3, position: { x: 0.2, y: 0 }, velocity: { x: 0, y: -0.015 } },
        ],
      }),
    );
    const result = await parseSceneDescriptionWithLLM(
      "two black holes orbiting each other, 3 solar masses each",
      noCurrentObjects,
      client,
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.objects).toHaveLength(2);
    expect(result.objects[0].velocity.y).toBeGreaterThan(0);
    expect(result.objects[1].velocity.y).toBeLessThan(0);
  });

  it("clamps an out-of-range mass and surfaces a warning instead of silently fixing it", async () => {
    const client = fakeClient(JSON.stringify({ objects: [{ massSolarMasses: 999999999999 }] }));
    const result = await parseSceneDescriptionWithLLM(
      "an absurdly massive black hole",
      noCurrentObjects,
      client,
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.objects[0].massSolarMasses).toBeLessThan(999999999999);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/clamped/);
  });

  it("fails on empty input without calling the model", async () => {
    let called = false;
    const client = fakeClient(() => {
      called = true;
      return "{}";
    });
    const result = await parseSceneDescriptionWithLLM("   ", noCurrentObjects, client);
    expect(result.success).toBe(false);
    expect(called).toBe(false);
  });

  it("fails gracefully on malformed JSON from the model", async () => {
    const client = fakeClient("not json at all");
    const result = await parseSceneDescriptionWithLLM("a black hole", noCurrentObjects, client);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.length).toBeGreaterThan(0);
  });

  it("fails gracefully on JSON that doesn't match the schema", async () => {
    const client = fakeClient(JSON.stringify({ objects: [{ massSolarMasses: "not a number" }] }));
    const result = await parseSceneDescriptionWithLLM("a black hole", noCurrentObjects, client);
    expect(result.success).toBe(false);
  });

  it("fails gracefully when the client throws", async () => {
    const result = await parseSceneDescriptionWithLLM(
      "a black hole",
      noCurrentObjects,
      failingClient(),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.length).toBeGreaterThan(0);
  });
});
