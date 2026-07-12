import type { ParseOutcome, SummaryPart } from "../language/mockParser";

export interface CommandBarCallbacks {
  /** Stands in for the LLM call in Stage 8 — same shape, just async and real. */
  onSubmit: (text: string) => Promise<ParseOutcome>;
  /** Fires only on a successful parse, after the message is rendered. */
  onSuccess: (result: Extract<ParseOutcome, { success: true }>) => void;
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
 * not a chat window — no history, no avatars. See mockParser.ts for what
 * actually interprets the text (Stage 8 swaps that piece for a real LLM
 * without this component changing at all).
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

  const message = document.createElement("div");
  message.className = "command-bar__message";
  message.setAttribute("aria-live", "polite");

  container.append(bar, message);

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

  async function submit(): Promise<void> {
    const text = input.value.trim();
    if (!text) return;

    bar.classList.remove("command-bar--error", "command-bar--success");
    bar.classList.add("command-bar--loading");
    spinner.hidden = false;
    input.disabled = true;
    message.className = "command-bar__message";
    message.textContent = "";

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
  });
}
