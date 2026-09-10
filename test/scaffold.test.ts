import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Atlas } from "../pipeline/types.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("demo passport resolves to real genres", () => {
  const atlas: Atlas = JSON.parse(readFileSync(join(ROOT, "data", "genres.json"), "utf8"));
  const names: string[] = JSON.parse(readFileSync(join(ROOT, "data", "demo-passport.json"), "utf8"));
  const byName = new Map(atlas.genres.map((g) => [g.name.toLowerCase(), g]));

  it("every demo name maps to a genre in the atlas", () => {
    for (const n of names) {
      expect(byName.has(n.toLowerCase())).toBe(true);
    }
  });

  it("lights enough genres to show roughly three neighborhoods", () => {
    const regions = new Set(names.map((n) => byName.get(n.toLowerCase())!.region));
    expect(names.length).toBeGreaterThanOrEqual(9);
    expect(regions.size).toBeGreaterThanOrEqual(2);
  });
});

describe(".env.example holds placeholders only", () => {
  const text = readFileSync(join(ROOT, ".env.example"), "utf8");

  it("contains no secret-looking values", () => {
    const secretLike = /=[A-Za-z0-9+/]{24,}={0,2}\s*$/m;
    expect(secretLike.test(text)).toBe(false);
  });

  it("leaves optional integration keys empty", () => {
    for (const key of ["SENTRY_DSN", "UMAMI_URL", "UMAMI_WEBSITE_ID"]) {
      const m = text.match(new RegExp(`^${key}=(.*)$`, "m"));
      expect(m).not.toBeNull();
      expect((m![1] ?? "").trim()).toBe("");
    }
  });
});
