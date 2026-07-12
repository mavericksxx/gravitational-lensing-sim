/**
 * Ambient space atmosphere: a parallax starfield, two nebula washes, and
 * an edge vignette, layered between the lensed WebGL canvas and the UI
 * panel. Pure decoration — no SceneState, no shader changes.
 *
 * The canvas is full-viewport and fully opaque (the lens shader always
 * writes alpha=1), so anything painted literally *behind* it would never
 * be visible. These layers sit *above* the canvas instead, using
 * mix-blend-mode: screen for the starfield and nebulae — screen adds
 * light to whatever's already composited beneath it rather than
 * occluding it, which reads the same as "depth behind the scene" without
 * needing to touch the renderer's alpha/blending at all.
 */

interface StarTileSpec {
  size: number;
  count: number;
  radiusRange: [number, number];
  coolFraction: number;
  warmFraction: number;
}

/**
 * Renders a starfield tile onto an offscreen canvas and returns it as a
 * data URL for use as a repeating CSS background-image. Each star is
 * drawn at all 9 wrapped offsets so the tile edges line up seamlessly
 * regardless of where a star falls, even right on a border.
 */
function generateStarTile(spec: StarTileSpec): string {
  const { size, count, radiusRange, coolFraction, warmFraction } = spec;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  for (let i = 0; i < count; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = radiusRange[0] + Math.random() * (radiusRange[1] - radiusRange[0]);
    const alpha = 0.5 + Math.random() * 0.5;
    const roll = Math.random();
    const color =
      roll < coolFraction ? "#c9d4ff" : roll < coolFraction + warmFraction ? "#ffd9a0" : "#ffffff";

    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  return canvas.toDataURL("image/png");
}

function decorativeDiv(className: string): HTMLDivElement {
  const div = document.createElement("div");
  div.className = className;
  div.setAttribute("aria-hidden", "true");
  return div;
}

export function mountAmbientLayer(container: HTMLElement): void {
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  const nebulaIndigo = decorativeDiv("ambient-nebula ambient-nebula--indigo");
  const nebulaViolet = decorativeDiv("ambient-nebula ambient-nebula--violet");

  const far = decorativeDiv("ambient-stars ambient-stars--far");
  const mid = decorativeDiv("ambient-stars ambient-stars--mid");
  const near = decorativeDiv("ambient-stars ambient-stars--near");

  far.style.backgroundImage = `url(${generateStarTile({ size: 400, count: 27, radiusRange: [0.7, 1.3], coolFraction: 0.7, warmFraction: 0.2 })})`;
  mid.style.backgroundImage = `url(${generateStarTile({ size: 400, count: 11, radiusRange: [1.2, 1.8], coolFraction: 0.75, warmFraction: 0.17 })})`;
  near.style.backgroundImage = `url(${generateStarTile({ size: 400, count: 4, radiusRange: [1.8, 2.8], coolFraction: 0.8, warmFraction: 0.12 })})`;

  const vignette = decorativeDiv("ambient-vignette");

  container.append(nebulaIndigo, nebulaViolet, far, mid, near, vignette);

  // Pointer parallax, in px, at maximum pointer displacement from center.
  const layers: { el: HTMLElement; strength: number }[] = [
    { el: far, strength: 2 },
    { el: mid, strength: 5 },
    { el: near, strength: 10 },
  ];

  window.addEventListener("pointermove", (event) => {
    // Re-checked per event (not cached at mount) so a live OS-level
    // toggle of the reduced-motion setting takes effect immediately.
    if (motionQuery.matches) return;
    const offsetX = event.clientX / window.innerWidth - 0.5;
    const offsetY = event.clientY / window.innerHeight - 0.5;
    for (const layer of layers) {
      layer.el.style.transform = `translate(${offsetX * layer.strength * 2}px, ${offsetY * layer.strength * 2}px)`;
    }
  });
}
