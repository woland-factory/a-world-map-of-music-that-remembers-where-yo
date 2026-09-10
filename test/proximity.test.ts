import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Atlas, EmittedGenre as Genre } from "../pipeline/types.js";

// Repeatable version of the layout eyes test. Uses nearest-neighbor
// MEMBERSHIP (robust) rather than brittle absolute distances.
//
// The layout can only place a genre meaningfully once it has similarity
// data (an edge to something). Genres still awaiting a co-occurrence fetch
// have no edges and drift to arbitrary spots, so the eyes test measures
// proximity among the genres that carry real data. At full coverage that
// pool is the whole atlas.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const atlas: Atlas = JSON.parse(readFileSync(join(ROOT, "data", "genres.json"), "utf8"));

const informed = atlas.genres.filter((g) => g.neighbors.length > 0);
const byName = new Map<string, Genre>();
for (const g of informed) byName.set(g.name.toLowerCase(), g);

function find(name: string): Genre | null {
  return byName.get(name.toLowerCase()) ?? null;
}
function dist(a: Genre, b: Genre): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function kNearestNames(target: Genre, k: number): Set<string> {
  return new Set(
    informed
      .filter((g) => g.id !== target.id)
      .map((g) => ({ g, d: dist(target, g) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, k)
      .map((e) => e.g.name.toLowerCase()),
  );
}

const K = 30;

describe("layout proximity (named ground truth)", () => {
  it("has a meaningful pool of genres with similarity data", () => {
    expect(informed.length).toBeGreaterThanOrEqual(40);
  });

  it("metal subgenres cluster and are closer than random pairs", () => {
    const names = ["black metal", "death metal", "thrash metal", "doom metal", "heavy metal"];
    const present = names.map(find).filter((g): g is Genre => g !== null);
    for (const missing of names.filter((n) => !find(n))) {
      console.warn(`proximity: skipping absent genre "${missing}"`);
    }
    expect(present.length).toBeGreaterThanOrEqual(3);

    for (const g of present) {
      const near = kNearestNames(g, K);
      const others = present.filter((o) => o.id !== g.id);
      expect(others.some((o) => near.has(o.name.toLowerCase()))).toBe(true);
    }

    let metalSum = 0;
    let metalPairs = 0;
    for (let i = 0; i < present.length; i++) {
      for (let j = i + 1; j < present.length; j++) {
        metalSum += dist(present[i], present[j]);
        metalPairs++;
      }
    }
    const metalAvg = metalSum / metalPairs;

    let randSum = 0;
    const N = informed.length;
    const samples = 400;
    for (let s = 0; s < samples; s++) {
      const a = informed[(s * 7919) % N];
      const b = informed[(s * 104729 + 13) % N];
      randSum += dist(a, b);
    }
    const randAvg = randSum / samples;
    expect(metalAvg).toBeLessThan(randAvg * 0.75);
  });

  it("blues sits within jazz's nearest neighbors", () => {
    const jazz = find("jazz");
    const blues = find("blues");
    if (!jazz || !blues) {
      console.warn("proximity: skipping jazz/blues (no data yet)");
      return;
    }
    expect(kNearestNames(jazz, K).has("blues")).toBe(true);
  });

  it("zeuhl sits within progressive rock's nearest neighbors", () => {
    const prog = find("progressive rock");
    const zeuhl = find("zeuhl");
    if (!prog || !zeuhl) {
      console.warn("proximity: skipping zeuhl/progressive rock (no data yet)");
      return;
    }
    // Symmetric membership: either direction within k-nearest counts.
    const near = kNearestNames(prog, 40);
    const nearZ = kNearestNames(zeuhl, 40);
    expect(near.has("zeuhl") || nearZ.has("progressive rock")).toBe(true);
  });
});
