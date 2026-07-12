import type { LlmClient } from "./llmClient";

const DEFAULT_MODEL = "llama3.2";

/**
 * Dev/demo-only backend: talks to a local Ollama server instead of
 * downloading WebLLM weights into the browser. Not used in the deployed
 * build — see README for how to opt into this via VITE_LLM_BACKEND. No
 * setup step (no weights to fetch through the browser), so `ensureReady`
 * resolves immediately.
 */
export function createOllamaClient(
  baseUrl = "http://localhost:11434",
  model = DEFAULT_MODEL,
): LlmClient {
  return {
    async ensureReady() {
      // Nothing to do — Ollama already has the model loaded locally.
    },

    async chat(systemPrompt, userPrompt, jsonSchema) {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          format: jsonSchema,
          stream: false,
          options: { temperature: 0 },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as { message?: { content?: string } };
      return data.message?.content ?? "";
    },
  };
}
