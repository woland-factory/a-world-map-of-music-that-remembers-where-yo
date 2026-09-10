import { fetchArtistsByTag } from "./lib/mb.js";
import { readJsonl, appendJsonl } from "./lib/jsonl.js";
import { paths } from "./lib/paths.js";
import { loadGenresCache } from "./fetch-genres.js";
import type { CooccurrenceRecord } from "./types.js";

// Stage 3 (heavy, resumable): for each genre, fetch up to 100 tagged
// artists and accumulate a weighted count of every OTHER tag that is
// itself a known genre. One appended line per completed genre, so an
// interrupted run resumes without repeating work.
export async function fetchCooccurrence(): Promise<void> {
  const cache = loadGenresCache();
  const genreNames = new Set(cache.genres.map((g) => g.name.toLowerCase()));
  const done = readJsonl<CooccurrenceRecord>(paths.cooccurrence);

  // Front-load a core set (the ground-truth genres the layout is judged on
  // and the demo passport) so a partial run still yields a meaningful,
  // testable map. The rest follow in cache order.
  const PRIORITY = [
    "black metal", "death metal", "thrash metal", "doom metal", "heavy metal",
    "progressive metal", "power metal", "speed metal", "groove metal",
    "jazz", "blues", "bebop", "swing", "hard bop", "cool jazz", "delta blues",
    "chicago blues", "free jazz", "jazz fusion",
    "progressive rock", "zeuhl", "krautrock", "psychedelic rock", "art rock",
    "techno", "house", "deep house", "detroit techno", "trance", "ambient",
    "drum and bass", "dub techno", "acid house", "minimal techno",
  ];
  const rank = new Map(PRIORITY.map((n, i) => [n, i] as const));
  const pending = cache.genres
    .filter((g) => !done.has(g.mbid))
    .sort((a, b) => {
      const ra = rank.get(a.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(b.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      return ra !== rb ? ra - rb : a.mbid.localeCompare(b.mbid);
    });
  console.log(`fetch-cooccurrence: ${done.size} cached, ${pending.length} to fetch`);

  let n = 0;
  let failed = 0;
  for (const g of pending) {
    let artists;
    try {
      artists = await fetchArtistsByTag(g.name);
    } catch (err) {
      // Non-fatal: leave this genre uncached so the next pass retries it.
      failed++;
      console.warn(`fetch-cooccurrence: skipped "${g.name}" (${err instanceof Error ? err.message : err})`);
      continue;
    }
    const weights: Record<string, number> = {};
    const self = g.name.toLowerCase();
    for (const artist of artists) {
      for (const tag of artist.tags) {
        const name = tag.name.toLowerCase();
        if (name === self) continue;
        if (!genreNames.has(name)) continue; // only co-tags that are genres
        const w = Math.max(1, tag.count ?? 1);
        weights[name] = (weights[name] ?? 0) + w;
      }
    }
    const rec: CooccurrenceRecord = { mbid: g.mbid, name: g.name, weights };
    appendJsonl(paths.cooccurrence, rec);
    n++;
    if (n % 25 === 0 || n === pending.length - failed) {
      console.log(`fetch-cooccurrence: ${done.size + n}/${cache.genres.length}`);
    }
  }
  console.log(`fetch-cooccurrence: pass done, ${n} fetched, ${failed} to retry next pass`);
}
