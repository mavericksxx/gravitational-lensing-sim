/** A single progress update while a client is getting ready for its first call (e.g. model weight download). */
export interface LlmLoadProgress {
  /** 0..1 */
  progress: number;
  /** Human-readable status, e.g. "Fetching param cache[52/219]: 210MB fetched. 46% completed." */
  text: string;
}

/**
 * Backend-agnostic interface for turning a system+user prompt pair into a
 * JSON string that (should) match `jsonSchema`. `llmParser.ts` is written
 * entirely against this interface, so swapping WebLLM for Ollama — or
 * anything else — never touches the prompt/schema/validation pipeline.
 */
export interface LlmClient {
  /**
   * Prepares the client for its first `chat()` call (e.g. downloading and
   * compiling WebLLM model weights). Safe to call more than once — only
   * the first call does real work. Backends with no setup step (Ollama:
   * just an HTTP call) resolve immediately without reporting progress.
   */
  ensureReady(onProgress: (report: LlmLoadProgress) => void): Promise<void>;

  /**
   * Runs one constrained-JSON completion. `jsonSchema` is a JSON Schema
   * object (see zod's `toJSONSchema`); backends that support grammar-
   * constrained decoding use it to guarantee shape-valid output, backends
   * that don't fall back to prompting the model to follow it and let the
   * caller's own schema validation catch the rest.
   */
  chat(systemPrompt: string, userPrompt: string, jsonSchema: object): Promise<string>;
}
