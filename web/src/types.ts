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

// One completed dare: a crossing from lit territory into a new genre.
export interface FrontierEvent {
  genreId: number;
  mbid: string; // stable across atlas rebuilds (join key on import)
  date: string; // "YYYY-MM-DD" local, the day the crossing happened
}

// A consecutive-day streak of completed dares.
export interface Streak {
  count: number; // consecutive calendar days a dare was completed
  lastCompleted: string | null; // "YYYY-MM-DD" of the most recent completion
}

// Today's pinned dare. Pinned so it is stable across a mid-day lit change
// and across reload; recomputed only when the calendar day changes.
export interface DailyDare {
  date: string; // the calendar day this dare belongs to
  genreId: number;
  mbid: string;
  done: boolean; // completed (stamped) today
}

export interface Passport {
  version: 3;
  stamps: Stamp[]; // at most one per genre; genreId unique
  streak: Streak;
  frontierHistory: FrontierEvent[]; // ordered log of crossings
  dare: DailyDare | null; // recomputed when the calendar day changes
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
