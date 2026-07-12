import { z } from "zod";
import type { LensObjectState } from "../state/sceneState";
import type { LlmClient } from "./llmClient";
import type { ParseOutcome } from "./parseOutcome";
import { ParsedSceneSchema } from "./schema";
import { buildSummary } from "./summary";
import { validateAndClamp } from "./validate";

const JSON_SCHEMA = z.toJSONSchema(ParsedSceneSchema);

const SYSTEM_PROMPT = `You turn a short description of a gravitational-lensing scene into a structured JSON object. Output *only* JSON matching this schema, no prose, no markdown fences:
${JSON.stringify(JSON_SCHEMA)}

Rules:
- "objects" has one entry per lensing mass (black hole / star) described. One object unless the text clearly describes two (e.g. "two black holes", "a binary pair").
- massSolarMasses is a positive number. Map qualitative terms: "stellar-mass" ~5, "intermediate-mass" ~1e4, "supermassive" ~1e8.
- position (x, y) is optional, roughly in -0.5..0.5; only set it if the text implies an off-center or off-axis placement. Omit it for centered/default placement.
- velocity (x, y) is optional; only set it if the text implies motion or orbiting (e.g. opposite small velocities for an orbiting pair).
- If the text gives no usable mass, still do your best to infer one rather than leaving it out — massSolarMasses is required.`;

/**
 * Turns free text into a *candidate* structured scene via a real LLM call
 * (WebLLM or Ollama, whichever `client` wraps). Everything downstream —
 * schema check, validateAndClamp, summary — is exactly the same pipeline
 * the Stage 7 mock parser used, per the "only the parser implementation
 * changes" scope fence.
 */
export async function parseSceneDescriptionWithLLM(
  text: string,
  currentObjects: LensObjectState[],
  client: LlmClient,
): Promise<ParseOutcome> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      success: false,
      error: 'Type a description first — try "a 10 solar-mass black hole".',
    };
  }

  let raw: string;
  try {
    raw = await client.chat(SYSTEM_PROMPT, trimmed, JSON_SCHEMA);
  } catch {
    return { success: false, error: "The language model failed to respond — try again." };
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    return { success: false, error: "That didn't parse into a valid scene — try rephrasing." };
  }

  const shapeResult = ParsedSceneSchema.safeParse(candidate);
  if (!shapeResult.success) {
    return { success: false, error: "That didn't parse into a valid scene — try rephrasing." };
  }

  const { objects, warnings } = validateAndClamp(shapeResult.data);
  const summary = buildSummary(objects, currentObjects);

  return { success: true, objects, warnings, summary };
}
