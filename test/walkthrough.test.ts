import { describe, it, expect, beforeEach } from "vitest";
import { walkScript, shouldShowWalkthrough } from "../web/src/ui/walkthrough";
import { hasStoredPassport, setAtlas, addStamp } from "../web/src/state/passport";
import type { Atlas } from "../web/src/types";

const atlas: Atlas = {
  version: 2,
  generated: "x",
  source: "MusicBrainz",
  bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
  regions: [{ id: 0, label: "a" }],
  genres: [{ id: 0, mbid: "m0", name: "jazz", x: 0, y: 0, region: 0, neighbors: [] }],
};

// A localStorage stand-in so the node tests can exercise hasStoredPassport.
const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  },
};

describe("walkScript", () => {
  it("returns the three dark steps in order with the exact strings", () => {
    expect(walkScript(false)).toEqual([
      { text: "Pick a sound you love to start.", anchor: "starter", advance: "lit" },
      { text: "Play your dare to hear it.", anchor: "darePlay", advance: "audio" },
      { text: "Stamp it to cross the frontier.", anchor: "dareStamp", advance: "dareDone" },
    ]);
  });

  it("returns the two lit steps in order with the exact strings", () => {
    expect(walkScript(true)).toEqual([
      { text: "Play today's dare to hear it.", anchor: "darePlay", advance: "audio" },
      { text: "Stamp it to cross the frontier.", anchor: "dareStamp", advance: "dareDone" },
    ]);
  });

  it("both scripts end on a dareDone step anchored to dareStamp", () => {
    for (const script of [walkScript(false), walkScript(true)]) {
      const last = script[script.length - 1];
      expect(last.advance).toBe("dareDone");
      expect(last.anchor).toBe("dareStamp");
    }
  });
});

describe("shouldShowWalkthrough", () => {
  it("is true only on a first visit that is not yet done", () => {
    expect(shouldShowWalkthrough(true, false)).toBe(true);
    expect(shouldShowWalkthrough(true, true)).toBe(false);
    expect(shouldShowWalkthrough(false, false)).toBe(false);
    expect(shouldShowWalkthrough(false, true)).toBe(false);
  });
});

describe("hasStoredPassport", () => {
  beforeEach(() => {
    setAtlas(atlas);
    store.clear();
  });

  it("is false when no passport key is present", () => {
    expect(hasStoredPassport()).toBe(false);
  });

  it("is true once a passport is written to storage", () => {
    addStamp(0); // persists the passport under the `passport` key
    expect(hasStoredPassport()).toBe(true);
  });

  it("is false and never throws when storage is unavailable", () => {
    const saved = (globalThis as unknown as { window: unknown }).window;
    (globalThis as unknown as { window: unknown }).window = {
      get localStorage(): Storage {
        throw new Error("storage blocked");
      },
    };
    expect(() => hasStoredPassport()).not.toThrow();
    expect(hasStoredPassport()).toBe(false);
    (globalThis as unknown as { window: unknown }).window = saved;
  });
});
