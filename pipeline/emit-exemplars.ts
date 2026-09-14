import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { readJsonl } from "./lib/jsonl.js";
import { paths } from "./lib/paths.js";
import { loadGenresCache } from "./fetch-genres.js";
import type { Atlas, Exemplar, ExemplarRecord, ExemplarsFile } from "./types.js";

function loadAtlas(): Atlas {
  return JSON.parse(readFileSync(paths.atlas, "utf8")) as Atlas;
}

// Deterministic compute stage: write data/exemplars.json from the cache
// and the committed atlas, with only positive exemplars keyed by mbid.
// Same cache in, byte-identical file out, zero network calls.
export function emitExemplars(): ExemplarsFile {
  const atlas = loadAtlas();
  const atlasMbids = new Set(atlas.genres.map((g) => g.mbid));
  const cache = readJsonl<ExemplarRecord & { mbid: string }>(paths.exemplars);

  const exemplars: Record<string, Exemplar> = {};
  // Sort keys by mbid so output is stable across runs.
  const mbids = [...cache.keys()].sort((a, b) => a.localeCompare(b));
  for (const mbid of mbids) {
    if (!atlasMbids.has(mbid)) continue; // drop genres no longer in the atlas
    const rec = cache.get(mbid)!;
    if (!rec.found) continue;
    if (!rec.previewUrl || !rec.trackTitle || !rec.artist) continue;
    const entry: Exemplar = {
      trackTitle: rec.trackTitle,
      artist: rec.artist,
      previewUrl: rec.previewUrl,
    };
    if (rec.artworkUrl) entry.artworkUrl = rec.artworkUrl;
    exemplars[mbid] = entry;
  }

  const file: ExemplarsFile = {
    version: 1,
    generated: loadGenresCache().fetchedAt,
    source: "iTunes Search API",
    coverage: { total: atlas.genres.length, withPreview: Object.keys(exemplars).length },
    exemplars,
  };

  mkdirSync(dirname(paths.exemplarsFile), { recursive: true });
  writeFileSync(paths.exemplarsFile, JSON.stringify(file));
  console.log(
    `emit-exemplars: wrote ${file.coverage.withPreview}/${file.coverage.total} previews`,
  );
  return file;
}
