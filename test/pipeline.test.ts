import { describe, it, expect, beforeAll, vi } from "vitest";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

// paths.ts reads ATLAS_DATA_DIR at import, so set it before importing.
async function loadPipeline(dataDir: string) {
  process.env.ATLAS_DATA_DIR = dataDir;
  vi.resetModules();
  const emit = await import("../pipeline/emit.js");
  const cooc = await import("../pipeline/fetch-cooccurrence.js");
  return { ...emit, ...cooc };
}

describe("pipeline: deterministic, resumable, incremental", () => {
  beforeAll(() => {
    process.env.MUSICBRAINZ_CONTACT = "test@example.com";
  });

  it("emits a valid atlas from cache with no network calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("network call during compute");
    });
    const { buildAtlas } = await loadPipeline(FIXTURE);
    const atlas = buildAtlas();

    expect(atlas.genres).toHaveLength(6);
    for (const g of atlas.genres) {
      expect(Number.isFinite(g.x)).toBe(true);
      expect(Number.isFinite(g.y)).toBe(true);
      expect(atlas.regions.some((r) => r.id === g.region)).toBe(true);
      expect(g.neighbors.length).toBeLessThanOrEqual(10);
      for (const n of g.neighbors) {
        expect(atlas.genres.some((x) => x.id === n)).toBe(true);
      }
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("produces byte-identical output across two runs from the same cache", async () => {
    const { buildAtlas } = await loadPipeline(FIXTURE);
    const a = JSON.stringify(buildAtlas());
    const b = JSON.stringify(buildAtlas());
    expect(a).toBe(b);
  });

  it("covers every genre even when co-occurrence is partial", async () => {
    // Copy the fixture but drop co-occurrence for some genres.
    const dir = mkdtempSync(join(tmpdir(), "atlas-"));
    mkdirSync(join(dir, "cache"), { recursive: true });
    copyFileSync(join(FIXTURE, "cache", "genres.json"), join(dir, "cache", "genres.json"));
    const full = readFileSync(join(FIXTURE, "cache", "cooccurrence.jsonl"), "utf8")
      .trim()
      .split("\n");
    // Keep only the first three genres' vectors.
    writeFileSync(join(dir, "cache", "cooccurrence.jsonl"), full.slice(0, 3).join("\n") + "\n");

    const { buildAtlas } = await loadPipeline(dir);
    const atlas = buildAtlas();
    expect(atlas.genres).toHaveLength(6); // every genre still present
    const names = atlas.genres.map((g) => g.name).sort();
    expect(names).toContain("bebop"); // a genre with no co-occurrence vector
  });

  it("re-running the fetch stage makes zero network calls when fully cached", async () => {
    const { fetchCooccurrence } = await loadPipeline(FIXTURE);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("should not fetch when cache is complete");
    });
    await fetchCooccurrence(); // all 6 cached -> nothing to fetch
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
