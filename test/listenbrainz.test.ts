import { describe, it, expect, beforeEach } from "vitest";
import { fillFromListenBrainz, litMessage, FILL_MESSAGES } from "../web/src/state/listenbrainz";
import {
  setAtlas,
  addStamps,
  addStamp,
  importPassport,
  getPassport,
  getStreak,
} from "../web/src/state/passport";
import type { Atlas } from "../web/src/types";

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

// A localStorage stand-in so the node tests can count persistence writes.
const store = new Map<string, string>();
let writes = 0;
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      writes++;
      store.set(k, v);
    },
    removeItem: (k: string) => store.delete(k),
  },
};

beforeEach(() => {
  setAtlas(atlas);
  importPassport(JSON.stringify({ version: 2, stamps: [] }));
  store.clear();
  writes = 0;
});

type FetchLike = Parameters<typeof fillFromListenBrainz>[1]["fetchImpl"];

function fakeFetch(status: number, body: unknown): { impl: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const impl = ((url: string) => {
    calls.push(url);
    return Promise.resolve({ status, json: () => Promise.resolve(body) });
  }) as unknown as FetchLike;
  return { impl, calls };
}

describe("addStamps", () => {
  it("applies N stamps with exactly one storage write and returns the count", () => {
    const added = addStamps(["m1", "m2", "m1", "not-in-the-atlas"]);
    expect(added).toBe(2);
    expect(writes).toBe(1);
    const stamps = getPassport().stamps;
    expect(stamps.map((s) => s.mbid).sort()).toEqual(["m1", "m2"]);
  });

  it("skips already-stamped genres and writes nothing when nothing is new", () => {
    addStamp(1);
    writes = 0;
    expect(addStamps(["m1"])).toBe(0);
    expect(writes).toBe(0);
    expect(addStamps(["m1", "m3"])).toBe(1);
    expect(writes).toBe(1);
  });

  it("stamps carry today's local date and no track fields", () => {
    addStamps(["m0", "m2"]);
    const today = new Date();
    const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    for (const s of getPassport().stamps) {
      expect(s.date).toBe(expected);
      expect(s.trackTitle).toBeUndefined();
      expect(s.artist).toBeUndefined();
    }
  });

  it("never touches the streak", () => {
    addStamps(["m0", "m1", "m2", "m3"]);
    expect(getStreak()).toEqual({ count: 0, lastCompleted: null });
  });
});

describe("fillFromListenBrainz", () => {
  it("returns the local message for empty and whitespace names without fetching", async () => {
    for (const name of ["", "   "]) {
      const { impl, calls } = fakeFetch(200, { stamps: [], pending: false });
      const result = await fillFromListenBrainz(name, { fetchImpl: impl, addStamps: () => 0 });
      expect(result).toEqual({ ok: false, added: 0, message: FILL_MESSAGES.emptyName });
      expect(calls).toHaveLength(0);
    }
  });

  it("encodes the trimmed name into the request URL", async () => {
    const { impl, calls } = fakeFetch(200, { stamps: [], pending: false });
    await fillFromListenBrainz("  some name  ", { fetchImpl: impl, addStamps: () => 0 });
    expect(calls).toEqual(["/api/listenbrainz/some%20name"]);
  });

  it("maps a network failure and a non-JSON body to the no-answer message", async () => {
    const reject = (() => Promise.reject(new Error("down"))) as unknown as FetchLike;
    const badJson = (() =>
      Promise.resolve({ status: 502, json: () => Promise.reject(new Error("html")) })) as unknown as FetchLike;
    for (const impl of [reject, badJson]) {
      const result = await fillFromListenBrainz("rob", { fetchImpl: impl, addStamps: () => 0 });
      expect(result).toEqual({ ok: false, added: 0, message: FILL_MESSAGES.noAnswer });
    }
  });

  it("shows the server's error body verbatim on 400/404/429/502", async () => {
    for (const [status, error] of [
      [400, "That name has a character ListenBrainz skips. Check it, or tap any genre to stamp it yourself."],
      [404, "ListenBrainz can't find that name. Check the spelling, or tap any genre to stamp it yourself."],
      [429, "Lots of lookups right now. Wait a minute and try again."],
      [502, "ListenBrainz didn't answer. Try again in a moment."],
    ] as const) {
      const { impl } = fakeFetch(status, { error });
      const result = await fillFromListenBrainz("rob", { fetchImpl: impl, addStamps: () => 0 });
      expect(result).toEqual({ ok: false, added: 0, message: error });
    }
  });

  it("maps pending stats to the try-later message", async () => {
    const { impl } = fakeFetch(200, { stamps: [], pending: true });
    const result = await fillFromListenBrainz("rob", { fetchImpl: impl, addStamps: () => 0 });
    expect(result).toEqual({ ok: false, added: 0, message: FILL_MESSAGES.pending });
  });

  it("maps an empty stamps array to the tags-this-map-skips message", async () => {
    const { impl } = fakeFetch(200, { stamps: [], pending: false });
    const result = await fillFromListenBrainz("rob", { fetchImpl: impl, addStamps: () => 0 });
    expect(result).toEqual({ ok: true, added: 0, message: FILL_MESSAGES.noMatches });
  });

  it("maps zero newly-added stamps to the already-shows message", async () => {
    const { impl } = fakeFetch(200, {
      stamps: [{ mbid: "m1", name: "jazz", listenCount: 3 }],
      pending: false,
    });
    const result = await fillFromListenBrainz("rob", { fetchImpl: impl, addStamps: () => 0 });
    expect(result).toEqual({ ok: true, added: 0, message: FILL_MESSAGES.alreadyLit });
  });

  it("applies the batch through the real passport and reports the count", async () => {
    const { impl } = fakeFetch(200, {
      stamps: [
        { mbid: "m1", name: "jazz", listenCount: 12 },
        { mbid: "m2", name: "house", listenCount: 4 },
        { mbid: "nope", name: "gone", listenCount: 1 },
      ],
      pending: false,
    });
    writes = 0;
    const result = await fillFromListenBrainz("rob", { fetchImpl: impl, addStamps });
    expect(result).toEqual({ ok: true, added: 2, message: "Lit 2 new genres from your travels." });
    expect(writes).toBe(1);
    // Nothing anywhere in storage holds the typed name.
    expect([...store.values()].join("\n")).not.toContain("rob");
  });

  it("uses the singular for one genre and the count for many", () => {
    expect(litMessage(1)).toBe("Lit 1 new genre from your travels.");
    expect(litMessage(24)).toBe("Lit 24 new genres from your travels.");
  });
});
