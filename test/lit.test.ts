import { describe, it, expect } from "vitest";
import { computeRenderGenres, countLit } from "../web/src/map/lit";
import { regionColor, UNLIT_COLOR } from "../web/src/map/colors";
import type { Atlas } from "../web/src/types";

const atlas: Atlas = {
  version: 1,
  generated: "x",
  source: "MusicBrainz",
  bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
  regions: [
    { id: 0, label: "a" },
    { id: 1, label: "b" },
  ],
  genres: [
    { id: 0, mbid: "m0", name: "g0", x: 0, y: 0, region: 0, neighbors: [] },
    { id: 1, mbid: "m1", name: "g1", x: 1, y: 0, region: 1, neighbors: [] },
    { id: 2, mbid: "m2", name: "g2", x: 0, y: 1, region: 0, neighbors: [] },
  ],
};

describe("lit rendering logic", () => {
  it("marks zero genres lit for an empty passport", () => {
    const r = computeRenderGenres(atlas, new Set());
    expect(r.every((g) => !g.lit)).toBe(true);
    expect(r.every((g) => g.color === UNLIT_COLOR)).toBe(true);
    expect(countLit(atlas, new Set())).toBe(0);
  });

  it("marks exactly the passport genres lit in their region color", () => {
    const lit = new Set([0, 2]);
    const r = computeRenderGenres(atlas, lit);
    expect(r.filter((g) => g.lit).map((g) => g.genre.id).sort()).toEqual([0, 2]);
    expect(r[0].color).toBe(regionColor(0));
    expect(r[2].color).toBe(regionColor(0));
    expect(r[1].lit).toBe(false);
    expect(countLit(atlas, lit)).toBe(2);
  });
});
