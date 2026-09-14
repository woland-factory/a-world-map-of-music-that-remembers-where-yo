export interface Region {
  id: number;
  label: string;
}

export interface Genre {
  id: number;
  mbid: string;
  name: string;
  x: number;
  y: number;
  region: number;
  neighbors: number[];
}

export interface Atlas {
  version: number;
  generated: string;
  source: string;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  regions: Region[];
  genres: Genre[];
}

// One iTunes exemplar, joined to a genre by mbid.
export interface Exemplar {
  trackTitle: string;
  artist: string;
  previewUrl: string;
  artworkUrl?: string;
}

export interface ExemplarsFile {
  version: number;
  generated: string;
  source: string;
  coverage: { total: number; withPreview: number };
  exemplars: Record<string, Exemplar>;
}

// A ready lookup of exemplars by genre mbid.
export type ExemplarIndex = Map<string, Exemplar>;

// A single stamp: a genre you heard and kept, with the day and track.
export interface Stamp {
  genreId: number; // atlas id, for fast lit lookup this session
  mbid: string; // stable across atlas rebuilds (join key on import)
  date: string; // first-listen date, "YYYY-MM-DD" (local)
  trackTitle?: string;
  artist?: string;
}

export interface Passport {
  version: 2;
  stamps: Stamp[]; // at most one per genre; genreId unique
}

export interface AppEnv {
  SEED_DEMO?: string;
  SENTRY_DSN?: string;
  UMAMI_URL?: string;
  UMAMI_WEBSITE_ID?: string;
}

declare global {
  interface Window {
    __ENV__?: AppEnv;
  }
}
