// Shared shapes for the offline atlas pipeline and the emitted data file.

export interface RawGenre {
  mbid: string;
  name: string;
}

export interface GenresCache {
  fetchedAt: string; // ISO; used as the deterministic `generated` stamp on emit
  count: number;
  genres: RawGenre[];
}

// One line per completed genre in cache/cooccurrence.jsonl
export interface CooccurrenceRecord {
  mbid: string;
  name: string;
  // co-tag weight over other genre NAMES (lowercased); self excluded
  weights: Record<string, number>;
}

// One line per completed genre in cache/relations.jsonl
export interface RelationsRecord {
  mbid: string;
  name: string;
  related: string[]; // related genre NAMES (lowercased)
}

export interface Region {
  id: number;
  label: string;
}

export interface EmittedGenre {
  id: number;
  mbid: string;
  name: string;
  x: number;
  y: number;
  region: number;
  neighbors: number[];
}

export interface Atlas {
  version: 1;
  generated: string;
  source: "MusicBrainz";
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  regions: Region[];
  genres: EmittedGenre[];
}

// One line per completed genre in cache/exemplars.jsonl. A positive record
// carries the resolved iTunes preview; a negative one records that no
// preview exists so the genre is never refetched.
export type ExemplarRecord =
  | {
      mbid: string;
      name: string;
      found: true;
      trackTitle: string;
      artist: string;
      previewUrl: string;
      artworkUrl?: string;
    }
  | { mbid: string; name: string; found: false };

// A single emitted exemplar (positive only), keyed by mbid in the file.
export interface Exemplar {
  trackTitle: string;
  artist: string;
  previewUrl: string;
  artworkUrl?: string;
}

// data/exemplars.json — the committed output the client joins on genre.mbid.
export interface ExemplarsFile {
  version: 1;
  generated: string;
  source: "iTunes Search API";
  coverage: { total: number; withPreview: number };
  exemplars: Record<string, Exemplar>;
}
