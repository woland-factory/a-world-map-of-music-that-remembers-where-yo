import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Atlas } from "../pipeline/types.js";
import type { GenresCache } from "../pipeline/types.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadAtlas(): Atlas {
  return JSON.parse(readFileSync(join(ROOT, "data", "genres.json"), "utf8"));
}
function loadCache(): GenresCache {
  return JSON.parse(readFileSync(join(ROOT, "data", "cache", "genres.json"), "utf8"));
}

describe("data/genres.json coverage and schema", () => {
  it("covers every genre from the committed genre-list cache", () => {
    const atlas = loadAtlas();
    const cache = loadCache();
    const atlasMbids = new Set(atlas.genres.map((g) => g.mbid));
    for (const g of cache.genres) {
      expect(atlasMbids.has(g.mbid)).toBe(true);
    }
    expect(atlas.genres.length).toBe(cache.genres.length);
  });

  it("has valid x/y/region/neighbors for every genre", () => {
    const atlas = loadAtlas();
    const ids = new Set(atlas.genres.map((g) => g.id));
    const regionIds = new Set(atlas.regions.map((r) => r.id));
    for (const g of atlas.genres) {
      expect(Number.isFinite(g.x)).toBe(true);
      expect(Number.isFinite(g.y)).toBe(true);
      expect(Number.isInteger(g.region)).toBe(true);
      expect(regionIds.has(g.region)).toBe(true);
      expect(Array.isArray(g.neighbors)).toBe(true);
      expect(g.neighbors.length).toBeLessThanOrEqual(10);
      for (const n of g.neighbors) {
        expect(ids.has(n)).toBe(true);
      }
    }
  });

  it("every region has a non-empty label", () => {
    const atlas = loadAtlas();
    expect(atlas.regions.length).toBeGreaterThan(0);
    for (const r of atlas.regions) {
      expect(typeof r.label).toBe("string");
      expect(r.label.length).toBeGreaterThan(0);
    }
  });

  it("stays under the 400KB gzipped size budget", () => {
    const raw = readFileSync(join(ROOT, "data", "genres.json"));
    const gz = gzipSync(raw).length;
    expect(gz).toBeLessThan(400 * 1024);
  });
});
