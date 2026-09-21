import type {
  Atlas,
  DailyDare,
  Exemplar,
  ExemplarIndex,
  FrontierEvent,
  Genre,
  Passport,
  Stamp,
  Streak,
} from "../types";
import { seedDemoEnabled } from "./env";
import { pickDare, updateStreak, yesterday } from "./dare";

const PASSPORT_KEY = "passport";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 120; // cap imported track/artist strings

// Atlas-derived lookups, set once the atlas loads. Migration and import
// resolve stamps against these so a passport survives an atlas rebuild.
let byId = new Map<number, Genre>();
let byMbid = new Map<string, Genre>();
let atlasCount = 0;

function emptyStreak(): Streak {
  return { count: 0, lastCompleted: null };
}

function emptyPassport(): Passport {
  return { version: 3, stamps: [], streak: emptyStreak(), frontierHistory: [], dare: null };
}

let current: Passport = emptyPassport();

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

// The local calendar date, for callers outside this module (main wiring).
export function todayString(): string {
  return today();
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

// Validate a stored streak: non-negative integer count, a valid date or null.
function migrateStreak(raw: unknown): Streak {
  if (!raw || typeof raw !== "object") return emptyStreak();
  const r = raw as Record<string, unknown>;
  const count =
    typeof r.count === "number" && Number.isFinite(r.count) ? Math.max(0, Math.floor(r.count)) : 0;
  const lastCompleted =
    typeof r.lastCompleted === "string" && DATE_RE.test(r.lastCompleted) ? r.lastCompleted : null;
  return { count, lastCompleted };
}

// Resolve stored frontier events against the atlas (mbid is authority),
// dropping the unresolvable, deduping per date+genre, capped at atlas size.
function migrateFrontier(raw: unknown, mbidOnly: boolean): FrontierEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: FrontierEvent[] = [];
  const seen = new Set<string>();
  for (const e of raw.slice(0, Math.max(atlasCount, 1))) {
    if (!e || typeof e !== "object") continue;
    const r = e as Record<string, unknown>;
    let genre: Genre | undefined;
    if (typeof r.mbid === "string" && byMbid.has(r.mbid)) genre = byMbid.get(r.mbid);
    else if (!mbidOnly && Number.isInteger(r.genreId) && byId.has(r.genreId as number))
      genre = byId.get(r.genreId as number);
    if (!genre) continue;
    if (typeof r.date !== "string" || !DATE_RE.test(r.date)) continue;
    const key = `${r.date}:${genre.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ genreId: genre.id, mbid: genre.mbid, date: r.date });
  }
  return out;
}

// Keep a pinned dare only if its genre resolves and its date is valid.
function migrateDare(raw: unknown, mbidOnly: boolean): DailyDare | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  let genre: Genre | undefined;
  if (typeof r.mbid === "string" && byMbid.has(r.mbid)) genre = byMbid.get(r.mbid);
  else if (!mbidOnly && Number.isInteger(r.genreId) && byId.has(r.genreId as number))
    genre = byId.get(r.genreId as number);
  if (!genre) return null;
  if (typeof r.date !== "string" || !DATE_RE.test(r.date)) return null;
  return { date: r.date, genreId: genre.id, mbid: genre.mbid, done: r.done === true };
}

// Forward-migrate any stored shape (v3/v2/v1/corrupt) to v3, dropping
// unresolvable data. With mbidOnly (import), everything resolves by mbid
// alone. v2 and v1 have no streak/frontier/dare, so those default to empty.
export function migratePassport(raw: unknown, mbidOnly = false): Passport {
  if (!raw || typeof raw !== "object") return emptyPassport();
  const r = raw as Record<string, unknown>;

  if (Array.isArray(r.stamps)) {
    const stamps = dedupe(
      r.stamps
        .slice(0, Math.max(atlasCount, 1))
        .map((s) => resolveStamp(s, mbidOnly))
        .filter((s): s is Stamp => s !== null),
    );
    return {
      version: 3,
      stamps,
      streak: migrateStreak(r.streak),
      frontierHistory: migrateFrontier(r.frontierHistory, mbidOnly),
      dare: migrateDare(r.dare, mbidOnly),
    };
  }

  // Legacy v1: { lit: number[] } -> dated stamps with no track fields.
  if (Array.isArray(r.lit)) {
    const t = today();
    const stamps: Stamp[] = [];
    for (const id of r.lit) {
      const g = Number.isInteger(id) ? byId.get(id as number) : undefined;
      if (g) stamps.push({ genreId: g.id, mbid: g.mbid, date: t });
    }
    return {
      version: 3,
      stamps: dedupe(stamps),
      streak: emptyStreak(),
      frontierHistory: [],
      dare: null,
    };
  }

  return emptyPassport();
}

// True when a passport was already in storage when the page loaded. Read
// BEFORE resolveInitialPassport so a SEED_DEMO write never masks a genuine
// first visit. Never throws when storage is unavailable.
export function hasStoredPassport(): boolean {
  const store = safeStorage();
  if (!store) return false;
  try {
    return store.getItem(PASSPORT_KEY) !== null;
  } catch {
    return false;
  }
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
  // Preserve streak, frontier history, and the pinned dare across a stamp.
  current = { ...current, version: 3, stamps: [...current.stamps, stamp] };
  writePassport(current);
  return current;
}

// Batch stamping for the ListenBrainz fill: resolves each mbid against the
// atlas, skips unknown and already-stamped genres, appends the rest dated
// today with no track fields (the map did not play those tracks and must
// not claim it did), and persists with exactly ONE storage write. Returns
// the number of stamps added. Never touches the streak or the dare.
export function addStamps(mbids: string[]): number {
  const t = today();
  const stamped = new Set(current.stamps.map((s) => s.genreId));
  const added: Stamp[] = [];
  for (const mbid of mbids) {
    const g = byMbid.get(mbid);
    if (!g || stamped.has(g.id)) continue;
    stamped.add(g.id);
    added.push({ genreId: g.id, mbid: g.mbid, date: t });
  }
  if (added.length === 0) return 0;
  current = { ...current, version: 3, stamps: [...current.stamps, ...added] };
  writePassport(current);
  return added.length;
}

// Un-stamping un-lights a dot but never rolls back the streak or the frontier
// history: those record that you did explore that day, honestly.
export function removeStamp(genreId: number): Passport {
  current = { ...current, version: 3, stamps: current.stamps.filter((s) => s.genreId !== genreId) };
  writePassport(current);
  return current;
}

export function getStreak(): Streak {
  return current.streak;
}

export function getFrontierHistory(): FrontierEvent[] {
  return current.frontierHistory;
}

export function getDare(): DailyDare | null {
  return current.dare;
}

// Pin today's dare into the passport so it is stable across a mid-day lit
// change and across reload. Recomputes only when the calendar day changes or
// the pinned genre no longer resolves. Marks it done when its genre is lit
// (for example stamped from the map). Persists synchronously.
export function ensureDare(
  atlas: Atlas,
  exemplars: ExemplarIndex,
  todayStr: string = today(),
): DailyDare | null {
  const stamped = litSet(current);
  const d = current.dare;
  if (d && d.date === todayStr && byId.has(d.genreId)) {
    if (stamped.has(d.genreId) && !d.done) {
      current = { ...current, dare: { ...d, done: true } };
      writePassport(current);
    }
    return current.dare;
  }
  const picked = pickDare(atlas, stamped, stamped, exemplars, todayStr);
  const dare: DailyDare | null = picked
    ? { date: todayStr, genreId: picked.id, mbid: picked.mbid, done: false }
    : null;
  current = { ...current, dare };
  writePassport(current);
  return dare;
}

// Complete today's dare exactly once: bump the streak (idempotent per day),
// append one frontier crossing (deduped per date+genre), mark the dare done.
// A no-op when there is no matching, unfinished dare.
export function completeDare(genreId: number, todayStr: string = today()): Passport {
  const p = current;
  if (!p.dare || p.dare.genreId !== genreId || p.dare.done) return current;
  const streak = updateStreak(p.streak, todayStr);
  const frontierHistory = p.frontierHistory.slice();
  if (!frontierHistory.some((e) => e.date === todayStr && e.genreId === genreId)) {
    frontierHistory.push({ genreId, mbid: p.dare.mbid, date: todayStr });
  }
  current = { ...p, version: 3, streak, frontierHistory, dare: { ...p.dare, done: true } };
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

// Build the full v3 demo passport from genre names: dated stamps plus a small
// synthesized streak and frontier history so staging shows a live streak
// (lastCompleted = yesterday) and an obvious frontier to cross. Deterministic
// in (names, base). Returns null when no name resolves.
export function buildSeedPassport(
  atlas: Atlas,
  names: string[],
  exemplars: ExemplarIndex,
  base: Date,
): Passport | null {
  const stamps = buildSeedStamps(atlas, names, exemplars, base);
  if (stamps.length === 0) return null;
  const t = formatLocalDate(base);
  const frontierHistory: FrontierEvent[] = [];
  for (let i = 0; i < Math.min(3, stamps.length); i++) {
    const d = new Date(base);
    d.setDate(d.getDate() - (1 + i)); // newest crossing is yesterday
    frontierHistory.push({ genreId: stamps[i].genreId, mbid: stamps[i].mbid, date: formatLocalDate(d) });
  }
  return {
    version: 3,
    stamps,
    streak: { count: 3, lastCompleted: yesterday(t) },
    frontierHistory,
    dare: null, // ensureDare computes today's dare from the seeded territory
  };
}

async function loadDemoNames(): Promise<string[]> {
  try {
    const res = await fetch("/data/demo-passport.json");
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
    const seeded = buildSeedPassport(atlas, names, index, new Date());
    if (seeded) {
      current = seeded;
      writePassport(current);
      return current;
    }
  }
  current = emptyPassport();
  return current;
}
