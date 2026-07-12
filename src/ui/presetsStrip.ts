import type { Preset } from "../state/presets";
import type { SceneState } from "../state/sceneState";

export interface PresetsStrip {
  /**
   * Call on a genuine user interaction elsewhere (slider edit, camera
   * drag) to tuck the strip away. Selecting a preset itself does not
   * call this — per spec, picking a preset isn't a sign the user is done
   * exploring presets.
   */
  notifyInteraction(): void;
}

/**
 * A row of named preset buttons, visible on first load, that tucks away
 * after the user's first real interaction with the scene and stays
 * restored (no re-tucking) once manually reopened via the tab.
 */
export function mountPresetsStrip(
  container: HTMLElement,
  presets: Preset[],
  onSelect: (state: SceneState) => void,
): PresetsStrip {
  const strip = document.createElement("div");
  strip.className = "presets-strip";
  strip.setAttribute("role", "group");
  strip.setAttribute("aria-label", "Scene presets");

  const tab = document.createElement("button");
  tab.type = "button";
  tab.className = "presets-tab";
  tab.textContent = "Presets";
  tab.hidden = true;

  for (const preset of presets) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset-button";
    button.textContent = preset.name;
    button.addEventListener("click", () => onSelect(structuredClone(preset.state)));
    strip.append(button);
  }

  container.append(strip, tab);

  let tucked = false;
  let restoredManually = false;

  function tuck(): void {
    if (tucked || restoredManually) return;
    tucked = true;
    strip.classList.add("presets-strip--tucked");
    tab.hidden = false;
  }

  function restore(): void {
    tucked = false;
    restoredManually = true;
    strip.classList.remove("presets-strip--tucked");
    tab.hidden = true;
  }

  tab.addEventListener("click", restore);

  function notifyInteraction(): void {
    tuck();
  }

  return { notifyInteraction };
}
