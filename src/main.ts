import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
if (!canvas) {
  throw new Error("Missing #scene canvas element");
}

const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("2D canvas context unavailable");
}

function resize(): void {
  canvas!.width = window.innerWidth;
  canvas!.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

// Placeholder render loop, proving the build pipeline and animation frame
// loop work end to end. Replaced by the real WebGL renderer in Stage 2.
function frame(time: number): void {
  const t = time * 0.0002;
  const w = canvas!.width;
  const h = canvas!.height;

  const gradient = ctx!.createRadialGradient(
    w / 2 + Math.cos(t) * w * 0.2,
    h / 2 + Math.sin(t) * h * 0.2,
    0,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.7,
  );
  gradient.addColorStop(0, "#1a1a3a");
  gradient.addColorStop(1, "#050508");

  ctx!.fillStyle = gradient;
  ctx!.fillRect(0, 0, w, h);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
