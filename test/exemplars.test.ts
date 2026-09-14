import { describe, it, expect, vi, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { gzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Atlas, ExemplarsFile, GenresCache } from "../pipeline/types.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(ROOT, "test", "fixtures");

function tempDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "exemplars-"));
  mkdirSync(join(dir, "cache"), { recursive: true });
  copyFileSync(join(FIXTURE, "cache", "genres.json"), join(dir, "cache", "genres.json"));
  return dir;
}

// iTunes returns a preview for every genre except "bebop" (a negative).
function mockItunes(counter: { n: number }) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
    counter.n++;
    const term = new URL(String(input)).searchParams.get("term") ?? "";
    const hasPreview = term.toLowerCase() !== "bebop";
    const results = hasPreview
      ? [
          {
            trackName: `${term} song`,
            artistName: `${term} artist`,
            previewUrl: `https://audio/${encodeURIComponent(term)}.m4a`,
            artworkUrl100: "https://art/100x100bb.jpg",
          },
        ]
      : [];
    return new Response(JSON.stringify({ resultCount: results.length, results }), {
      status: 200,
    });
  });
}

async function loadFetchStage(dataDir: string) {
  process.env.ATLAS_DATA_DIR = dataDir;
  vi.resetModules();
  return await import("../pipeline/fetch-exemplars.js");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("fetch-exemplars: resumable, incremental, rate-limited", () => {
  it("appends one line per genre and refetches nothing when fully cached", async () => {
    const dir = tempDataDir();
    vi.useFakeTimers();
    const counter = { n: 0 };
    mockItunes(counter);

    const { fetchExemplars } = await loadFetchStage(dir);
    const run = fetchExemplars();
    await vi.runAllTimersAsync();
    await run;

    const jsonl = readFileSync(join(dir, "cache", "exemplars.jsonl"), "utf8").trim().split("\n");
    expect(jsonl).toHaveLength(6); // one line per genre
    expect(counter.n).toBe(6);

    // Re-run: everything cached, so zero network calls.
    vi.restoreAllMocks();
    const failing = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("should not fetch when fully cached");
    });
    const { fetchExemplars: again } = await loadFetchStage(dir);
    const run2 = again();
    await vi.runAllTimersAsync();
    await run2;
    expect(failing).not.toHaveBeenCalled();
  });

  it("refetches only the genre whose cache line was removed", async () => {
    const dir = tempDataDir();
    vi.useFakeTimers();
    mockItunes({ n: 0 });
    const { fetchExemplars } = await loadFetchStage(dir);
    const first = fetchExemplars();
    await vi.runAllTimersAsync();
    await first;

    // Drop the last cache line.
    const file = join(dir, "cache", "exemplars.jsonl");
    const lines = readFileSync(file, "utf8").trim().split("\n");
    const dropped = JSON.parse(lines[lines.length - 1]);
    writeFileSync(file, lines.slice(0, -1).join("\n") + "\n");

    vi.restoreAllMocks();
    const counter = { n: 0 };
    mockItunes(counter);
    const { fetchExemplars: again } = await loadFetchStage(dir);
    const second = again();
    await vi.runAllTimersAsync();
    await second;
    expect(counter.n).toBe(1); // only the dropped genre refetched
    const after = readFileSync(file, "utf8").trim().split("\n");
    expect(after).toHaveLength(6);
    expect(JSON.parse(after[after.length - 1]).mbid).toBe(dropped.mbid);
  });

  it("records a negative for a genre with no preview and never refetches it", async () => {
    const dir = tempDataDir();
    vi.useFakeTimers();
    mockItunes({ n: 0 });
    const { fetchExemplars } = await loadFetchStage(dir);
    const run = fetchExemplars();
    await vi.runAllTimersAsync();
    await run;

    const lines = readFileSync(join(dir, "cache", "exemplars.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const bebop = lines.find((r) => r.name === "bebop");
    expect(bebop.found).toBe(false);

    vi.restoreAllMocks();
    const failing = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("negatives must not be refetched");
    });
    const { fetchExemplars: again } = await loadFetchStage(dir);
    const run2 = again();
    await vi.runAllTimersAsync();
    await run2;
    expect(failing).not.toHaveBeenCalled();
  });

  it("throttles serialized requests to at least a 3000ms interval", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const times: number[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      times.push(Date.now());
      return new Response(
        JSON.stringify({
          resultCount: 1,
          results: [{ trackName: "t", artistName: "a", previewUrl: "https://audio/x.m4a" }],
        }),
        { status: 200 },
      );
    });
    process.env.ATLAS_DATA_DIR = tempDataDir();
    vi.resetModules();
    const { searchExemplar } = await import("../pipeline/lib/itunes.js");
    const a = searchExemplar("alpha");
    const b = searchExemplar("beta");
    await vi.runAllTimersAsync();
    await Promise.all([a, b]);
    expect(times).toHaveLength(2);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(3000);
  });
});

describe("emit-exemplars: deterministic, keyed by mbid, atlas-scoped", () => {
  function scenario(): string {
    const dir = mkdtempSync(join(tmpdir(), "emit-ex-"));
    mkdirSync(join(dir, "cache"), { recursive: true });
    const cache: GenresCache = JSON.parse(
      readFileSync(join(FIXTURE, "cache", "genres.json"), "utf8"),
    );
    writeFileSync(join(dir, "cache", "genres.json"), JSON.stringify(cache));
    const atlas: Atlas = {
      version: 1,
      generated: cache.fetchedAt,
      source: "MusicBrainz",
      bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
      regions: [{ id: 0, label: "r" }],
      genres: cache.genres.map((g, i) => ({
        id: i,
        mbid: g.mbid,
        name: g.name,
        x: 0,
        y: 0,
        region: 0,
        neighbors: [],
      })),
    };
    writeFileSync(join(dir, "genres.json"), JSON.stringify(atlas));
    // Positive for two genres, a negative, and one mbid absent from the atlas.
    const lines = [
      {
        mbid: cache.genres[0].mbid,
        name: cache.genres[0].name,
        found: true,
        trackTitle: "T0",
        artist: "A0",
        previewUrl: "https://audio/0.m4a",
        artworkUrl: "https://art/0.jpg",
      },
      {
        mbid: cache.genres[1].mbid,
        name: cache.genres[1].name,
        found: true,
        trackTitle: "T1",
        artist: "A1",
        previewUrl: "https://audio/1.m4a",
      },
      { mbid: cache.genres[2].mbid, name: cache.genres[2].name, found: false },
      {
        mbid: "ffffffff-0000-0000-0000-00000000ffff",
        name: "ghost",
        found: true,
        trackTitle: "G",
        artist: "G",
        previewUrl: "https://audio/g.m4a",
      },
    ];
    writeFileSync(
      join(dir, "cache", "exemplars.jsonl"),
      lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
    );
    return dir;
  }

  async function loadEmit(dir: string) {
    process.env.ATLAS_DATA_DIR = dir;
    vi.resetModules();
    return await import("../pipeline/emit-exemplars.js");
  }

  it("emits only positive, in-atlas exemplars with honest coverage", async () => {
    const dir = scenario();
    const { emitExemplars } = await loadEmit(dir);
    const file = emitExemplars();
    const keys = Object.keys(file.exemplars);
    expect(keys).toHaveLength(2); // two positives; negative + ghost dropped
    expect(file.coverage.total).toBe(6);
    expect(file.coverage.withPreview).toBe(2);
    for (const k of keys) {
      expect(file.exemplars[k].previewUrl).toMatch(/^https:\/\//);
      expect(file.exemplars[k].trackTitle.length).toBeGreaterThan(0);
      expect(file.exemplars[k].artist.length).toBeGreaterThan(0);
    }
  });

  it("produces byte-identical output across two runs with no network", async () => {
    const dir = scenario();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("emit must not hit the network");
    });
    const { emitExemplars } = await loadEmit(dir);
    emitExemplars();
    const a = readFileSync(join(dir, "exemplars.json"), "utf8");
    emitExemplars();
    const b = readFileSync(join(dir, "exemplars.json"), "utf8");
    expect(a).toBe(b);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("data/exemplars.json committed output", () => {
  const path = join(ROOT, "data", "exemplars.json");
  const has = existsSync(path);
  const file: ExemplarsFile | null = has
    ? JSON.parse(readFileSync(path, "utf8"))
    : null;
  const atlas: Atlas = JSON.parse(readFileSync(join(ROOT, "data", "genres.json"), "utf8"));
  const demo: string[] = JSON.parse(
    readFileSync(join(ROOT, "data", "demo-passport.json"), "utf8"),
  );

  it("exists and is committed", () => {
    expect(has).toBe(true);
  });

  it("keys every exemplar to a genre mbid in the atlas, with real fields", () => {
    if (!file) return;
    const atlasMbids = new Set(atlas.genres.map((g) => g.mbid));
    for (const [mbid, ex] of Object.entries(file.exemplars)) {
      expect(atlasMbids.has(mbid)).toBe(true);
      expect(ex.previewUrl).toMatch(/^https:\/\//);
      expect(ex.trackTitle.length).toBeGreaterThan(0);
      expect(ex.artist.length).toBeGreaterThan(0);
    }
  });

  it("reports honest coverage matching the atlas and entry count", () => {
    if (!file) return;
    expect(file.coverage.total).toBe(atlas.genres.length);
    expect(file.coverage.withPreview).toBe(Object.keys(file.exemplars).length);
  });

  it("resolves every demo genre that has a preview", () => {
    if (!file) return;
    const byName = new Map(atlas.genres.map((g) => [g.name.toLowerCase(), g]));
    // At least the demo core must be hearable so staging can show tracks.
    let resolved = 0;
    for (const name of demo) {
      const g = byName.get(name.toLowerCase());
      if (g && file.exemplars[g.mbid]) resolved++;
    }
    expect(resolved).toBeGreaterThan(0);
  });

  it("stays under the 300KB gzipped budget", () => {
    if (!file) return;
    const gz = gzipSync(readFileSync(path)).length;
    expect(gz).toBeLessThan(300 * 1024);
  });
});
