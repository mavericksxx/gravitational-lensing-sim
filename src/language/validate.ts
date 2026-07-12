import {
  MAX_OBJECTS,
  clampMassSolarMasses,
  clampPosition,
  clampVelocity,
  type LensObjectState,
} from "../state/sceneState";
import { formatMass } from "../ui/scenePanel";
import type { ParsedScene } from "./schema";

export type ParseResult =
  | { success: true; objects: LensObjectState[]; warnings: string[] }
  | { success: false; error: string };

// clampMassSolarMasses round-trips through log10/10**, which reintroduces
// float noise even for values already well within range (500 -> the same
// 500, but not always *exactly* the same bit pattern) — a strict !==
// comparison flagged those as "clamped" and warned the user for no
// reason. This tolerance absorbs that noise without hiding a real clamp.
function differsMeaningfully(a: number, b: number): boolean {
  return Math.abs(a - b) > Math.abs(b) * 1e-9 + 1e-9;
}

/**
 * Clamps a schema-valid candidate scene into physically sane ranges,
 * collecting a warning for anything that had to be clamped or dropped
 * rather than silently rewriting it — the user should always be able to
 * see when the interpretation isn't exactly what they typed.
 */
export function validateAndClamp(candidate: ParsedScene): {
  objects: LensObjectState[];
  warnings: string[];
} {
  const warnings: string[] = [];
  let rawObjects = candidate.objects;

  if (rawObjects.length > MAX_OBJECTS) {
    warnings.push(`only ${MAX_OBJECTS} objects are supported — the rest were dropped`);
    rawObjects = rawObjects.slice(0, MAX_OBJECTS);
  }

  const objects = rawObjects.map((raw, index) => {
    const label = rawObjects.length > 1 ? `object ${index + 1}` : "mass";

    const mass = clampMassSolarMasses(raw.massSolarMasses);
    if (differsMeaningfully(mass, raw.massSolarMasses)) {
      warnings.push(`${label} clamped to ${formatMass(mass)} M☉`);
    }

    const rawPosition = raw.position ?? { x: 0, y: 0 };
    const position = { x: clampPosition(rawPosition.x), y: clampPosition(rawPosition.y) };
    if (
      differsMeaningfully(position.x, rawPosition.x) ||
      differsMeaningfully(position.y, rawPosition.y)
    ) {
      warnings.push(
        `${rawObjects.length > 1 ? `object ${index + 1}` : "position"} clamped to stay in view`,
      );
    }

    const rawVelocity = raw.velocity ?? { x: 0, y: 0 };
    const velocity = { x: clampVelocity(rawVelocity.x), y: clampVelocity(rawVelocity.y) };
    if (
      differsMeaningfully(velocity.x, rawVelocity.x) ||
      differsMeaningfully(velocity.y, rawVelocity.y)
    ) {
      warnings.push(`${rawObjects.length > 1 ? `object ${index + 1}` : "velocity"} clamped`);
    }

    return { massSolarMasses: mass, position, velocity };
  });

  return { objects, warnings };
}
