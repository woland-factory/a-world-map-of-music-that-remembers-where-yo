import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, "..", "..");

// Tests point ATLAS_DATA_DIR at a fixture dir; production uses repo data/.
export const DATA_DIR = process.env.ATLAS_DATA_DIR
  ? resolve(process.env.ATLAS_DATA_DIR)
  : join(ROOT, "data");
export const CACHE_DIR = join(DATA_DIR, "cache");

export const paths = {
  genresCache: join(CACHE_DIR, "genres.json"),
  cooccurrence: join(CACHE_DIR, "cooccurrence.jsonl"),
  relations: join(CACHE_DIR, "relations.jsonl"),
  atlas: join(DATA_DIR, "genres.json"),
  demoPassport: join(DATA_DIR, "demo-passport.json"),
};
