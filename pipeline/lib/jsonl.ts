import { existsSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Append-only JSONL cache: one record per line, keyed by mbid. Reading
// returns the last record per mbid so a resumed run never re-fetches.

export function readJsonl<T extends { mbid: string }>(file: string): Map<string, T> {
  const out = new Map<string, T>();
  if (!existsSync(file)) return out;
  const text = readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const rec = JSON.parse(trimmed) as T;
      if (rec && rec.mbid) out.set(rec.mbid, rec);
    } catch {
      // Skip a partially-written final line from an interrupted run.
    }
  }
  return out;
}

export function appendJsonl<T>(file: string, rec: T): void {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(rec) + "\n");
}
