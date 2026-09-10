import type { Atlas } from "../types";
import { seedDemoEnabled } from "./env";

const PASSPORT_KEY = "passport";

export interface Passport {
  lit: number[];
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readPassport(): Passport | null {
  const store = safeStorage();
  if (!store) return null;
  const raw = store.getItem(PASSPORT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Passport;
    if (Array.isArray(parsed.lit)) return { lit: parsed.lit.filter((n) => Number.isInteger(n)) };
  } catch {
    // Corrupt storage: treat as no passport.
  }
  return null;
}

function writePassport(p: Passport): void {
  safeStorage()?.setItem(PASSPORT_KEY, JSON.stringify(p));
}

// Resolve committed demo passport (genre NAMES) to ids in the loaded atlas.
export async function loadDemoPassport(atlas: Atlas): Promise<Passport> {
  const byName = new Map<string, number>();
  for (const g of atlas.genres) byName.set(g.name.toLowerCase(), g.id);

  let names: string[] = [];
  try {
    const res = await fetch("/data/demo-passport.json", { cache: "no-store" });
    if (res.ok) names = (await res.json()) as string[];
  } catch {
    names = [];
  }
  const lit: number[] = [];
  for (const name of names) {
    const id = byName.get(String(name).toLowerCase());
    if (id !== undefined && !lit.includes(id)) lit.push(id);
  }
  return { lit };
}

// The passport that lights the map on load. On first visit with SEED_DEMO
// on, seed from the demo passport and persist it; otherwise use whatever
// the browser already holds (empty = all dark).
export async function resolveInitialPassport(atlas: Atlas): Promise<Passport> {
  const existing = readPassport();
  if (existing) return existing;

  if (seedDemoEnabled()) {
    const demo = await loadDemoPassport(atlas);
    if (demo.lit.length > 0) {
      writePassport(demo);
      return demo;
    }
  }
  return { lit: [] };
}

export function litSet(passport: Passport): Set<number> {
  return new Set(passport.lit);
}
