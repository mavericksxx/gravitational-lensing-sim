export interface CameraControlsCallbacks {
  getPanRad: () => { x: number; y: number };
  getZoom: () => number;
  /** Current field of view (radians) — needed to convert a pixel drag distance into a pan angle. */
  getFieldOfViewRad: () => number;
  onPanChange: (pan: { x: number; y: number }) => void;
  onZoomChange: (zoom: number) => void;
  /** Fires on any drag or wheel interaction, so presets can tuck away. */
  onInteraction: () => void;
}

const ZOOM_WHEEL_FACTOR = 1.1;

/**
 * Drag-to-pan and wheel-to-zoom on the canvas. This is the "orbit/zoom
 * camera controls" from the spec, reinterpreted for this renderer: it's
 * a 2D angular sky-position ray-tracer with a fixed observer, not a
 * movable 3D viewpoint, so there's no orbit path to fly — pan (where
 * you're looking) and zoom (how wide the field of view is) are the
 * camera controls that actually mean something here.
 */
export function attachCameraControls(
  canvas: HTMLCanvasElement,
  callbacks: CameraControlsCallbacks,
): void {
  let dragging = false;
  let lastClientX = 0;
  let lastClientY = 0;

  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    lastClientX = event.clientX;
    lastClientY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;

    const dxPixels = event.clientX - lastClientX;
    const dyPixels = event.clientY - lastClientY;
    lastClientX = event.clientX;
    lastClientY = event.clientY;

    const radPerPixel = callbacks.getFieldOfViewRad() / canvas.width;
    const pan = callbacks.getPanRad();
    // Dragging right should reveal what's to the left — the view center
    // moves opposite to the drag, the usual "grab the canvas" feel.
    callbacks.onPanChange({
      x: pan.x - dxPixels * radPerPixel,
      y: pan.y + dyPixels * radPerPixel,
    });
    callbacks.onInteraction();
  });

  function stopDragging(): void {
    dragging = false;
  }
  window.addEventListener("pointerup", stopDragging);
  window.addEventListener("pointercancel", stopDragging);

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? ZOOM_WHEEL_FACTOR : 1 / ZOOM_WHEEL_FACTOR;
      callbacks.onZoomChange(callbacks.getZoom() * factor);
      callbacks.onInteraction();
    },
    { passive: false },
  );
}
