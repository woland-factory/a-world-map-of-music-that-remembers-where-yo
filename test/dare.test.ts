import { describe, it, expect } from "vitest";
import {
  adjacentUnstamped,
  pickDare,
  starterGenres,
  updateStreak,
  currentStreak,
  yesterday,
  oneLitNeighbor,
  darePreviewUrl,
  xmur3,
} from "../web/src/state/dare";
import type { Atlas, ExemplarIndex, Passport } from "../web/src/types";

// A small atlas with a known adjacency graph:
//   rock(0) -> jazz(1), pop(2)
//   jazz(1) -> rock(0), blues(3)
//   pop(2)  -> rock(0)
//   blues(3)-> jazz(1), folk(4)
//   folk(4) -> blues(3)
function makeAtlas(neighbors: Record<number, number[]>): Atlas {
  const names = ["rock", "jazz", "pop", "blues", "folk"];
  return {
    version: 2,
    generated: "x",
    source: "test",
    bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
    regions: [{ id: 0, label: "r" }],
    genres: names.map((name, id) => ({
      id,
      mbid: `m${id}`,
      name,
      x: id,
      y: 0,
      region: 0,
      neighbors: neighbors[id] ?? [],
    })),
  };
}

const atlas = makeAtlas({ 0: [1, 2], 1: [0, 3], 2: [0], 3: [1, 4], 4: [3] });
const set = (...ids: number[]) => new Set(ids);
const allPlayable: ExemplarIndex = new Map(
  atlas.genres.map((g) => [g.mbid, { trackTitle: "t", artist: "a", previewUrl: "u" }]),
);

describe("adjacency", () => {
  it("is undirected over neighbors and excludes stamped genres", () => {
    // Lit = rock(0). Frontier = jazz(1), pop(2) (both list rock or are listed).
    const ids = adjacentUnstamped(atlas, set(0), set(0)).sort((a, b) => a - b);
    expect(ids).toEqual([1, 2]);
  });

  it("finds a candidate that only points at a lit genre (reverse direction)", () => {
    // folk(4) -> blues(3). Light blues; folk is reachable via reverse edge.
    const ids = adjacentUnstamped(atlas, set(3), set(3)).sort((a, b) => a - b);
    expect(ids).toContain(4); // folk points at blues
    expect(ids).toContain(1); // jazz is adjacent to blues too
  });

  it("is empty for an empty lit set", () => {
    expect(adjacentUnstamped(atlas, set(), set())).toEqual([]);
  });
});

describe("pickDare", () => {
  const today = "2026-09-14";

  it("returns a genre adjacent to a lit genre and not stamped", () => {
    const g = pickDare(atlas, set(0), set(0), allPlayable, today)!;
    expect(g).not.toBeNull();
    expect([1, 2]).toContain(g.id);
  });

  it("is stable for the same day and shifts across days on a multi-genre pool", () => {
    const same = pickDare(atlas, set(0), set(0), allPlayable, today)!.id;
    expect(pickDare(atlas, set(0), set(0), allPlayable, today)!.id).toBe(same);
    const seen = new Set<number>();
    for (const d of ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05"]) {
      seen.add(pickDare(atlas, set(0), set(0), allPlayable, d)!.id);
    }
    expect(seen.size).toBeGreaterThan(1); // a different day yields a different pick
  });

  it("prefers a genre with a playable preview", () => {
    // Only jazz(1) is playable among the frontier {1,2}.
    const onlyJazz: ExemplarIndex = new Map([["m1", { trackTitle: "t", artist: "a", previewUrl: "u" }]]);
    for (const d of ["2026-01-01", "2026-05-05", "2026-09-14"]) {
      expect(pickDare(atlas, set(0), set(0), onlyJazz, d)!.id).toBe(1);
    }
  });

  it("falls back to a non-playable adjacent genre, never null, when none are playable", () => {
    const none: ExemplarIndex = new Map();
    const g = pickDare(atlas, set(0), set(0), none, today);
    expect(g).not.toBeNull();
    expect([1, 2]).toContain(g!.id);
  });

  it("is null only when there is no adjacent unstamped genre", () => {
    expect(pickDare(atlas, set(), set(), allPlayable, today)).toBeNull(); // empty passport
    const allStamped = set(0, 1, 2, 3, 4);
    expect(pickDare(atlas, allStamped, allStamped, allPlayable, today)).toBeNull();
  });
});

describe("streak", () => {
  it("increments on consecutive days, restarts after a gap, idempotent same day", () => {
    let s = { count: 0, lastCompleted: null as string | null };
    s = updateStreak(s, "2026-09-10");
    expect(s).toEqual({ count: 1, lastCompleted: "2026-09-10" });
    s = updateStreak(s, "2026-09-11");
    expect(s).toEqual({ count: 2, lastCompleted: "2026-09-11" });
    s = updateStreak(s, "2026-09-11"); // same day: no change
    expect(s).toEqual({ count: 2, lastCompleted: "2026-09-11" });
    s = updateStreak(s, "2026-09-14"); // gap: restart
    expect(s).toEqual({ count: 1, lastCompleted: "2026-09-14" });
  });

  it("currentStreak shows the count only when the last completion is today or yesterday", () => {
    const p = (count: number, lastCompleted: string | null): Passport => ({
      version: 3,
      stamps: [],
      streak: { count, lastCompleted },
      frontierHistory: [],
      dare: null,
    });
    expect(currentStreak(p(3, "2026-09-14"), "2026-09-14")).toBe(3); // today
    expect(currentStreak(p(3, "2026-09-13"), "2026-09-14")).toBe(3); // yesterday
    expect(currentStreak(p(3, "2026-09-12"), "2026-09-14")).toBe(0); // missed a day
    expect(currentStreak(p(0, null), "2026-09-14")).toBe(0);
  });

  it("yesterday rolls over month boundaries", () => {
    expect(yesterday("2026-09-01")).toBe("2026-08-31");
    expect(yesterday("2026-01-01")).toBe("2025-12-31");
  });
});

describe("starterGenres", () => {
  it("returns only genres that have a playable neighbor", () => {
    // rock(0) <-> jazz(1) are mutually playable neighbors. pop(2) -> blues(3),
    // but blues is not playable and nobody playable points at pop, so pop has
    // no playable neighbor in either direction.
    const graph = makeAtlas({ 0: [1], 1: [0], 2: [3], 3: [], 4: [] });
    const ex: ExemplarIndex = new Map([
      ["m0", { trackTitle: "t", artist: "a", previewUrl: "u" }], // rock, playable
      ["m1", { trackTitle: "t", artist: "a", previewUrl: "u" }], // jazz, playable
      ["m2", { trackTitle: "t", artist: "a", previewUrl: "u" }], // pop, playable, no playable neighbor
    ]);
    const starters = starterGenres(graph, ex);
    const ids = starters.map((g) => g.id);
    // rock<->jazz are mutually playable neighbors; both qualify.
    expect(ids).toContain(0);
    expect(ids).toContain(1);
    // pop(2) has no playable neighbor in either direction: excluded.
    expect(ids).not.toContain(2);
    // every returned starter has a playable preview.
    for (const g of starters) expect(ex.has(g.mbid)).toBe(true);
  });
});

describe("oneLitNeighbor", () => {
  it("names a lit genre adjacent to the dare (either direction)", () => {
    const n = oneLitNeighbor(atlas, set(0), 1); // jazz's lit neighbor is rock
    expect(n?.id).toBe(0);
    const rev = oneLitNeighbor(atlas, set(3), 4); // folk -> blues (lit)
    expect(rev?.id).toBe(3);
  });
});

describe("darePreviewUrl", () => {
  const dare = (genreId: number): Passport => ({
    version: 3,
    stamps: [],
    streak: { count: 0, lastCompleted: null },
    frontierHistory: [],
    dare: { date: "2026-09-14", genreId, mbid: `m${genreId}`, done: false },
  });

  it("returns the pinned dare's preview URL to warm", () => {
    const ex: ExemplarIndex = new Map([["m1", { trackTitle: "t", artist: "a", previewUrl: "the-url" }]]);
    expect(darePreviewUrl(dare(1), ex, atlas)).toBe("the-url");
  });

  it("returns null when there is no dare or no playable preview", () => {
    const noDare: Passport = { ...dare(1), dare: null };
    expect(darePreviewUrl(noDare, allPlayable, atlas)).toBeNull();
    expect(darePreviewUrl(dare(1), new Map(), atlas)).toBeNull();
  });
});

describe("xmur3", () => {
  it("is deterministic and unsigned", () => {
    expect(xmur3("2026-09-14")).toBe(xmur3("2026-09-14"));
    expect(xmur3("a")).not.toBe(xmur3("b"));
    expect(xmur3("x")).toBeGreaterThanOrEqual(0);
  });
});
