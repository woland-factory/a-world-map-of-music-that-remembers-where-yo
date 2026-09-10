import type { MapRenderer } from "./renderer";

// Pan (drag/touch), zoom (wheel/pinch), and keyboard navigation.
export function attachInput(canvas: HTMLCanvasElement, renderer: MapRenderer): void {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    } else if (pointers.size === 2) {
      const pts = [...pointers.values()];
      pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinchDist > 0) {
        const rect = canvas.getBoundingClientRect();
        const mx = (pts[0].x + pts[1].x) / 2 - rect.left;
        const my = (pts[0].y + pts[1].y) / 2 - rect.top;
        renderer.zoomBy(dist / pinchDist, mx, my);
      }
      pinchDist = dist;
      return;
    }

    if (dragging) {
      renderer.panBy(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
    }
  });

  const endPointer = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (pointers.size === 0) dragging = false;
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      renderer.zoomBy(factor, e.clientX - rect.left, e.clientY - rect.top);
    },
    { passive: false },
  );

  // Keyboard: arrows pan, +/- zoom. The canvas is focusable.
  canvas.tabIndex = 0;
  canvas.addEventListener("keydown", (e) => {
    const step = 60;
    switch (e.key) {
      case "ArrowLeft":
        renderer.panBy(step, 0);
        break;
      case "ArrowRight":
        renderer.panBy(-step, 0);
        break;
      case "ArrowUp":
        renderer.panBy(0, step);
        break;
      case "ArrowDown":
        renderer.panBy(0, -step);
        break;
      case "+":
      case "=":
        renderer.zoomBy(1.15, renderer.width / 2, renderer.height / 2);
        break;
      case "-":
      case "_":
        renderer.zoomBy(1 / 1.15, renderer.width / 2, renderer.height / 2);
        break;
      default:
        return;
    }
    e.preventDefault();
  });
}

export function attachControls(
  renderer: MapRenderer,
  els: { zoomIn: HTMLElement; zoomOut: HTMLElement; reset: HTMLElement },
): void {
  els.zoomIn.addEventListener("click", () =>
    renderer.zoomBy(1.25, renderer.width / 2, renderer.height / 2),
  );
  els.zoomOut.addEventListener("click", () =>
    renderer.zoomBy(1 / 1.25, renderer.width / 2, renderer.height / 2),
  );
  els.reset.addEventListener("click", () => renderer.fit());
}
