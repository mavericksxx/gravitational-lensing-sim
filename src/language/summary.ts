import { formatMass } from "../ui/scenePanel";
import type { LensObjectState } from "../state/sceneState";

/** A summary is a sequence of plain text and highlighted (changed) value spans. */
export type SummaryPart = { text: string; changed: boolean };

/**
 * Builds the compact "N objects · M M☉ each" summary shown under the
 * command bar, marking which parts changed from the previous state so the
 * UI can highlight them. Shared by every parser backend (mock, WebLLM,
 * Ollama) since it only depends on the final validated objects, not on how
 * they were produced.
 */
export function buildSummary(
  objects: LensObjectState[],
  previous: LensObjectState[],
): SummaryPart[] {
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
