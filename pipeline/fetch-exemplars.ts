import { existsSync, readFileSync } from "node:fs";
import { searchExemplar } from "./lib/itunes.js";
import { readJsonl, appendJsonl } from "./lib/jsonl.js";
import { paths } from "./lib/paths.js";
import { PRIORITY_GENRES } from "./lib/priority.js";
import { loadGenresCache } from "./fetch-genres.js";
import type { ExemplarRecord } from "./types.js";

// Genre names the demo passport lights, so staging can hear and show
// tracks. Loaded from the committed demo file (falls back to none).
function demoNames(): string[] {
  try {
    if (!existsSync(paths.demoPassport)) return [];
    const parsed = JSON.parse(readFileSync(paths.demoPassport, "utf8"));
    return Array.isArray(parsed) ? parsed.map((n) => String(n).toLowerCase()) : [];
  } catch {
    return [];
  }
}

// Resumable network stage: resolve one iTunes preview per genre. One
// appended JSONL line per completed genre (positive or negative), so an
// interrupted run resumes without repeating work and re-running makes zero
// calls for already-cached genres.
export async function fetchExemplars(): Promise<void> {
  const cache = loadGenresCache();
  const done = readJsonl<ExemplarRecord & { mbid: string }>(paths.exemplars);

  // Front-load the priority core plus the demo genres so a partial run is
  // demo-ready; the rest follow in stable mbid order.
  const priority = new Set<string>([...PRIORITY_GENRES, ...demoNames()]);
  const rank = new Map([...priority].map((n, i) => [n, i] as const));
  const pending = cache.genres
    .filter((g) => !done.has(g.mbid))
    .sort((a, b) => {
      const ra = rank.get(a.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(b.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      return ra !== rb ? ra - rb : a.mbid.localeCompare(b.mbid);
    });
  console.log(`fetch-exemplars: ${done.size} cached, ${pending.length} to fetch`);

  let fetched = 0;
  let negative = 0;
  let failed = 0;
  for (const g of pending) {
    let hit;
    try {
      hit = await searchExemplar(g.name);
    } catch (err) {
      // Non-fatal: leave this genre uncached so the next pass retries it.
      failed++;
      console.warn(
        `fetch-exemplars: skipped "${g.name}" (${err instanceof Error ? err.message : err})`,
      );
      continue;
    }
    const rec: ExemplarRecord = hit
      ? {
          mbid: g.mbid,
          name: g.name,
          found: true,
          trackTitle: hit.trackTitle,
          artist: hit.artist,
          previewUrl: hit.previewUrl,
          ...(hit.artworkUrl ? { artworkUrl: hit.artworkUrl } : {}),
        }
      : { mbid: g.mbid, name: g.name, found: false };
    appendJsonl(paths.exemplars, rec);
    if (hit) fetched++;
    else negative++;
    const total = fetched + negative;
    if (total % 25 === 0) {
      console.log(`fetch-exemplars: ${done.size + total}/${cache.genres.length}`);
    }
  }
  console.log(
    `fetch-exemplars: pass done, ${fetched} fetched, ${negative} negative, ${failed} to retry next pass`,
  );
}
