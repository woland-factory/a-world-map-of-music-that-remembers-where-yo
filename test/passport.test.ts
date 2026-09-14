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
  it("migrates a legacy {lit:[...]} passport to v2 with the same genres lit", () => {
    const p = migratePassport({ lit: [0, 2] });
    expect(p.version).toBe(2);
    expect([...litSet(p)].sort()).toEqual([0, 2]);
    for (const s of p.stamps) {
      expect(s.mbid).toBe(atlas.genres[s.genreId].mbid);
      expect(s.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("treats corrupt or unknown shapes as an empty passport", () => {
    expect(migratePassport(null).stamps).toHaveLength(0);
    expect(migratePassport(42 as unknown).stamps).toHaveLength(0);
    expect(migratePassport({ nonsense: true }).stamps).toHaveLength(0);
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
});
