import type { LensObjectState } from "../state/sceneState";
import { formatMass } from "../ui/scenePanel";
import { ParsedSceneSchema, type ParsedObject, type ParsedScene } from "./schema";
import { validateAndClamp } from "./validate";

export type ParseOutcome =
  | { success: true; objects: LensObjectState[]; warnings: string[]; summary: SummaryPart[] }
  | { success: false; error: string };

/** A summary is a sequence of plain text and highlighted (changed) value spans. */
export type SummaryPart = { text: string; changed: boolean };

const MASS_KEYWORDS: Record<string, number> = {
  supermassive: 1e8,
  "intermediate-mass": 1e4,
  "intermediate mass": 1e4,
  "stellar-mass": 5,
  "stellar mass": 5,
};

const ORBIT_PATTERN = /\borbit/i;
const OFF_AXIS_PATTERN = /off[\s-]?axis|offset|off[\s-]?center/i;
const PAIR_PATTERN = /\btwo\b|\bbinary\b|\bpair\b/i;

function extractMassSolarMasses(text: string): number | null {
  // Explicit number + unit, e.g. "10 solar-mass", "3 M☉", "5e6 solar masses".
  const explicit = text.match(
    /(\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*(?:solar[\s-]?mass(?:es)?|m☉|msun)/i,
  );
  if (explicit) {
    const value = Number(explicit[1]);
    if (Number.isFinite(value) && value > 0) return value;
  }

  const lower = text.toLowerCase();
  for (const [keyword, value] of Object.entries(MASS_KEYWORDS)) {
    if (lower.includes(keyword)) return value;
  }

  return null;
}

function extractObjectCount(text: string): 1 | 2 {
  return PAIR_PATTERN.test(text) ? 2 : 1;
}

/**
 * Turns free text into a *candidate* structured scene — this stands in
 * for an LLM call (Stage 8 swaps this function out; everything
 * downstream of it, the schema check and validateAndClamp, stays the
 * same). Deliberately simple keyword/regex matching, not an attempt at
 * real language understanding.
 */
function extractCandidateScene(text: string): ParsedScene | null {
  const mass = extractMassSolarMasses(text);
  if (mass === null) return null;

  const count = extractObjectCount(text);
  const isOrbiting = ORBIT_PATTERN.test(text);
  const isOffAxis = OFF_AXIS_PATTERN.test(text);

  let objects: ParsedObject[];
  if (count === 2) {
    objects = [
      {
        massSolarMasses: mass,
        position: { x: -0.2, y: 0 },
        velocity: isOrbiting ? { x: 0, y: 0.015 } : { x: 0, y: 0 },
      },
      {
        massSolarMasses: mass,
        position: { x: 0.2, y: 0 },
        velocity: isOrbiting ? { x: 0, y: -0.015 } : { x: 0, y: 0 },
      },
    ];
  } else {
    objects = [
      {
        massSolarMasses: mass,
        position: isOffAxis ? { x: 0.3, y: 0.15 } : { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
      },
    ];
  }

  return { objects };
}

function buildSummary(objects: LensObjectState[], previous: LensObjectState[]): SummaryPart[] {
  const parts: SummaryPart[] = [];
  const countChanged = objects.length !== previous.length;

  parts.push({
    text: objects.length === 1 ? "1 object" : `${objects.length} objects`,
    changed: countChanged,
  });

  const masses = objects.map((o) => formatMass(o.massSolarMasses));
  const allSameMass = new Set(masses).size === 1;
  const massChanged =
    countChanged || objects.some((o, i) => o.massSolarMasses !== previous[i]?.massSolarMasses);

  parts.push({ text: " · ", changed: false });
  if (allSameMass) {
    parts.push({ text: `${masses[0]} M☉ each`, changed: massChanged });
  } else {
    parts.push({ text: `${masses.join(", ")} M☉`, changed: massChanged });
  }

  return parts;
}

export function parseSceneDescription(
  text: string,
  currentObjects: LensObjectState[],
): ParseOutcome {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      success: false,
      error: 'Type a description first — try "a 10 solar-mass black hole".',
    };
  }

  const candidate = extractCandidateScene(trimmed);
  if (!candidate) {
    return {
      success: false,
      error: 'Couldn\'t find a mass — try including one, e.g. "a 10 solar-mass black hole".',
    };
  }

  const shapeResult = ParsedSceneSchema.safeParse(candidate);
  if (!shapeResult.success) {
    return { success: false, error: "That didn't parse into a valid scene — try rephrasing." };
  }

  const { objects, warnings } = validateAndClamp(shapeResult.data);
  const summary = buildSummary(objects, currentObjects);

  return { success: true, objects, warnings, summary };
}
