import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MapRenderer } from "../web/src/map/renderer";
import type { Atlas } from "../web/src/types";

// A tiny atlas: three genres in one region. Enough for setSelected / draw.
function atlas(): Atlas {
  return {
    version: 1,
    generated: "2026-01-01",
    source: "test",
    bounds: { minX: 0, maxX: 100, minY: 0, maxY: 100 },
    regions: [{ id: 0, label: "test" }],
    genres: [
      { id: 1, mbid: "a", name: "one", x: 10, y: 10, region: 0, neighbors: [] },
      { id: 2, mbid: "b", name: "two", x: 50, y: 50, region: 0, neighbors: [] },
      { id: 3, mbid: "c", name: "three", x: 90, y: 90, region: 0, neighbors: [] },
    ],
  };
}

// A canvas whose 2D context swallows every call, so draw() can run headless.
function fakeCanvas(): HTMLCanvasElement {
  const ctx = new Proxy(
    {},
    {
      get: () => () => undefined,
      set: () => true,
    },
  );
  return {
    getContext: () => ctx,
    width: 0,
    height: 0,
    getBoundingClientRect: () => ({ width: 400, height: 400, left: 0, top: 0 }),
  } as unknown as HTMLCanvasElement;
}

describe("MapRenderer selected-node feedback", () => {
  let raf: ReturnType<typeof vi.fn>;
  let pending: FrameRequestCallback | null;

  // rAF is async in the browser: the frame-guard depends on the callback
  // running AFTER the id is stored. Defer it here and flush() on demand so a
  // completed frame lets the next draw be scheduled.
  const flush = () => {
    const cb = pending;
    pending = null;
    cb?.(0);
  };

  beforeEach(() => {
    pending = null;
    raf = vi.fn((cb: FrameRequestCallback) => {
      pending = cb;
      return 1;
    });
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("window", { devicePixelRatio: 1 });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("starts with nothing selected", () => {
    const r = new MapRenderer(fakeCanvas(), atlas(), new Set());
    expect(r.selected).toBeNull();
  });

  it("setSelected(genre) marks the node and requests a draw", () => {
    const a = atlas();
    const r = new MapRenderer(fakeCanvas(), a, new Set());
    flush();
    raf.mockClear();
    r.setSelected(a.genres[1]);
    expect(r.selected).toBe(2);
    expect(raf).toHaveBeenCalledTimes(1);
    flush(); // runs draw() -> drawSelectedRing without throwing
  });

  it("setSelected(null) clears the node and requests a draw", () => {
    const a = atlas();
    const r = new MapRenderer(fakeCanvas(), a, new Set());
    r.setSelected(a.genres[1]);
    flush();
    raf.mockClear();
    r.setSelected(null);
    expect(r.selected).toBeNull();
    expect(raf).toHaveBeenCalledTimes(1);
  });

  it("re-selecting the same node is a no-op (no extra draw)", () => {
    const a = atlas();
    const r = new MapRenderer(fakeCanvas(), a, new Set());
    r.setSelected(a.genres[0]);
    flush();
    raf.mockClear();
    r.setSelected(a.genres[0]);
    expect(raf).not.toHaveBeenCalled();
  });

  it("nearestToCenter returns the genre closest to the viewport centre", () => {
    const a = atlas();
    const r = new MapRenderer(fakeCanvas(), a, new Set());
    r.resize();
    r.fit();
    // The middle genre (50,50) sits at the atlas centre, so it wins.
    expect(r.nearestToCenter()?.id).toBe(2);
  });
});
