import type { Atlas, Exemplar, ExemplarIndex, Genre, Passport, Stamp } from "../types";
import { seedDemoEnabled } from "./env";

const PASSPORT_KEY = "passport";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 120; // cap imported track/artist strings

// Atlas-derived lookups, set once the atlas loads. Migration and import
// resolve stamps against these so a passport survives an atlas rebuild.
let byId = new Map<number, Genre>();
let byMbid = new Map<string, Genre>();
let atlasCount = 0;
let current: Passport = { version: 2, stamps: [] };

export function setAtlas(atlas: Atlas): void {
  byId = new Map(atlas.genres.map((g) => [g.id, g]));
  byMbid = new Map(atlas.genres.map((g) => [g.mbid, g]));
  atlasCount = atlas.genres.length;
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function today(): string {
  return formatLocalDate(new Date());
}

function clip(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return undefined;
  return s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) : s;
}

// Resolve one raw stamp against the loaded atlas. Prefers mbid (stable
// across atlas rebuilds). With mbidOnly (import), mbid is the sole
// authority so a stale genreId can never smuggle an absent stamp back in;
// otherwise it falls back to genreId. Returns null when nothing resolves.
// Repairs an invalid date to today so a stamp never shows garbage.
function resolveStamp(raw: unknown, mbidOnly: boolean): Stamp | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  let genre: Genre | undefined;
  if (typeof r.mbid === "string" && byMbid.has(r.mbid)) genre = byMbid.get(r.mbid);
  else if (!mbidOnly && Number.isInteger(r.genreId) && byId.has(r.genreId as number))
    genre = byId.get(r.genreId as number);
  if (!genre) return null;
  const date = typeof r.date === "string" && DATE_RE.test(r.date) ? r.date : today();
  const stamp: Stamp = { genreId: genre.id, mbid: genre.mbid, date };
  const trackTitle = clip(r.trackTitle);
  const artist = clip(r.artist);
  if (trackTitle) stamp.trackTitle = trackTitle;
  if (artist) stamp.artist = artist;
  return stamp;
}

function dedupe(stamps: Stamp[]): Stamp[] {
  const seen = new Set<number>();
  const out: Stamp[] = [];
  for (const s of stamps) {
    if (seen.has(s.genreId)) continue;
    seen.add(s.genreId);
    out.push(s);
  }
  return out;
}

// Forward-migrate any stored shape to v2, dropping unresolvable stamps.
// With mbidOnly (import), stamps resolve by mbid alone.
export function migratePassport(raw: unknown, mbidOnly = false): Passport {
  if (!raw || typeof raw !== "object") return { version: 2, stamps: [] };
  const r = raw as Record<string, unknown>;

  if (Array.isArray(r.stamps)) {
    const stamps = r.stamps
      .slice(0, Math.max(atlasCount, 1))
      .map((s) => resolveStamp(s, mbidOnly))
      .filter((s): s is Stamp => s !== null);
    return { version: 2, stamps: dedupe(stamps) };
  }

  // Legacy v1: { lit: number[] } -> dated stamps with no track fields.
  if (Array.isArray(r.lit)) {
    const t = today();
    const stamps: Stamp[] = [];
    for (const id of r.lit) {
      const g = Number.isInteger(id) ? byId.get(id as number) : undefined;
      if (g) stamps.push({ genreId: g.id, mbid: g.mbid, date: t });
    }
    return { version: 2, stamps: dedupe(stamps) };
  }

  return { version: 2, stamps: [] };
}

export function readPassport(): Passport | null {
  const store = safeStorage();
  if (!store) return null;
  const raw = store.getItem(PASSPORT_KEY);
  if (!raw) return null;
  try {
    return migratePassport(JSON.parse(raw));
  } catch {
    return null; // corrupt storage: treat as no passport
  }
}

function writePassport(p: Passport): void {
  safeStorage()?.setItem(PASSPORT_KEY, JSON.stringify(p));
}

export function getPassport(): Passport {
  return current;
}

export function isStamped(genreId: number): boolean {
  return current.stamps.some((s) => s.genreId === genreId);
}

export function stampFor(genreId: number): Stamp | undefined {
  return current.stamps.find((s) => s.genreId === genreId);
}

// Idempotent: no-op if already stamped. Records the local date and, when an
// exemplar exists, the track that earned the stamp. Persists synchronously.
export function addStamp(genreId: number, exemplar?: Exemplar): Passport {
  const g = byId.get(genreId);
  if (!g || isStamped(genreId)) return current;
  const stamp: Stamp = { genreId: g.id, mbid: g.mbid, date: today() };
  if (exemplar?.trackTitle) stamp.trackTitle = clip(exemplar.trackTitle);
  if (exemplar?.artist) stamp.artist = clip(exemplar.artist);
  current = { version: 2, stamps: [...current.stamps, stamp] };
  writePassport(current);
  return current;
}

export function removeStamp(genreId: number): Passport {
  current = { version: 2, stamps: current.stamps.filter((s) => s.genreId !== genreId) };
  writePassport(current);
  return current;
}

export function exportPassport(): string {
  return JSON.stringify(current, null, 2);
}

export type ImportResult = { ok: true; passport: Passport } | { ok: false };

// Validate at the boundary before replacing state. Never throws to the UI.
export function importPassport(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false };
  const r = parsed as Record<string, unknown>;
  // Must look like a passport we exported (v2 stamps) or a legacy v1 list.
  if (!Array.isArray(r.stamps) && !Array.isArray(r.lit)) return { ok: false };
  const passport = migratePassport(parsed, true);
  current = passport;
  writePassport(current);
  return { ok: true, passport };
}

export function litSet(passport: Passport): Set<number> {
  return new Set(passport.stamps.map((s) => s.genreId));
}

// Build dated demo stamps from genre NAMES, stepping the date back a few
// days per index so the passport view shows a plausible exploration history.
export function buildSeedStamps(
  atlas: Atlas,
  names: string[],
  exemplars: ExemplarIndex,
  base: Date,
): Stamp[] {
  const byName = new Map(atlas.genres.map((g) => [g.name.toLowerCase(), g]));
  const stamps: Stamp[] = [];
  const seen = new Set<number>();
  names.forEach((name, i) => {
    const g = byName.get(String(name).toLowerCase());
    if (!g || seen.has(g.id)) return;
    seen.add(g.id);
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const stamp: Stamp = { genreId: g.id, mbid: g.mbid, date: formatLocalDate(d) };
    const ex = exemplars.get(g.mbid);
    if (ex) {
      stamp.trackTitle = ex.trackTitle;
      stamp.artist = ex.artist;
    }
    stamps.push(stamp);
  });
  return stamps;
}

async function loadDemoNames(): Promise<string[]> {
  try {
    const res = await fetch("/data/demo-passport.json", { cache: "no-store" });
    if (!res.ok) return [];
    const parsed = await res.json();
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

// The passport that lights the map on load. Returns whatever the browser
// holds (migrated to v2). On a first visit with SEED_DEMO on, seed a rich
// demo passport with dates and tracks, and persist it.
export async function resolveInitialPassport(
  atlas: Atlas,
  exemplars?: Promise<ExemplarIndex>,
): Promise<Passport> {
  setAtlas(atlas);
  const existing = readPassport();
  if (existing) {
    current = existing;
    return current;
  }
  if (seedDemoEnabled()) {
    const names = await loadDemoNames();
    const index = exemplars ? await exemplars.catch(() => new Map<string, Exemplar>()) : new Map();
    const stamps = buildSeedStamps(atlas, names, index, new Date());
    if (stamps.length > 0) {
      current = { version: 2, stamps };
      writePassport(current);
      return current;
    }
  }
  current = { version: 2, stamps: [] };
  return current;
}
