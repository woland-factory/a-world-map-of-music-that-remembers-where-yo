import type { Genre } from "../types";
import type { MapRenderer } from "./renderer";

export interface SelectHandlers {
  // A completed tap on the map. genre is null when empty space was tapped.
  onSelect?: (genre: Genre | null) => void;
  // A genre likely to be tapped/hovered: begin buffering its preview.
  onWarm?: (genre: Genre) => void;
}

const TAP_MOVE = 6; // px: movement under this (and under TAP_TIME) is a tap
const TAP_TIME = 400; // ms

// Pan (drag/touch), zoom (wheel/pinch), tap-to-select, and keyboard nav.
export function attachInput(
  canvas: HTMLCanvasElement,
  renderer: MapRenderer,
  handlers: SelectHandlers = {},
): void {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;
  let tap: { x: number; y: number; t: number } | null = null;

  const local = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      tap = { x: e.clientX, y: e.clientY, t: e.timeStamp };
      // Warm the preview under the finger before the tap resolves.
      const p = local(e.clientX, e.clientY);
      const g = renderer.hitTest(p.x, p.y);
      if (g) handlers.onWarm?.(g);
    } else if (pointers.size === 2) {
      tap = null; // a second finger means pinch, not tap
      const pts = [...pointers.values()];
      pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  });

  // Hover hit-testing is O(n) over ~2,200 nodes; coalesce it to at most one
  // test per animation frame so a fast mousemove cannot spin the CPU.
  let hoverX = 0;
  let hoverY = 0;
  let hoverFrame = 0;
  const runHover = () => {
    hoverFrame = 0;
    const g = renderer.hitTest(hoverX, hoverY);
    if (g) handlers.onWarm?.(g);
  };

  canvas.addEventListener("pointermove", (e) => {
    // Hover (mouse, no active pointer): warm the preview under the cursor.
    if (pointers.size === 0) {
      if (e.pointerType === "mouse") {
        const p = local(e.clientX, e.clientY);
        hoverX = p.x;
        hoverY = p.y;
        if (!hoverFrame) hoverFrame = requestAnimationFrame(runHover);
      }
      return;
    }
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinchDist > 0) {
        const c = local((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
        renderer.zoomBy(dist / pinchDist, c.x, c.y);
      }
      pinchDist = dist;
      return;
    }

    if (dragging) {
      if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_MOVE) tap = null;
      renderer.panBy(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
    }
  });

  const endPointer = (e: PointerEvent) => {
    const wasSingle = pointers.size === 1;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (pointers.size === 0) dragging = false;

    // A short, still, single-pointer press is a tap: select what is under it.
    if (wasSingle && tap) {
      const still = Math.hypot(e.clientX - tap.x, e.clientY - tap.y) <= TAP_MOVE;
      const quick = e.timeStamp - tap.t <= TAP_TIME;
      if (still && quick) {
        const p = local(e.clientX, e.clientY);
        handlers.onSelect?.(renderer.hitTest(p.x, p.y));
      }
    }
    tap = null;
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const p = local(e.clientX, e.clientY);
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      renderer.zoomBy(factor, p.x, p.y);
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
      case "Enter":
      case " ":
        // Select the centre-most genre: aim with the pan/zoom keys above,
        // then hear and stamp it without a pointer.
        handlers.onSelect?.(renderer.nearestToCenter());
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
