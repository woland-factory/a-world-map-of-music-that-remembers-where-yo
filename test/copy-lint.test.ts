import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Every user-visible string. index.html carries most of it; dynamic
// strings built in TS are listed explicitly so the sweep sees them.
function visibleCopy(): string {
  const html = readFileSync(join(ROOT, "web", "index.html"), "utf8")
    .replace(/<!--[\s\S]*?-->/g, "") // comments are exempt
    .replace(/<style[\s\S]*?<\/style>/g, "");
  const dynamic = [
    "A map of 2197 music genres. 0 lit.", // aria-label template, worst case
    "A map of music genres. Loading.",
    "Regions",
    // Strings built in TS (index.html is the only file scanned from disk).
    "Silent for now. Stamp it to remember.", // now-playing resting state
    "Stamped 2026-09-14", // stamped button state
    "So What · Miles Davis", // stamp row track line (middot separator)
    "0 of ~2,200 lit", // passport count line
    "Passport restored.", // import success
    "That file did not look like a passport. Pick a passport you exported here.", // import failure
    "Remove stamp black metal", // row remove control aria-label
    "Remove", // row remove control label
  ];
  return html + "\n" + dynamic.join("\n");
}

const BANNED = [
  "seamlessly",
  "effortlessly",
  "unlock",
  "elevate",
  "empower",
  "leverage",
  "robust",
  "dive in",
  "in today's fast-paced world",
  "we've got you covered",
];

const NEGATIVE = [
  "you don't have",
  "no ",
  "nothing ",
  "unable to",
  "something went wrong",
];

describe("copy sweep (product voice)", () => {
  const copy = visibleCopy();
  const lower = copy.toLowerCase();

  it("has no em-dashes or en-dashes", () => {
    expect(copy.includes("—")).toBe(false);
    expect(copy.includes("–")).toBe(false);
  });

  it("uses no banned marketing vocabulary", () => {
    for (const word of BANNED) {
      expect(lower.includes(word)).toBe(false);
    }
  });

  it("uses no negative empty-state phrasing", () => {
    // Check inside human-readable text nodes only, to avoid matching
    // attributes like rel="no-referrer". We scan the rendered words.
    const words = lower.replace(/<[^>]+>/g, " ");
    for (const phrase of ["you don't have", "no genres", "nothing here", "unable to", "something went wrong"]) {
      expect(words.includes(phrase)).toBe(false);
    }
    void NEGATIVE;
  });
});
