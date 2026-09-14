import { describe, it, expect, beforeEach } from "vitest";
import {
  setAtlas,
  migratePassport,
  addStamp,
  removeStamp,
  exportPassport,
  importPassport,
  litSet,
  getPassport,
  isStamped,
  buildSeedStamps,
  buildSeedPassport,
  completeDare,
  ensureDare,
  getStreak,
  getFrontierHistory,
} from "../web/src/state/passport";
import type { Atlas, ExemplarIndex } from "../web/src/types";

const atlas: Atlas = {
  version: 2,
  generated: "x",
  source: "MusicBrainz",
  bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
  regions: [{ id: 0, label: "a" }],
  genres: [
    { id: 0, mbid: "m0", name: "black metal", x: 0, y: 0, region: 0, neighbors: [] },
    { id: 1, mbid: "m1", name: "jazz", x: 1, y: 0, region: 0, neighbors: [] },
    { id: 2, mbid: "m2", name: "house", x: 0, y: 1, region: 0, neighbors: [] },
    { id: 3, mbid: "m3", name: "blues", x: 1, y: 1, region: 0, neighbors: [] },
  ],
};

beforeEach(() => {
  setAtlas(atlas);
  // Reset in-memory state between tests via an empty import.
  importPassport(JSON.stringify({ version: 2, stamps: [] }));
});

describe("passport migration", () => {
  it("migrates a legacy {lit:[...]} passport to v3 with the same genres lit", () => {
    const p = migratePassport({ lit: [0, 2] });
    expect(p.version).toBe(3);
    expect([...litSet(p)].sort()).toEqual([0, 2]);
    for (const s of p.stamps) {
      expect(s.mbid).toBe(atlas.genres[s.genreId].mbid);
      expect(s.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // New fields default to empty.
    expect(p.streak).toEqual({ count: 0, lastCompleted: null });
    expect(p.frontierHistory).toEqual([]);
    expect(p.dare).toBeNull();
  });

  it("migrates a v2 passport to v3 with the same genres lit and empty new fields", () => {
    const p = migratePassport({
      version: 2,
      stamps: [{ genreId: 0, mbid: "m0", date: "2025-01-01", trackTitle: "t", artist: "a" }],
    });
    expect(p.version).toBe(3);
    expect([...litSet(p)]).toEqual([0]);
    expect(p.streak).toEqual({ count: 0, lastCompleted: null });
    expect(p.frontierHistory).toEqual([]);
    expect(p.dare).toBeNull();
  });

  it("validates v3 fields: coerces streak, resolves frontier by mbid, drops a bad dare", () => {
    const p = migratePassport({
      version: 3,
      stamps: [{ genreId: 1, mbid: "m1", date: "2026-09-14" }],
      streak: { count: -3.7, lastCompleted: "nonsense" },
      frontierHistory: [
        { genreId: 999, mbid: "m1", date: "2026-09-13" }, // stale id, resolves by mbid
        { genreId: 999, mbid: "gone", date: "2026-09-12" }, // unresolvable, dropped
        { genreId: 3, mbid: "m3", date: "bad-date" }, // bad date, dropped
      ],
      dare: { genreId: 3, mbid: "m3", date: "2026-09-14", done: false },
    });
    expect(p.streak).toEqual({ count: 0, lastCompleted: null });
    expect(p.frontierHistory).toHaveLength(1);
    expect(p.frontierHistory[0]).toMatchObject({ genreId: 1, mbid: "m1", date: "2026-09-13" });
    expect(p.dare).toMatchObject({ genreId: 3, mbid: "m3", date: "2026-09-14", done: false });
  });

  it("drops a pinned dare whose genre no longer resolves", () => {
    const p = migratePassport({
      version: 3,
      stamps: [],
      dare: { genreId: 999, mbid: "gone", date: "2026-09-14", done: false },
    });
    expect(p.dare).toBeNull();
  });

  it("treats corrupt or unknown shapes as an empty v3 passport", () => {
    for (const raw of [null, 42 as unknown, { nonsense: true }]) {
      const p = migratePassport(raw);
      expect(p.version).toBe(3);
      expect(p.stamps).toHaveLength(0);
      expect(p.streak).toEqual({ count: 0, lastCompleted: null });
      expect(p.frontierHistory).toEqual([]);
      expect(p.dare).toBeNull();
    }
  });

  it("drops stamps whose genre is not in the atlas", () => {
    const p = migratePassport({ version: 2, stamps: [{ genreId: 99, mbid: "gone", date: "2024-01-01" }] });
    expect(p.stamps).toHaveLength(0);
  });
});

describe("stamping", () => {
  it("records genreId, mbid, local date and track fields, and is idempotent", () => {
    addStamp(1, { trackTitle: "So What", artist: "Miles Davis", previewUrl: "u" });
    addStamp(1, { trackTitle: "Other", artist: "Nobody", previewUrl: "u" }); // no-op
    const stamps = getPassport().stamps;
    expect(stamps).toHaveLength(1);
    expect(stamps[0]).toMatchObject({ genreId: 1, mbid: "m1", trackTitle: "So What", artist: "Miles Davis" });
    expect(stamps[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(isStamped(1)).toBe(true);
    expect(litSet(getPassport()).has(1)).toBe(true);
  });

  it("stamps a genre without a preview and records no track fields", () => {
    addStamp(0);
    const s = getPassport().stamps[0];
    expect(s.trackTitle).toBeUndefined();
    expect(s.artist).toBeUndefined();
  });

  it("removes a stamp", () => {
    addStamp(2, { trackTitle: "t", artist: "a", previewUrl: "u" });
    expect(isStamped(2)).toBe(true);
    removeStamp(2);
    expect(isStamped(2)).toBe(false);
    expect(litSet(getPassport()).has(2)).toBe(false);
  });
});

describe("export / import", () => {
  it("round-trips to an equivalent passport", () => {
    addStamp(0, { trackTitle: "t0", artist: "a0", previewUrl: "u" });
    addStamp(1, { trackTitle: "t1", artist: "a1", previewUrl: "u" });
    const text = exportPassport();
    importPassport(JSON.stringify({ version: 2, stamps: [] }));
    expect(getPassport().stamps).toHaveLength(0);
    const result = importPassport(text);
    expect(result.ok).toBe(true);
    expect([...litSet(getPassport())].sort()).toEqual([0, 1]);
  });

  it("rejects non-JSON and wrong shapes without throwing", () => {
    expect(importPassport("not json").ok).toBe(false);
    expect(importPassport("[1,2,3]").ok).toBe(false);
    expect(importPassport(JSON.stringify({ hello: "world" })).ok).toBe(false);
  });

  it("drops absent mbids and re-resolves genreId from mbid", () => {
    // Correct mbid but a stale genreId, plus a stamp whose mbid is gone.
    const raw = {
      version: 2,
      stamps: [
        { genreId: 999, mbid: "m3", date: "2025-05-05", trackTitle: "t", artist: "a" },
        { genreId: 2, mbid: "not-in-atlas", date: "2025-05-05" },
      ],
    };
    const result = importPassport(JSON.stringify(raw));
    expect(result.ok).toBe(true);
    const stamps = getPassport().stamps;
    expect(stamps).toHaveLength(1);
    expect(stamps[0].genreId).toBe(3); // re-resolved from mbid "m3"
  });

  it("caps stamp length at the atlas genre count", () => {
    const many = Array.from({ length: 500 }, (_, i) => ({
      genreId: i % 4,
      mbid: `m${i % 4}`,
      date: "2025-01-01",
    }));
    const result = importPassport(JSON.stringify({ version: 2, stamps: many }));
    expect(result.ok).toBe(true);
    expect(getPassport().stamps.length).toBeLessThanOrEqual(atlas.genres.length);
  });

  it("stores imported strings verbatim so the DOM can encode them with textContent", () => {
    const raw = { version: 2, stamps: [{ genreId: 0, mbid: "m0", date: "2025-01-01", trackTitle: "<img src=x>", artist: "a" }] };
    importPassport(JSON.stringify(raw));
    expect(getPassport().stamps[0].trackTitle).toBe("<img src=x>");
  });
});

describe("streak, frontier, and dare", () => {
  const today = "2026-09-14";
  const yesterday = "2026-09-13";

  it("addStamp and removeStamp never drop the streak or frontier history", () => {
    importPassport(
      JSON.stringify({
        version: 3,
        stamps: [{ genreId: 0, mbid: "m0", date: today }],
        streak: { count: 4, lastCompleted: yesterday },
        frontierHistory: [{ genreId: 0, mbid: "m0", date: yesterday }],
        dare: null,
      }),
    );
    addStamp(2, { trackTitle: "t", artist: "a", previewUrl: "u" });
    expect(getStreak()).toEqual({ count: 4, lastCompleted: yesterday });
    expect(getFrontierHistory()).toHaveLength(1);
    removeStamp(0);
    expect(getStreak()).toEqual({ count: 4, lastCompleted: yesterday });
    expect(getFrontierHistory()).toHaveLength(1);
  });

  it("round-trips a v3 passport through export/import unchanged", () => {
    importPassport(
      JSON.stringify({
        version: 3,
        stamps: [{ genreId: 1, mbid: "m1", date: today, trackTitle: "So What", artist: "Miles Davis" }],
        streak: { count: 2, lastCompleted: today },
        frontierHistory: [{ genreId: 1, mbid: "m1", date: today }],
        dare: { genreId: 3, mbid: "m3", date: today, done: false },
      }),
    );
    const text = exportPassport();
    importPassport(JSON.stringify({ version: 2, stamps: [] }));
    importPassport(text);
    expect(getPassport()).toMatchObject({
      version: 3,
      streak: { count: 2, lastCompleted: today },
      dare: { genreId: 3, mbid: "m3", date: today, done: false },
    });
    expect(getFrontierHistory()).toHaveLength(1);
    expect([...litSet(getPassport())]).toEqual([1]);
  });

  it("completeDare bumps the streak once, appends one crossing, and dedupes the same day", () => {
    importPassport(
      JSON.stringify({
        version: 3,
        stamps: [],
        streak: { count: 0, lastCompleted: null },
        frontierHistory: [],
        dare: { genreId: 1, mbid: "m1", date: today, done: false },
      }),
    );
    completeDare(1, today);
    expect(getStreak()).toEqual({ count: 1, lastCompleted: today });
    expect(getFrontierHistory()).toEqual([{ genreId: 1, mbid: "m1", date: today }]);
    expect(getPassport().dare?.done).toBe(true);
    completeDare(1, today); // idempotent same-day
    expect(getStreak().count).toBe(1);
    expect(getFrontierHistory()).toHaveLength(1);
  });

  it("completeDare is a no-op for a genre that is not today's dare", () => {
    importPassport(
      JSON.stringify({
        version: 3,
        stamps: [],
        streak: { count: 0, lastCompleted: null },
        frontierHistory: [],
        dare: { genreId: 1, mbid: "m1", date: today, done: false },
      }),
    );
    completeDare(2, today);
    expect(getStreak()).toEqual({ count: 0, lastCompleted: null });
    expect(getFrontierHistory()).toHaveLength(0);
  });

  it("import drops unresolvable frontier entries and an invalid dare without throwing", () => {
    const result = importPassport(
      JSON.stringify({
        version: 3,
        stamps: [{ genreId: 1, mbid: "m1", date: today }],
        streak: { count: 5, lastCompleted: today },
        frontierHistory: [
          { genreId: 1, mbid: "m1", date: today },
          { genreId: 2, mbid: "not-in-atlas", date: today },
        ],
        dare: { genreId: 9, mbid: "not-in-atlas", date: today, done: false },
      }),
    );
    expect(result.ok).toBe(true);
    expect(getFrontierHistory()).toHaveLength(1);
    expect(getPassport().dare).toBeNull();
    expect(getStreak()).toEqual({ count: 5, lastCompleted: today });
  });

  it("ensureDare marks the pinned dare done when its genre is lit", () => {
    importPassport(
      JSON.stringify({
        version: 3,
        stamps: [{ genreId: 1, mbid: "m1", date: today }],
        streak: { count: 0, lastCompleted: null },
        frontierHistory: [],
        dare: { genreId: 1, mbid: "m1", date: today, done: false },
      }),
    );
    // Genre 1 is stamped (lit), so ensureDare keeps the pinned dare and marks
    // it done. The fixture has no adjacency, so no fresh dare is computed.
    const dare = ensureDare(atlas, new Map(), today);
    expect(dare).toMatchObject({ genreId: 1, done: true });
  });
});

describe("demo seed", () => {
  it("produces dated v2 stamps with tracks where an exemplar exists", () => {
    const exemplars: ExemplarIndex = new Map([
      ["m0", { trackTitle: "Black Metal", artist: "Venom", previewUrl: "u" }],
    ]);
    const base = new Date("2026-09-14T12:00:00");
    const stamps = buildSeedStamps(atlas, ["black metal", "jazz", "unknown genre"], exemplars, base);
    expect(stamps).toHaveLength(2); // unknown name dropped
    expect(stamps[0]).toMatchObject({ genreId: 0, trackTitle: "Black Metal", artist: "Venom" });
    expect(stamps[1].trackTitle).toBeUndefined(); // jazz has no exemplar here
    expect(stamps[0].date).not.toBe(stamps[1].date); // stepped back per index
    expect(stamps[0].date > stamps[1].date).toBe(true);
  });

  it("builds a v3 seed passport with a live streak and frontier history", () => {
    const exemplars: ExemplarIndex = new Map([
      ["m0", { trackTitle: "Black Metal", artist: "Venom", previewUrl: "u" }],
    ]);
    const base = new Date("2026-09-14T12:00:00");
    const p = buildSeedPassport(atlas, ["black metal", "jazz", "house", "blues"], exemplars, base);
    expect(p).not.toBeNull();
    expect(p!.version).toBe(3);
    expect(p!.streak.count).toBeGreaterThanOrEqual(1);
    expect(p!.streak.lastCompleted).toBe("2026-09-13"); // yesterday
    expect(p!.frontierHistory.length).toBeGreaterThan(0);
    expect(p!.dare).toBeNull();
    // Newest crossing is dated yesterday.
    expect(p!.frontierHistory[0].date).toBe("2026-09-13");
  });

  it("returns null when no seed name resolves", () => {
    expect(buildSeedPassport(atlas, ["nope"], new Map(), new Date("2026-09-14T12:00:00"))).toBeNull();
  });
});
