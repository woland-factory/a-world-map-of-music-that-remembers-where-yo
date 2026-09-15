import { describe, it, expect } from "vitest";
import {
  fitTransform,
  posterCountLine,
  posterDateLine,
  POSTER_WIDTH,
  POSTER_HEIGHT,
} from "../web/src/poster/poster";

const rect = { x: 60, y: 170, w: 960, h: 950 };

function center(bounds: { minX: number; maxX: number; minY: number; maxY: number }) {
  const t = fitTransform(bounds, rect);
  return {
    t,
    cx: ((bounds.minX + bounds.maxX) / 2) * t.scale + t.dx,
    cy: ((bounds.minY + bounds.maxY) / 2) * t.scale + t.dy,
  };
}

describe("fitTransform", () => {
  it("fits wide bounds by width, centered, aspect preserved", () => {
    const bounds = { minX: -100, maxX: 100, minY: -10, maxY: 10 };
    const { t, cx, cy } = center(bounds);
    expect(t.scale).toBeCloseTo(960 / 200, 10);
    expect(cx).toBeCloseTo(60 + 960 / 2, 10);
    expect(cy).toBeCloseTo(170 + 950 / 2, 10);
    // The long axis spans the rect exactly; the short axis stays inside.
    expect((bounds.maxX - bounds.minX) * t.scale).toBeCloseTo(960, 10);
    expect((bounds.maxY - bounds.minY) * t.scale).toBeLessThan(950);
  });

  it("fits tall bounds by height, centered", () => {
    const bounds = { minX: 0, maxX: 10, minY: 0, maxY: 1000 };
    const { t, cx, cy } = center(bounds);
    expect(t.scale).toBeCloseTo(950 / 1000, 10);
    expect(cx).toBeCloseTo(60 + 960 / 2, 10);
    expect(cy).toBeCloseTo(170 + 950 / 2, 10);
  });

  it("handles degenerate bounds without dividing by zero", () => {
    // Zero width: scale from height alone.
    const flat = fitTransform({ minX: 5, maxX: 5, minY: 0, maxY: 100 }, rect);
    expect(flat.scale).toBeCloseTo(950 / 100, 10);
    expect(Number.isFinite(flat.dx)).toBe(true);
    // Zero height: scale from width alone.
    const thin = fitTransform({ minX: 0, maxX: 100, minY: 7, maxY: 7 }, rect);
    expect(thin.scale).toBeCloseTo(960 / 100, 10);
    // A single point lands at the rect center with scale 1.
    const point = center({ minX: 3, maxX: 3, minY: 4, maxY: 4 });
    expect(point.t.scale).toBe(1);
    expect(point.cx).toBeCloseTo(60 + 960 / 2, 10);
    expect(point.cy).toBeCloseTo(170 + 950 / 2, 10);
  });
});

describe("poster text lines", () => {
  it("formats the count line with en-US separators", () => {
    expect(posterCountLine(412, 2197)).toBe("412 of 2,197 genres lit");
    expect(posterCountLine(0, 2197)).toBe("0 of 2,197 genres lit");
  });

  it("formats the date line long-form", () => {
    expect(posterDateLine(new Date(2026, 8, 15))).toBe("September 15, 2026");
  });

  it("keeps the 4:5 portrait dimensions", () => {
    expect(POSTER_WIDTH).toBe(1080);
    expect(POSTER_HEIGHT).toBe(1350);
    expect(POSTER_WIDTH / POSTER_HEIGHT).toBeCloseTo(4 / 5, 10);
  });
});
