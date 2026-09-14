import type { Atlas, ExemplarIndex, Genre, Passport, Streak } from "../types";
import { formatLocalDate } from "./passport";

// The preview URL to warm so the first Play on the pinned dare is instant.
// Null when there is no dare or the dare has no playable preview.
export function darePreviewUrl(
  passport: Passport,
  exemplars: ExemplarIndex,
  atlas: Atlas,
): string | null {
  const dare = passport.dare;
  if (!dare) return null;
  const genre = atlas.genres.find((g) => g.id === dare.genreId);
  if (!genre) return null;
  return exemplars.get(genre.mbid)?.previewUrl ?? null;
}

// Deterministic string hash (xmur3). Fixed so the daily pick is byte-stable
// across loads and across implementations.
export function xmur3(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

// Adjacency is undirected over genre.neighbors (a directed top-K list): a
// candidate g is on the frontier when a lit genre lists g, or g lists a lit
// genre. Returns ids of unstamped genres adjacent to the lit set.
export function adjacentUnstamped(
  atlas: Atlas,
  litSet: Set<number>,
  stampedSet: Set<number>,
): number[] {
  const byId = new Map(atlas.genres.map((g) => [g.id, g]));
  const cand = new Set<number>();
  for (const l of litSet) {
    const g = byId.get(l);
    if (!g) continue;
    for (const n of g.neighbors) if (!stampedSet.has(n)) cand.add(n);
  }
  for (const g of atlas.genres) {
    if (stampedSet.has(g.id) || litSet.has(g.id)) continue;
    if (g.neighbors.some((n) => litSet.has(n))) cand.add(g.id);
  }
  return [...cand];
}

// Deterministic daily pick. Prefers a genre with a playable preview, falls
// back to any adjacent genre, sorts by mbid for a stable order, and indexes
// by a date-seeded hash so it is identical all day and shifts the next day.
export function pickDare(
  atlas: Atlas,
  litSet: Set<number>,
  stampedSet: Set<number>,
  exemplars: ExemplarIndex,
  today: string,
): Genre | null {
  const ids = adjacentUnstamped(atlas, litSet, stampedSet);
  if (ids.length === 0) return null;
  const byId = new Map(atlas.genres.map((g) => [g.id, g]));
  const genres = ids.map((id) => byId.get(id)).filter((g): g is Genre => !!g);
  const playable = genres.filter((g) => exemplars.has(g.mbid));
  const pool = (playable.length ? playable : genres)
    .slice()
    .sort((a, b) => (a.mbid < b.mbid ? -1 : a.mbid > b.mbid ? 1 : 0));
  return pool[xmur3(today) % pool.length];
}

// Name of one lit genre adjacent to a given genre (either direction), for the
// dare's "Next to {name}" hint. Null when none resolves.
export function oneLitNeighbor(atlas: Atlas, litSet: Set<number>, genreId: number): Genre | null {
  const byId = new Map(atlas.genres.map((g) => [g.id, g]));
  const g = byId.get(genreId);
  if (!g) return null;
  for (const n of g.neighbors) {
    if (litSet.has(n)) return byId.get(n) ?? null;
  }
  for (const other of atlas.genres) {
    if (litSet.has(other.id) && other.neighbors.includes(genreId)) return other;
  }
  return null;
}

// The day before a "YYYY-MM-DD" date, computed via Date so month/year roll
// over correctly, then reformatted local.
export function yesterday(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return formatLocalDate(dt);
}

// Pure streak transition. Same day: unchanged. Yesterday: +1. Gap or first
// ever: restart at 1. Never mutates its input.
export function updateStreak(streak: Streak, today: string): Streak {
  if (streak.lastCompleted === today) return { ...streak };
  if (streak.lastCompleted === yesterday(today)) {
    return { count: streak.count + 1, lastCompleted: today };
  }
  return { count: 1, lastCompleted: today };
}

// The streak to show today: the stored count when the last completion was
// today or yesterday, else 0 (a missed day breaks the visible streak).
export function currentStreak(passport: Passport, today: string): number {
  const s = passport.streak;
  if (!s) return 0;
  if (s.lastCompleted === today || s.lastCompleted === yesterday(today)) return s.count;
  return 0;
}

// Starting genres for an empty passport: recognizable anchors first, each
// kept only if it has a playable preview and a playable neighbor (so the
// first dare is never a dead end). Tops up to six, most-connected first.
export function starterGenres(atlas: Atlas, exemplars: ExemplarIndex): Genre[] {
  const byId = new Map(atlas.genres.map((g) => [g.id, g]));
  const byName = new Map(atlas.genres.map((g) => [g.name.toLowerCase(), g]));
  const playable = (g: Genre): boolean => exemplars.has(g.mbid);

  // One pass: which genres have at least one playable neighbor (undirected)?
  const hasPlayableNeighbor = new Set<number>();
  for (const g of atlas.genres) {
    const gPlayable = playable(g);
    for (const n of g.neighbors) {
      const nb = byId.get(n);
      if (!nb) continue;
      if (playable(nb)) hasPlayableNeighbor.add(g.id); // forward: g -> playable nb
      if (gPlayable) hasPlayableNeighbor.add(nb.id); // reverse: nb -> playable g
    }
  }
  const eligible = (g: Genre): boolean => playable(g) && hasPlayableNeighbor.has(g.id);

  const prefer = ["jazz", "techno", "house", "heavy metal", "blues", "trance"];
  const chosen: Genre[] = [];
  const seen = new Set<number>();
  for (const name of prefer) {
    const g = byName.get(name);
    if (g && !seen.has(g.id) && eligible(g)) {
      chosen.push(g);
      seen.add(g.id);
    }
  }
  if (chosen.length < 4) {
    const rest = atlas.genres
      .filter((g) => !seen.has(g.id) && eligible(g))
      .sort((a, b) => b.neighbors.length - a.neighbors.length || (a.mbid < b.mbid ? -1 : 1));
    for (const g of rest) {
      if (chosen.length >= 6) break;
      chosen.push(g);
      seen.add(g.id);
    }
  }
  return chosen.slice(0, 6);
}
