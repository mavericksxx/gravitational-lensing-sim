import { describe, expect, it, vi } from "vitest";
import { mountCommandBar } from "./commandBar";

describe("mountCommandBar", () => {
  it("shows a quiet disabled note when language input is unavailable", () => {
    const container = document.createElement("div");
    mountCommandBar(container, {
      onSubmit: vi.fn(),
      onSuccess: vi.fn(),
      unavailableReason: "Language input unavailable in this browser — no WebGPU.",
    });

    const input = container.querySelector<HTMLInputElement>(".command-bar__input");
    expect(input?.disabled).toBe(true);
    expect(container.textContent).toContain("Language input unavailable in this browser");
    expect(container.querySelector(".command-bar--unavailable")).not.toBeNull();
  });

  it("does not call onSubmit or ensureReady when unavailable", () => {
    const container = document.createElement("div");
    const onSubmit = vi.fn();
    const ensureReady = vi.fn();
    mountCommandBar(container, {
      onSubmit,
      onSuccess: vi.fn(),
      ensureReady,
      unavailableReason: "no WebGPU",
    });

    const input = container.querySelector<HTMLInputElement>(".command-bar__input");
    input?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    expect(ensureReady).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls ensureReady and reports progress before the first submit", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    let resolveReady: () => void = () => {};
    const ensureReady = vi.fn(
      (onProgress: (report: { progress: number; text: string }) => void) =>
        new Promise<void>((resolve) => {
          onProgress({ progress: 0.5, text: "Fetching param cache: 50% completed." });
          resolveReady = resolve;
        }),
    );
    const onSubmit = vi.fn().mockResolvedValue({
      success: true,
      objects: [],
      warnings: [],
      summary: [{ text: "1 object", changed: true }],
    });

    mountCommandBar(container, { onSubmit, onSuccess: vi.fn(), ensureReady });

    const input = container.querySelector<HTMLInputElement>(".command-bar__input")!;
    input.value = "a 10 solar-mass black hole";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    // Let the microtask queue advance so ensureReady's progress callback fires.
    await Promise.resolve();
    await Promise.resolve();
    expect(ensureReady).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("50% completed");
    expect(onSubmit).not.toHaveBeenCalled();

    resolveReady();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(onSubmit).toHaveBeenCalledWith("a 10 solar-mass black hole");

    container.remove();
  });
});
