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
    // Dare card strings (built in ui/dareCard.ts; placeholders filled in).
    "Where do you want to start?", // starter heading
    "Pick a sound you love. We dare you one step past it.", // starter body
    "Start with jazz", // starter chip aria-label
    "Today's dare", // dare label + collapsed pill label
    "Next to jazz on your map.", // dare border hint
    "Silent for now. Stamp it to cross the frontier.", // dare resting line
    "Play", // dare play control label
    "Play the dare", // dare play control aria-label
    "Stamp it", // dare primary action
    "3-day streak", // streak line (hyphen allowed)
    "Frontier moved.", // done heading
    "You crossed into techno.", // done body
    "New dare tomorrow.", // done note
    "See your map", // done / no-frontier action
    "You reached every neighbor.", // no-frontier heading
    "Tap the map to leap somewhere new.", // no-frontier body
    "Hide dare", // collapse control aria-label (expanded)
    "Show dare", // collapse control aria-label (collapsed)
    // First-run walkthrough steps and Skip control (built in ui/walkthrough.ts).
    "Pick a sound you love to start.", // dark step 1
    "Play your dare to hear it.", // dark step 2
    "Play today's dare to hear it.", // lit step 1
    "Stamp it to cross the frontier.", // shared final step
    "Skip", // skip button label
    "Skip the walkthrough", // skip button aria-label
    // ListenBrainz proxy errors (built in server/app.mjs).
    "That name has a character ListenBrainz skips. Check it, or tap any genre to stamp it yourself.",
    "ListenBrainz can't find that name. Check the spelling, or tap any genre to stamp it yourself.",
    "Lots of lookups right now. Wait a minute and try again.",
    "ListenBrainz didn't answer. Try again in a moment.",
    "The lookup broke on our side. Try again in a moment.",
    "Check the address and try again.",
    // Fill-from-ListenBrainz messages (built in state/listenbrainz.ts).
    "Type a ListenBrainz name first, or tap any genre to stamp it yourself.",
    "Looking up your genres.",
    "ListenBrainz is still adding up your stats. Try again later, or tap any genre to stamp it yourself.",
    "Your stats use tags this map skips. Tap any genre to stamp it yourself.",
    "Your map already shows those genres.",
    "Lit 1 new genre from your travels.",
    "Lit 24 new genres from your travels.",
    // Poster strings (built in poster/poster.ts and ui/posterModal.ts).
    "A world map of music", // poster title
    "412 of 2,197 genres lit", // poster count line
    "September 15, 2026 · music.example.org", // poster footer (middot separator)
    "The poster didn't print. Close this and try again.", // toBlob failure
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
