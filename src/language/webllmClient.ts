import type { MLCEngine } from "@mlc-ai/web-llm";
import type { LlmClient, LlmLoadProgress } from "./llmClient";

/**
 * SmolLM2-360M-Instruct, 4-bit quantized: ~376MB of weights, small enough
 * for a first-load download to be tolerable over a normal connection while
 * still following simple JSON-shape instructions reliably. Grammar-
 * constrained decoding (see chat() below) does most of the heavy lifting
 * for correctness — it makes the *shape* valid regardless of model size,
 * so a larger/smarter model would mainly buy better content accuracy on
 * ambiguous phrasing, not schema compliance.
 */
const MODEL_ID = "SmolLM2-360M-Instruct-q4f16_1-MLC";

/**
 * WebLLM-backed client: in-browser inference via WebGPU, no server, no
 * API key. The engine (and its multi-hundred-MB weights) is only created
 * on the first `ensureReady()` call, not at module load — visiting the
 * app should never trigger a download before the user has shown any
 * intent to use language input.
 */
export function createWebLlmClient(): LlmClient {
  let engine: MLCEngine | null = null;
  let loading: Promise<MLCEngine> | null = null;

  async function getEngine(onProgress: (report: LlmLoadProgress) => void): Promise<MLCEngine> {
    if (engine) return engine;
    if (!loading) {
      loading = import("@mlc-ai/web-llm").then(({ CreateMLCEngine }) =>
        CreateMLCEngine(MODEL_ID, {
          initProgressCallback: (report) =>
            onProgress({ progress: report.progress, text: report.text }),
        }),
      );
    }
    engine = await loading;
    return engine;
  }

  return {
    async ensureReady(onProgress) {
      await getEngine(onProgress);
    },

    async chat(systemPrompt, userPrompt, jsonSchema) {
      const activeEngine = await getEngine(() => {});
      const response = await activeEngine.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object", schema: JSON.stringify(jsonSchema) },
        temperature: 0,
      });
      return response.choices[0]?.message.content ?? "";
    },
  };
}
