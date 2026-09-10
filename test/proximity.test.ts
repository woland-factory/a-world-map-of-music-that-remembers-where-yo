import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Atlas, EmittedGenre as Genre } from "../pipeline/types.js";

// Repeatable version of the layout eyes test.
//
// T4 asks for nearest-neighbor MEMBERSHIP against named ground truth,
// "robust, not brittle absolute distances". The atlas's `neighbors[]` is
// exactly that: each genre's top-K nearest by similarity, and the layout
// is built from it. So the named adjacencies are checked over `neighbors[]`
// (coverage-stable), and the 2-D layout itself is checked separately by
// confirming the metal cluster lands spatially tighter than random pairs.
//
// Genres still awaiting a co-occurrence fetch have no edges and are placed
// arbitrarily, so the spatial layout check runs over the genres that carry
// real similarity data. At full coverage that pool is the whole atlas.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const atlas: Atlas = JSON.parse(readFileSync(join(ROOT, "data", "genres.json"), "utf8"));

const byName = new Map<string, Genre>();
for (const g of atlas.genres) byName.set(g.name.toLowerCase(), g);
const idToName = new Map<number, string>();
for (const g of atlas.genres) idToName.set(g.id, g.name.toLowerCase());

const informed = atlas.genres.filter((g) => g.neighbors.length > 0);

function find(name: string): Genre | null {
  return byName.get(name.toLowerCase()) ?? null;
}
function neighborNames(name: string): Set<string> {
  const g = find(name);
  if (!g) return new Set();
  return new Set(g.neighbors.map((id) => idToName.get(id)!).filter(Boolean));
}
function dist(a: Genre, b: Genre): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const METAL = ["black metal", "death metal", "thrash metal", "doom metal", "heavy metal"];
const PROG_FAMILY = ["progressive rock", "krautrock", "art rock", "psychedelic rock", "progressive metal"];

describe("layout: named adjacency (similarity nearest-neighbors)", () => {
  it("has a meaningful pool of genres with similarity data", () => {
    expect(informed.length).toBeGreaterThanOrEqual(40);
  });

  it("metal subgenres are each other's nearest neighbors", () => {
    const present = METAL.filter((m) => find(m));
    for (const m of METAL.filter((n) => !find(n))) console.warn(`proximity: absent "${m}"`);
    expect(present.length).toBeGreaterThanOrEqual(3);
    const clustered = present.filter((m) => {
      const near = neighborNames(m);
      return present.some((o) => o !== m && near.has(o));
    });
    // A strong majority of metal subgenres name another metal subgenre.
    expect(clustered.length).toBeGreaterThanOrEqual(3);
  });

  it("blues is among jazz's nearest neighbors", () => {
    if (!find("jazz") || !find("blues")) {
      console.warn("proximity: skipping jazz/blues (no data yet)");
      return;
    }
    expect(neighborNames("jazz").has("blues")).toBe(true);
  });

  it("zeuhl is adjacent to the progressive-rock family", () => {
    if (!find("zeuhl")) {
      console.warn("proximity: skipping zeuhl (no data yet)");
      return;
    }
    const near = neighborNames("zeuhl");
    expect(PROG_FAMILY.some((p) => near.has(p))).toBe(true);
  });
});

describe("layout: 2-D placement is not arbitrary", () => {
  it("metal subgenres land spatially tighter than random pairs", () => {
    const present = METAL.map(find).filter((g): g is Genre => g !== null);
    expect(present.length).toBeGreaterThanOrEqual(3);

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
      randSum += dist(informed[(s * 7919) % N], informed[(s * 104729 + 13) % N]);
    }
    const randAvg = randSum / samples;
    expect(metalAvg).toBeLessThan(randAvg * 0.75);
  });
});
