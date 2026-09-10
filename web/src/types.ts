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
