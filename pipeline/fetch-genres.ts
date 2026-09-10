import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fetchGenrePage } from "./lib/mb.js";
import { paths } from "./lib/paths.js";
import type { GenresCache, RawGenre } from "./types.js";

// Stage 1: page through the full genre list. Cheap. Cached to
// data/cache/genres.json. Skips entirely if the cache already exists.
export async function fetchGenres(): Promise<GenresCache> {
  if (existsSync(paths.genresCache)) {
    return JSON.parse(readFileSync(paths.genresCache, "utf8")) as GenresCache;
  }

  const genres: RawGenre[] = [];
  let offset = 0;
  let count = Infinity;
  while (offset < count) {
    const page = await fetchGenrePage(offset);
    count = page.count;
    for (const g of page.genres) genres.push({ mbid: g.id, name: g.name });
    offset += 100;
    console.log(`fetch-genres: ${genres.length}/${count}`);
  }

  // Deterministic order regardless of paging.
  genres.sort((a, b) => a.mbid.localeCompare(b.mbid));

  const cache: GenresCache = {
    fetchedAt: new Date().toISOString(),
    count: genres.length,
    genres,
  };
  mkdirSync(dirname(paths.genresCache), { recursive: true });
  writeFileSync(paths.genresCache, JSON.stringify(cache, null, 2));
  console.log(`fetch-genres: wrote ${genres.length} genres`);
  return cache;
}

export function loadGenresCache(): GenresCache {
  if (!existsSync(paths.genresCache)) {
    throw new Error("Genre cache missing. Run the fetch-genres stage first.");
  }
  return JSON.parse(readFileSync(paths.genresCache, "utf8")) as GenresCache;
}
