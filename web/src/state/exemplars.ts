import type { Exemplar, ExemplarIndex, ExemplarsFile, Genre } from "../types";

// Load data/exemplars.json and index it by genre mbid. This runs in
// parallel with the map render and only gates audio, never the map.
export async function loadExemplars(): Promise<ExemplarIndex> {
  const index: ExemplarIndex = new Map();
  try {
    const res = await fetch("/data/exemplars.json", { cache: "no-store" });
    if (!res.ok) return index;
    const file = (await res.json()) as ExemplarsFile;
    for (const [mbid, ex] of Object.entries(file.exemplars ?? {})) {
      if (ex && typeof ex.previewUrl === "string") index.set(mbid, ex);
    }
  } catch {
    // No audio if exemplars fail to load; the map still works.
  }
  return index;
}

export function getExemplar(index: ExemplarIndex, genre: Genre): Exemplar | undefined {
  return index.get(genre.mbid);
}
