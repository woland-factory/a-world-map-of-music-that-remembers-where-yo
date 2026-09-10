import { fetchGenreRelations } from "./lib/mb.js";
import { readJsonl, appendJsonl } from "./lib/jsonl.js";
import { paths } from "./lib/paths.js";
import { loadGenresCache } from "./fetch-genres.js";
import type { RelationsRecord } from "./types.js";

// Stage 2 (best-effort boost, resumable): per-genre genre-rels. If the
// entity exposes no relationships the record is still written (empty), so
// the stage is idempotent and never re-fetches a completed genre.
export async function fetchRelations(): Promise<void> {
  const cache = loadGenresCache();
  const done = readJsonl<RelationsRecord>(paths.relations);
  const pending = cache.genres.filter((g) => !done.has(g.mbid));
  console.log(`fetch-relations: ${done.size} cached, ${pending.length} to fetch`);

  let n = 0;
  for (const g of pending) {
    let related: string[] = [];
    try {
      related = await fetchGenreRelations(g.mbid);
    } catch {
      related = [];
    }
    const rec: RelationsRecord = { mbid: g.mbid, name: g.name, related };
    appendJsonl(paths.relations, rec);
    n++;
    if (n % 25 === 0 || n === pending.length) {
      console.log(`fetch-relations: ${done.size + n}/${cache.genres.length}`);
    }
  }
}
