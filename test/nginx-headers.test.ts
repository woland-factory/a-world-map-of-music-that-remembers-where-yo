import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// nginx.conf is the production static/SPA surface. These assertions guard the
// response security headers and the add_header inheritance gotcha: a location
// with its own add_header stops inheriting the server-level ones, so every
// Cache-Control location must re-declare the security headers.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const conf = readFileSync(join(ROOT, "nginx.conf"), "utf8");

const SECURITY = [
  'add_header X-Content-Type-Options "nosniff" always;',
  'add_header X-Frame-Options "DENY" always;',
  'add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
];

// Extract the body of a location block by its opening line.
function locationBody(opener: string): string {
  const start = conf.indexOf(opener);
  expect(start, `missing location: ${opener}`).toBeGreaterThanOrEqual(0);
  const braceStart = conf.indexOf("{", start);
  let depth = 0;
  for (let i = braceStart; i < conf.length; i++) {
    if (conf[i] === "{") depth++;
    else if (conf[i] === "}") {
      depth--;
      if (depth === 0) return conf.slice(braceStart + 1, i);
    }
  }
  throw new Error(`unbalanced braces after ${opener}`);
}

describe("nginx static surface headers", () => {
  it("sets the security headers at the server level with always", () => {
    for (const h of SECURITY) expect(conf).toContain(h);
  });

  it("turns off server_tokens so the nginx version never leaks", () => {
    expect(conf).toContain("server_tokens off;");
  });

  it("re-declares the security headers in every Cache-Control location", () => {
    for (const [opener, cache] of [
      ["location /data/", 'add_header Cache-Control "public, max-age=300";'],
      ["location = /env.js", 'add_header Cache-Control "no-store";'],
      ["location /assets/", 'add_header Cache-Control "public, max-age=31536000, immutable";'],
    ] as const) {
      const body = locationBody(opener);
      expect(body, `${opener} lost its Cache-Control`).toContain(cache);
      for (const h of SECURITY) {
        expect(body, `${opener} must re-declare ${h}`).toContain(h);
      }
    }
  });
});
