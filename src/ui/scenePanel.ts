import { SDSS_TARGETS } from "../render/backgroundLoader";
import {
  MASS_LOG_MAX,
  MASS_LOG_MIN,
  POSITION_RANGE,
  SDSS_TARGET_IDS,
  VELOCITY_RANGE,
  ZOOM_MAX,
  ZOOM_MIN,
  clampMassSolarMasses,
  clampPosition,
  clampVelocity,
  clampZoom,
  type BackgroundSource,
  type SceneState,
  type SdssTargetId,
} from "../state/sceneState";

export interface ScenePanel {
  /** Syncs the UI to an externally-provided state without firing onChange (e.g. loading from the URL). */
  setState(state: SceneState): void;
  /** Shows a status line under the background controls (loading/error text), or clears it when null. */
  setBackgroundStatus(status: string | null): void;
}

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "-": "⁻",
};

function toSuperscript(n: number): string {
  return String(n)
    .split("")
    .map((c) => SUPERSCRIPT_DIGITS[c] ?? c)
    .join("");
}

function formatMass(massSolarMasses: number): string {
  if (massSolarMasses >= 1e4) {
    const exponent = Math.floor(Math.log10(massSolarMasses));
    const mantissa = massSolarMasses / 10 ** exponent;
    return `${mantissa.toPrecision(3)}×10${toSuperscript(exponent)}`;
  }
  // toPrecision(3) would switch to exponential notation on its own for
  // anything >= 100 (e.g. 1000 -> "1.00e+3") — pick decimals by band
  // instead so everything under 10^4 stays in plain decimal form.
  if (massSolarMasses >= 100) return massSolarMasses.toFixed(0);
  if (massSolarMasses >= 10) return massSolarMasses.toFixed(1);
  return massSolarMasses.toFixed(2);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  attrs?: Record<string, string>,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      node.setAttribute(key, value);
    }
  }
  return node;
}

function flashError(input: HTMLInputElement): void {
  input.classList.add("param-group__input--error");
  setTimeout(() => input.classList.remove("param-group__input--error"), 800);
}

/** A slider + numeric input pair operating directly in display units (position, velocity, zoom). */
function buildLinearParam(
  label: string,
  unit: string,
  min: number,
  max: number,
  decimals: number,
  get: () => number,
  set: (value: number) => void,
  clamp: (value: number) => number,
): { row: HTMLElement; refresh: () => void } {
  const group = el("div", "param-group");
  const row = el("div", "param-group__row");
  const labelEl = el("label", "text-label");
  labelEl.textContent = label;
  const valueWrap = el("div", "param-group__value-wrap");
  const input = el("input", "text-value param-group__input", {
    type: "text",
    inputmode: "decimal",
    "aria-label": `${label} (${unit})`,
  });
  const unitEl = el("span", "text-unit");
  unitEl.textContent = unit;
  valueWrap.append(input, unitEl);
  row.append(labelEl, valueWrap);

  const step = (max - min) / 100;
  const slider = el("input", "param-group__slider", {
    type: "range",
    min: String(min),
    max: String(max),
    step: String(step),
    "aria-label": `${label} (${unit})`,
  });

  group.append(row, slider);
  labelEl.htmlFor =
    input.id = `param-${label.replace(/\s+/g, "-").toLowerCase()}-${Math.random().toString(36).slice(2, 7)}`;
  slider.setAttribute("id", `${input.id}-slider`);

  function refresh(): void {
    const value = get();
    slider.value = String(value);
    input.value = value.toFixed(decimals);
  }

  slider.addEventListener("input", () => {
    set(clamp(Number(slider.value)));
    input.value = get().toFixed(decimals);
  });

  input.addEventListener("change", () => {
    const parsed = Number(input.value);
    const valid = Number.isFinite(parsed);
    const clamped = clamp(valid ? parsed : get());
    const outOfRange = !valid || clamped !== parsed;
    set(clamped);
    refresh();
    if (outOfRange) flashError(input);
  });

  refresh();
  return { row: group, refresh };
}

/** The mass slider: log-scale internally, linear display, with decade tick marks. */
function buildMassParam(
  get: () => number,
  set: (value: number) => void,
): { row: HTMLElement; refresh: () => void } {
  const group = el("div", "param-group");
  const row = el("div", "param-group__row");
  const labelEl = el("label", "text-label");
  labelEl.textContent = "Mass";
  const valueWrap = el("div", "param-group__value-wrap");
  const input = el("input", "text-value param-group__input", {
    type: "text",
    inputmode: "decimal",
    "aria-label": "Mass in solar masses",
  });
  const unitEl = el("span", "text-unit");
  unitEl.textContent = "M☉";
  valueWrap.append(input, unitEl);
  row.append(labelEl, valueWrap);

  const slider = el("input", "param-group__slider", {
    type: "range",
    min: String(MASS_LOG_MIN),
    max: String(MASS_LOG_MAX),
    step: "0.05",
    "aria-label": "Mass in solar masses",
  });

  const ticks = el("div", "param-group__ticks", { "aria-hidden": "true" });
  for (const decade of [0, 3, 6, 9]) {
    const tick = el("span", "text-unit");
    tick.textContent = decade === 0 ? "1" : `10${toSuperscript(decade)}`;
    ticks.append(tick);
  }

  group.append(row, slider, ticks);

  function refresh(): void {
    const mass = get();
    slider.value = String(Math.log10(mass));
    slider.setAttribute("aria-valuetext", `${formatMass(mass)} solar masses`);
    input.value = formatMass(mass);
  }

  slider.addEventListener("input", () => {
    const mass = clampMassSolarMasses(10 ** Number(slider.value));
    set(mass);
    slider.setAttribute("aria-valuetext", `${formatMass(mass)} solar masses`);
    input.value = formatMass(mass);
  });

  input.addEventListener("change", () => {
    const parsed = Number(input.value.replace(/×.*/u, "").trim());
    const valid = Number.isFinite(parsed) && parsed > 0;
    const clamped = clampMassSolarMasses(valid ? parsed : get());
    const outOfRange = !valid || clamped !== parsed;
    set(clamped);
    refresh();
    if (outOfRange) flashError(input);
  });

  refresh();
  return { row: group, refresh };
}

/** Background source select, plus the upload/SDSS controls it reveals. */
function buildBackgroundSection(
  get: () => BackgroundSource,
  set: (value: BackgroundSource) => void,
  onFileSelected: (file: File) => void,
): { section: HTMLElement; refresh: () => void; status: HTMLElement } {
  const section = el("div", "scene-panel__section");
  const row = el("div", "param-group__row");
  const labelEl = el("label", "text-label");
  labelEl.textContent = "Background";
  row.append(labelEl);

  const sourceSelect = el("select", "text-value bg-select", { "aria-label": "Background source" });
  for (const [value, label] of [
    ["starfield", "Starfield"],
    ["upload", "Upload image"],
    ["sdss", "SDSS cutout"],
  ] as const) {
    const option = el("option");
    option.value = value;
    option.textContent = label;
    sourceSelect.append(option);
  }

  const fileInput = el("input", "bg-file-input", {
    type: "file",
    accept: "image/*",
    "aria-label": "Upload background image",
  });
  const fileRow = el("div", "bg-sub-row");
  fileRow.append(fileInput);

  const targetSelect = el("select", "text-value bg-select", { "aria-label": "SDSS target" });
  for (const id of SDSS_TARGET_IDS) {
    const option = el("option");
    option.value = id;
    option.textContent = SDSS_TARGETS[id].label;
    targetSelect.append(option);
  }
  const targetRow = el("div", "bg-sub-row");
  targetRow.append(targetSelect);

  const status = el("span", "text-caption bg-status", { "aria-live": "polite" });

  section.append(row, sourceSelect, fileRow, targetRow, status);

  function refresh(): void {
    const bg = get();
    sourceSelect.value = bg.type;
    fileRow.hidden = bg.type !== "upload";
    targetRow.hidden = bg.type !== "sdss";
    if (bg.type === "sdss") targetSelect.value = bg.target;
  }

  sourceSelect.addEventListener("change", () => {
    const type = sourceSelect.value as BackgroundSource["type"];
    if (type === "sdss") {
      set({ type: "sdss", target: targetSelect.value as SdssTargetId });
    } else if (type === "upload") {
      set({ type: "upload" });
    } else {
      set({ type: "starfield" });
    }
    refresh();
  });

  targetSelect.addEventListener("change", () => {
    set({ type: "sdss", target: targetSelect.value as SdssTargetId });
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) onFileSelected(file);
  });

  refresh();
  return { section, refresh, status };
}

export function createScenePanel(
  container: HTMLElement,
  initialState: SceneState,
  onChange: (state: SceneState) => void,
  onBackgroundFileSelected: (file: File) => void,
): ScenePanel {
  const state: SceneState = structuredClone(initialState);

  const tab = el("button", "scene-panel-tab", {
    "aria-label": "Open scene panel",
    "aria-expanded": "false",
    type: "button",
  });
  tab.textContent = "☰";

  const panel = el("div", "scene-panel", { role: "region", "aria-label": "Scene controls" });
  panel.append(
    el("div", "scene-panel__bracket scene-panel__bracket--tl", { "aria-hidden": "true" }),
    el("div", "scene-panel__bracket scene-panel__bracket--bl", { "aria-hidden": "true" }),
  );

  const header = el("div", "scene-panel__header");
  const title = el("span", "text-panel-title");
  title.textContent = "Scene";
  const collapseBtn = el("button", "scene-panel__collapse", {
    type: "button",
    "aria-label": "Collapse scene panel",
  });
  collapseBtn.textContent = "‹";
  header.append(title, collapseBtn);
  panel.append(header);

  const body = el("div", "scene-panel__body");
  panel.append(body);

  // Object card
  const card = el("div", "object-card scene-panel__section");
  const cardHeader = el("div", "object-card__header");
  const cardName = el("span", "text-label");
  cardName.textContent = "Object 1";
  const cardBadge = el("span", "text-badge object-card__badge");
  cardBadge.textContent = "Schwarzschild";
  cardHeader.append(cardName, cardBadge);
  card.append(cardHeader);

  const massParam = buildMassParam(
    () => state.object.massSolarMasses,
    (v) => {
      state.object.massSolarMasses = v;
      onChange(structuredClone(state));
    },
  );
  const posX = buildLinearParam(
    "Position x",
    "fov",
    -POSITION_RANGE,
    POSITION_RANGE,
    3,
    () => state.object.position.x,
    (v) => {
      state.object.position.x = v;
      onChange(structuredClone(state));
    },
    clampPosition,
  );
  const posY = buildLinearParam(
    "Position y",
    "fov",
    -POSITION_RANGE,
    POSITION_RANGE,
    3,
    () => state.object.position.y,
    (v) => {
      state.object.position.y = v;
      onChange(structuredClone(state));
    },
    clampPosition,
  );
  const velX = buildLinearParam(
    "Velocity x",
    "fov/s",
    -VELOCITY_RANGE,
    VELOCITY_RANGE,
    4,
    () => state.object.velocity.x,
    (v) => {
      state.object.velocity.x = v;
      onChange(structuredClone(state));
    },
    clampVelocity,
  );
  const velY = buildLinearParam(
    "Velocity y",
    "fov/s",
    -VELOCITY_RANGE,
    VELOCITY_RANGE,
    4,
    () => state.object.velocity.y,
    (v) => {
      state.object.velocity.y = v;
      onChange(structuredClone(state));
    },
    clampVelocity,
  );
  card.append(massParam.row, posX.row, posY.row, velX.row, velY.row);
  body.append(card);

  // Global controls
  const globalSection = el("div", "scene-panel__section");
  const zoom = buildLinearParam(
    "Zoom",
    "×",
    ZOOM_MIN,
    ZOOM_MAX,
    2,
    () => state.camera.zoom,
    (v) => {
      state.camera.zoom = v;
      onChange(structuredClone(state));
    },
    clampZoom,
  );
  globalSection.append(zoom.row);
  body.append(globalSection);

  const background = buildBackgroundSection(
    () => state.background,
    (v) => {
      state.background = v;
      onChange(structuredClone(state));
    },
    onBackgroundFileSelected,
  );
  body.append(background.section);

  container.append(tab, panel);

  function setExpanded(expanded: boolean): void {
    panel.hidden = !expanded;
    tab.hidden = expanded;
    tab.setAttribute("aria-expanded", String(expanded));
  }
  setExpanded(false); // collapsed by default on first visit, per spec

  tab.addEventListener("click", () => setExpanded(true));
  collapseBtn.addEventListener("click", () => setExpanded(false));

  function refreshAll(): void {
    massParam.refresh();
    posX.refresh();
    posY.refresh();
    velX.refresh();
    velY.refresh();
    zoom.refresh();
    background.refresh();
  }

  function setState(next: SceneState): void {
    Object.assign(state, structuredClone(next));
    refreshAll();
  }

  function setBackgroundStatus(status: string | null): void {
    background.status.textContent = status ?? "";
  }

  return { setState, setBackgroundStatus };
}
