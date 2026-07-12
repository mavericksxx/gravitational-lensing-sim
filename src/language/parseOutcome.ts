import type { LensObjectState } from "../state/sceneState";
import type { SummaryPart } from "./summary";

/** The result shape every parser backend (mock, WebLLM, Ollama) returns. */
export type ParseOutcome =
  | { success: true; objects: LensObjectState[]; warnings: string[]; summary: SummaryPart[] }
  | { success: false; error: string };
