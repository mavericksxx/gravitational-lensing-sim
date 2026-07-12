import type { LlmLoadProgress } from "../language/llmClient";
import type { ParseOutcome } from "../language/parseOutcome";
import type { SummaryPart } from "../language/summary";

export interface CommandBarCallbacks {
  /** Runs one parse. Whatever backs this (mock, WebLLM, Ollama) is invisible to the bar. */
  onSubmit: (text: string) => Promise<ParseOutcome>;
  /** Fires only on a successful parse, after the message is rendered. */
  onSuccess: (result: Extract<ParseOutcome, { success: true }>) => void;
  /**
   * Lazily prepares the language backend before its first real use (e.g.
   * WebLLM's model-weight download). Called at most once — the bar caches
   * the in-flight/settled promise itself. Omit if the backend needs no
   * setup (e.g. the mock parser, or Ollama's already-resident model).
   */
  ensureReady?: (onProgress: (report: LlmLoadProgress) => void) => Promise<void>;
  /**
   * If set, language input can't work at all in this browser (no WebGPU)
   * — the bar shows this text as a quiet, permanent note and the input
   * stays disabled. Sliders and presets are untouched; this only affects
   * the command bar.
   */
  unavailableReason?: string;
}

const PLACEHOLDER_EXAMPLES = [
  "a 10 solar-mass black hole",
  "two black holes orbiting each other, 3 M☉ each",
  "a supermassive lens, slightly off-axis",
  "an Einstein ring",
];

const PLACEHOLDER_ROTATION_MS = 6000;
const SUCCESS_FLASH_MS = 600;

function renderSummary(container: HTMLElement, parts: SummaryPart[]): void {
  container.textContent = "";
  for (const part of parts) {
    if (!part.changed) {
      container.append(document.createTextNode(part.text));
      continue;
    }
    const span = document.createElement("span");
    span.className = "changed-value";
    span.textContent = part.text;
    container.append(span);
  }
}

/**
 * The natural-language input: a single-line command-palette-style bar,
 * not a chat window — no history, no avatars. See mockParser.ts /
 * llmParser.ts for what actually interprets the text; this component
 * only knows about the CommandBarCallbacks interface, so swapping parser
 * backends never touches it.
 */
export function mountCommandBar(container: HTMLElement, callbacks: CommandBarCallbacks): void {
  const bar = document.createElement("div");
  bar.className = "command-bar";

  const prompt = document.createElement("span");
  prompt.className = "command-bar__prompt";
  prompt.textContent = "›";
  prompt.setAttribute("aria-hidden", "true");

  const input = document.createElement("input");
  input.type = "text";
  input.className = "command-bar__input";
  input.setAttribute("aria-label", "Describe a scene in plain English");
  input.placeholder = PLACEHOLDER_EXAMPLES[0];

  const spinner = document.createElement("div");
  spinner.className = "command-bar__spinner";
  spinner.hidden = true;
  spinner.setAttribute("aria-hidden", "true");

  bar.append(prompt, input, spinner);

  const progress = document.createElement("div");
  progress.className = "command-bar__progress";
  progress.hidden = true;
  const progressFill = document.createElement("div");
  progressFill.className = "command-bar__progress-fill";
  progress.append(progressFill);

  const message = document.createElement("div");
  message.className = "command-bar__message";
  message.setAttribute("aria-live", "polite");

  container.append(bar, progress, message);

  if (callbacks.unavailableReason) {
    input.disabled = true;
    input.placeholder = callbacks.unavailableReason;
    bar.classList.add("command-bar--unavailable");
    message.className = "command-bar__message command-bar__message--note";
    message.textContent = callbacks.unavailableReason;
    return; // No point wiring submit/focus/ready handling — input is inert.
  }

  let placeholderIndex = 0;
  setInterval(() => {
    if (document.activeElement === input) return; // pause while focused, per spec
    placeholderIndex = (placeholderIndex + 1) % PLACEHOLDER_EXAMPLES.length;
    input.placeholder = PLACEHOLDER_EXAMPLES[placeholderIndex];
  }, PLACEHOLDER_ROTATION_MS);

  function setMessage(className: string, build: (el: HTMLElement) => void): void {
    message.className = `command-bar__message ${className}`;
    message.textContent = "";
    build(message);
  }

  // Lazily downloads/compiles the model on first real use. Cached so a
  // second submit (or a focus that follows a submit) doesn't re-trigger
  // it; reset to null on failure so the user can retry by submitting
  // again. Doesn't block sliders/presets — those never touch this module.
  let readyPromise: Promise<void> | null = null;
  function ensureLanguageReady(): Promise<void> {
    if (!callbacks.ensureReady) return Promise.resolve();
    if (readyPromise) return readyPromise;

    progress.hidden = false;
    progressFill.style.width = "0%";
    readyPromise = callbacks
      .ensureReady((report) => {
        progressFill.style.width = `${Math.round(report.progress * 100)}%`;
        setMessage("command-bar__message--progress", (el) => {
          el.textContent = report.text;
        });
      })
      .then(() => {
        progress.hidden = true;
        if (message.classList.contains("command-bar__message--progress")) {
          message.className = "command-bar__message";
          message.textContent = "";
        }
      })
      .catch((error: unknown) => {
        readyPromise = null;
        progress.hidden = true;
        setMessage("command-bar__message--error", (el) => {
          el.textContent = "Couldn't load the language model — try again.";
        });
        throw error;
      });
    return readyPromise;
  }

  async function submit(): Promise<void> {
    const text = input.value.trim();
    if (!text) return;

    bar.classList.remove("command-bar--error", "command-bar--success");
    bar.classList.add("command-bar--loading");
    spinner.hidden = false;
    input.disabled = true;
    message.className = "command-bar__message";
    message.textContent = "";

    try {
      await ensureLanguageReady();
    } catch {
      bar.classList.remove("command-bar--loading");
      spinner.hidden = true;
      input.disabled = false;
      return; // ensureLanguageReady already rendered the error message.
    }

    const result = await callbacks.onSubmit(text);

    bar.classList.remove("command-bar--loading");
    spinner.hidden = true;
    input.disabled = false;
    input.focus();

    if (!result.success) {
      bar.classList.add("command-bar--error");
      setMessage("command-bar__message--error", (el) => {
        const icon = document.createTextNode("⚠ ");
        el.append(icon, document.createTextNode(result.error));
      });
      return;
    }

    bar.classList.add("command-bar--success");
    setTimeout(() => bar.classList.remove("command-bar--success"), SUCCESS_FLASH_MS);

    callbacks.onSuccess(result);

    setMessage("command-bar__message--summary", (el) => renderSummary(el, result.summary));
    if (result.warnings.length > 0) {
      const warningLine = document.createElement("div");
      warningLine.className = "command-bar__warning";
      warningLine.textContent = result.warnings.join(" · ");
      message.append(warningLine);
    }
    input.value = "";
  }

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void submit();
    }
    if (event.key === "Escape") {
      input.value = "";
      message.className = "command-bar__message";
      message.textContent = "";
      input.blur();
    }
  });

  input.addEventListener("focus", () => {
    message.className = "command-bar__message";
    message.textContent = "";
    bar.classList.remove("command-bar--error", "command-bar--success");
    void ensureLanguageReady().catch(() => {
      // Prefetch failure is surfaced by ensureLanguageReady itself; a
      // later submit() will retry.
    });
  });
}
