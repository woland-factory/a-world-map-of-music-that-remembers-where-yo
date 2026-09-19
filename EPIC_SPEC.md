# EPIC SPEC: First-run guided walkthrough

A skippable guided path that walks a brand-new visitor through lighting
their first corner of the map, anchored to the real controls, one short
step at a time. It appears only on a first visit, runs until the first
frontier crossing, and never shows again.

This EPIC replaces the current static first-run card (`#orientation` /
`maybeShowOrientation`) with an in-context coach mark. The old card is a
single block of text the user reads and dismisses. The planner asks for
the opposite: a path pinned to the actual buttons that advances as the
user acts. Keeping both would give a new user two competing first-run
surfaces, which breaks QUALITY BAR §7 (one obvious action) and the EPIC
non-goal "no persistent help overlay." So the old card is removed and its
job is done by the walkthrough. No new feature beyond the walkthrough is
in scope.

## Quality differentiator (restated, binding)

Delight through tactility: an instant, alive map you can hear. Touch
anywhere and it plays, your own territory glows out of the dark, and the
frontier visibly moves when you cross it. We win on the felt experience of
a map you can hear and a world you are visibly filling in.

What it demands of THIS EPIC: the walkthrough must make the new user
*feel* the loop, not read about it. Within the first minute it makes them
hear a genre, watch a dot light, and watch the frontier move one step into
the dark. The coach mark points at the live control and gets out of the
way. It never dims the map into a slideshow, never blocks a tap, and
disappears the instant the user crosses their first frontier. The step
copy is an imperative pointing at a button, never a paragraph explaining
the product.

## Scope

In scope:

- A new non-modal coach-mark controller, `web/src/ui/walkthrough.ts`,
  that highlights ONE real, on-screen control at a time with a one-
  sentence caption plus a Skip control, and advances as the user performs
  the real action.
- Two short step scripts, chosen by whether the map starts dark or already
  lit (SEED_DEMO), both anchored to the dare card's real controls:
  - Dark first visit (empty passport): pick a starter, play the dare,
    stamp it. Three steps.
  - Lit first visit (seeded/staging): play the dare, stamp it. Two steps.
- A first-visit gate and a one-time completion flag so the path shows only
  on a genuine first visit and never again after the first crossing or a
  Skip.
- Wiring in `web/src/main.ts` so the controller advances off the events
  the app already fires (a preview started, the passport changed, the dare
  was completed). No new event plumbing beyond two notify calls.
- Removal of the old orientation surface: markup in `web/index.html`, the
  `maybeShowOrientation` function and `ORIENTATION_KEY` in
  `web/src/ui/states.ts`, the `.orientation` CSS, the `#got-it` dismissal
  in `scripts/shoot.mjs`, and the orientation e2e test.
- Styles for the coach mark (existing tokens; 44px Skip target; visible
  focus; reduced-motion respected).
- Tests: pure-logic unit tests, an end-to-end walkthrough spec, a
  one-line walkthrough-suppression helper added to the existing e2e specs
  so they keep testing their own feature, and copy-lint additions.

Out of scope (binding non-goals, from the planner):

- No multi-page tutorial. The path is at most three one-sentence steps.
- No video, no animation showreel.
- No persistent help overlay, "?" button, replay control, or re-open
  affordance after the first crossing. Once done, the surface is gone for
  good.
- No new passport fields and no passport schema change. The only new
  stored value is a single boolean flag in its own localStorage key.
- No analytics/telemetry events for the walkthrough (keep it minimal).
- No change to the map, audio, dare logic, ListenBrainz fill, or poster
  beyond the two notify calls the controller needs.

## Quality bar focus for this EPIC

- **First-run (§4).** This EPIC *is* the §4 "walk the first success"
  clause. The path is 2 to 4 steps, each one short imperative sentence
  anchored to a real control, skippable at any step, shown only until the
  first success, never again for a returning user.
- **Radically simple (§7).** One highlighted next step at a time. The
  caption is a single imperative. No essay, no tooltip stack.
- **Perceived speed (§1).** The coach mark never delays first render. It
  appears only after the map is interactive and the dare card has drawn,
  and it never blocks a tap on the control it points at.
- **Mobile-first (§2) + Accessibility (§6).** Usable at 390px with no
  horizontal scroll, Skip target at least 44px, focus moves to the
  highlighted control with a visible focus ring, each step announced via
  `aria-live`, keyboard reaches Skip and the control.
- **Copy (§8).** Every step string and the Skip label are swept clean and
  added to `test/copy-lint.test.ts`.

## Technical design

### Data model

No migration. The passport stays at v3, untouched. The only new persisted
value is a standalone flag:

- localStorage key `walkthrough-done`, value `"1"` once the walk finishes
  (first crossing) or is skipped. Absent otherwise. Reads and writes are
  wrapped in try/catch exactly like the existing `orientation-dismissed`
  flag was, so private-mode storage failures never throw.

### First-visit gate (the "never again" logic)

The path shows if and only if BOTH hold:

1. **First visit**: no passport was in storage when the page loaded. This
   is captured BEFORE `resolveInitialPassport` runs, because SEED_DEMO
   writes a demo passport on first load and would otherwise mask a first
   visit. Add `export function hasStoredPassport(): boolean` to
   `web/src/state/passport.ts` (true when the `passport` key is present in
   `safeStorage()`), and in `main.ts` compute
   `const firstVisit = !hasStoredPassport()` before the
   `await resolveInitialPassport(...)` call.
2. **Not yet done**: `localStorage["walkthrough-done"] !== "1"`.

Consequences, each a planner criterion:

- A returning user with an existing passport fails gate 1 (a passport was
  in storage at load), so the path never shows, even if the flag was never
  written (for example a user who explored before this EPIC shipped).
- A user who finished or skipped the path fails gate 2 on every later
  visit.
- On a first visit the flag is written the moment the user crosses their
  first frontier (or taps Skip), so a mid-session reload after that does
  not bring it back.

### `web/src/ui/walkthrough.ts`

Pure helpers (no DOM, unit-tested):

```ts
export type StepEvent = "audio" | "lit" | "dareDone";
export type AnchorKey = "starter" | "darePlay" | "dareStamp";

export interface Step {
  text: string;        // one short imperative sentence
  anchor: AnchorKey;   // which live control to point at
  advance: StepEvent;  // the real event that completes this step
}

// The dark script starts from an empty passport (starter chips showing);
// the lit script starts from a seeded/staging map (today's dare showing).
export function walkScript(startedLit: boolean): Step[];

export function shouldShowWalkthrough(firstVisit: boolean, done: boolean): boolean;
```

`walkScript(false)` (dark) returns exactly:

1. `{ text: "Pick a sound you love to start.", anchor: "starter", advance: "lit" }`
2. `{ text: "Play your dare to hear it.", anchor: "darePlay", advance: "audio" }`
3. `{ text: "Stamp it to cross the frontier.", anchor: "dareStamp", advance: "dareDone" }`

`walkScript(true)` (lit) returns exactly:

1. `{ text: "Play today's dare to hear it.", anchor: "darePlay", advance: "audio" }`
2. `{ text: "Stamp it to cross the frontier.", anchor: "dareStamp", advance: "dareDone" }`

The DOM controller:

```ts
export interface WalkthroughDeps {
  root: HTMLElement;             // #walkthrough container
  firstVisit: boolean;
  startedLit: boolean;
  baselineLit: number;          // lit count at load; "lit" advances when it rises
  anchors: {
    starter: () => HTMLElement | null;   // first .dare-chip
    darePlay: () => HTMLElement | null;  // .dare-play
    dareStamp: () => HTMLElement | null; // the dare's "Stamp it" button
  };
  expandDare: () => void;       // ensure the dare card is expanded before anchoring
}

export class Walkthrough {
  constructor(deps: WalkthroughDeps);
  start(): void;                              // no-op unless the gate passes
  noteAudio(): void;                          // a preview began playing
  noteLit(litCount: number, dareDone: boolean): void; // passport changed
  skip(): void;                               // dismiss + persist done
  get active(): boolean;
}
```

Controller behavior:

- `start()`: return immediately (no UI, `active` stays false) unless
  `shouldShowWalkthrough(firstVisit, done)`. Otherwise pick the script by
  `startedLit`, set the step index to 0, and render the first resolvable
  step.
- Rendering a step: call `expandDare()`, resolve the step's anchor
  element. If the anchor is null, advance to the next step (see
  robustness). Otherwise position the ring over the anchor's bounding rect
  and set the caption text, then move focus to the anchor.
- Advancing on an event: `noteAudio()` advances the current step when its
  `advance` is `"audio"`; `noteLit(n, done)` advances when the step's
  `advance` is `"lit"` and `n > baselineLit`, or when it is `"dareDone"`
  and `done` is true. An event that does not match the current step is
  ignored. When the last step advances, finish.
- **Robustness**: if a step's anchor cannot resolve at render time (for
  example the dare has no playable preview so `.dare-play` is absent), the
  controller advances past it to the next resolvable step. If no step
  resolves, it finishes silently. The path never draws a ring pointing at
  nothing and never stalls.
- `skip()` and finishing both: hide the container, remove the ring and
  caption, detach the resize/reposition listeners, and write
  `walkthrough-done = "1"`. After either, `active` is false and no event
  reopens it.
- Reposition the ring on `window` resize and on the next frame after each
  advance (the dare card changes height between the starter and dare
  views). Anchors are fixed-position UI controls, never moving map dots,
  so no map-coordinate tracking is needed.

DOM built in TS with `textContent` (never `innerHTML`), mirroring the dare
card, so no user or genre string can ever inject markup:

- `.wt-ring` (aria-hidden) positioned absolutely over the anchor,
  `pointer-events: none` so taps reach the control beneath it.
- `.wt-caption` containing `<p class="wt-text">` (the step sentence) and
  `<button type="button" class="wt-skip" aria-label="Skip the walkthrough">Skip</button>`.
  The caption has `pointer-events: auto` so Skip is tappable; nothing else
  overlays the highlighted control.

### `web/index.html`

Remove the `#orientation` block (the card, its two paragraphs, and the
`#got-it` button). Add one container near the other overlays:

```html
<!-- First-run guided walkthrough: a non-modal coach mark that points at
     the real controls one step at a time. Shown only on a first visit,
     until the first crossing, then never again. Content is built in TS
     with textContent. -->
<div id="walkthrough" class="walkthrough" aria-live="polite" hidden></div>
```

### `web/src/ui/states.ts`

Remove `maybeShowOrientation`, the `ORIENTATION_KEY` constant, and the
orientation logic. Keep `hideSkeleton` and `showError` unchanged.

### `web/src/main.ts`

- Compute `firstVisit` before `resolveInitialPassport` (see gate).
- After the passport resolves, compute
  `const baselineLit = countLit(atlas, litSet(passport))`.
- Replace the `maybeShowOrientation()` call. Construct the walkthrough at
  the END of `start()`, after `dareCard.render()` and `warmDare()`, so its
  anchors (starter chips or the dare's Play / Stamp it) already exist:

  ```ts
  const walkthrough = new Walkthrough({
    root: el("walkthrough"),
    firstVisit,
    startedLit: baselineLit > 0,
    baselineLit,
    anchors: {
      starter: () => el("dare").querySelector<HTMLElement>(".dare-chip"),
      darePlay: () => el("dare").querySelector<HTMLElement>(".dare-play"),
      dareStamp: () =>
        [...el("dare").querySelectorAll<HTMLElement>("button")].find(
          (b) => b.textContent === "Stamp it",
        ) ?? null,
    },
    expandDare: () => dareCard?.expand(),
  });
  walkthrough.start();
  ```

- Advance the walkthrough off events already fired:
  - In `select()`, immediately after `player.play(exemplar.previewUrl)`
    (the branch where an exemplar exists), call `walkthrough.noteAudio()`.
  - In the dare card's `onPlay`, after `player.play(ex.previewUrl)`, call
    `walkthrough.noteAudio()`.
  - At the END of `applyPassportChange()`, after the dare is synced, call
    `walkthrough.noteLit(countLit(atlas, litSet(getPassport())), getDare()?.done === true)`.
    This runs after every stamp, starter pick, and dare completion, so the
    `"lit"` and `"dareDone"` steps advance without new plumbing.
  - Because `walkthrough` is declared after `applyPassportChange` in the
    current file order, hold it in a `let walkthrough: Walkthrough | undefined`
    declared before `applyPassportChange` and guard the notify calls with
    `walkthrough?.` (same pattern already used for `dareCard`).
- Extend the Escape keydown chain as the LAST branch, after the dare:
  `else if (walkthrough?.active) walkthrough.skip();`. Order stays: poster,
  passport sheet, now-playing, dare, then walkthrough.

### `web/src/style.css`

Remove the `.orientation` rules (base and the 390px media-query block).
Add `.walkthrough`, `.wt-ring`, `.wt-caption`, `.wt-text`, `.wt-skip`
using existing color and spacing tokens:

- `.walkthrough` is a full-viewport, `position: fixed`, `pointer-events:
  none` layer (so it never blocks the map). Only `.wt-caption` re-enables
  pointer events.
- `.wt-ring`: a 2px accent-colored outline with a soft glow (box-shadow),
  border-radius to hug a button, `pointer-events: none`. Under
  `prefers-reduced-motion: reduce`, no pulse animation (static ring).
- `.wt-skip`: at least 44px tall, visible `:focus-visible` outline,
  readable contrast.
- The caption is clamped inside the viewport at 390px (no horizontal
  scroll), positioned near the anchor (above it when the anchor is in the
  lower half, below when in the upper half).

### `scripts/shoot.mjs`

Replace the `#got-it` dismissal with suppressing the walkthrough before
navigation, so screenshots are never covered:

```js
await page.addInitScript(() => {
  try { localStorage.setItem("walkthrough-done", "1"); } catch {}
});
```

(Place it before `page.goto`; drop the post-load `#got-it` click.)

### Copy inventory (final strings, sweep-clean; ship these verbatim)

- Dark step 1: `Pick a sound you love to start.`
- Dark step 2 / lit step 2 label reuse: `Play your dare to hear it.`
- Lit step 1: `Play today's dare to hear it.`
- Shared final step: `Stamp it to cross the frontier.`
- Skip button label: `Skip`
- Skip button aria-label: `Skip the walkthrough`

No em or en dashes, no banned vocabulary, no negative phrasing. Every one
of these goes into the dynamic-strings list in
`test/copy-lint.test.ts`.

## Ordered task list

### T1: The walkthrough controller and its pure logic

Build `web/src/ui/walkthrough.ts`: the `walkScript`,
`shouldShowWalkthrough` helpers and the `Walkthrough` class exactly per
the design. Add `hasStoredPassport()` to `web/src/state/passport.ts`.

Acceptance criteria:

- `walkScript(false)` returns the three dark steps in order with the exact
  strings above; `walkScript(true)` returns the two lit steps. Both end on
  a `"dareDone"` step anchored to `dareStamp`.
- `shouldShowWalkthrough(firstVisit, done)` is true only when
  `firstVisit && !done`.
- `hasStoredPassport()` returns true when the `passport` key exists in
  storage and false when it is absent or storage is unavailable, without
  throwing.

### T2: Wire it into the app and remove the old orientation

Add the `#walkthrough` container, remove `#orientation` markup, delete
`maybeShowOrientation`/`ORIENTATION_KEY`, wire the controller and the
three notify points into `main.ts`, extend the Escape chain, add the CSS,
and remove the `.orientation` CSS. Update `scripts/shoot.mjs`.

Acceptance criteria:

- On a dark first visit (SEED_DEMO=0, empty storage), step 1 points at a
  starter chip. Picking one advances to step 2 pointing at the dare's Play
  button; playing advances to step 3 pointing at "Stamp it"; stamping
  crosses the frontier and the coach mark disappears.
- On a lit first visit (SEED_DEMO=1, empty storage), step 1 points at the
  dare's Play button and step 2 at "Stamp it"; stamping crosses the
  frontier and the coach mark disappears.
- The coach mark never overlays or blocks the control it points at: the
  highlighted button is clickable and tappable throughout.
- The old orientation card no longer exists anywhere in the DOM or CSS,
  and `scripts/shoot.mjs` no longer references `#got-it`.

### T3: The "never again" and staging behavior

Acceptance criteria:

- After the first crossing, `walkthrough-done` is `"1"` and a reload does
  not show the path again.
- Tapping Skip at any step hides the path, writes the flag, and a reload
  does not show it again, even when no stamp was made.
- A returning user whose browser already holds a passport (seeded via
  `addInitScript` before load) never sees the path, with or without the
  flag.
- On staging behavior (SEED_DEMO=1, no hand-crafted input), a brand-new
  visitor reaches the frontier-crossing signature moment through the two
  lit steps in well under a minute: the lit count rises by one, the dare
  card flips to "Frontier moved.", and the path is gone.

### T4: Mobile, accessibility, and copy sweep

Acceptance criteria:

- At a 390px viewport the coach mark and its caption fit with no
  horizontal scroll, and the Skip target is at least 44px tall.
- Focus moves to the highlighted control when a step appears, with a
  visible focus ring; Tab reaches the Skip button; Escape skips the path
  when no dialog is open.
- Each step's sentence is announced through the `aria-live` container.
- Every new user-visible string is in `test/copy-lint.test.ts` and the
  sweep passes: no em or en dashes, no banned vocabulary, no negative
  empty-state phrasing.
- `npm test`, `npm run typecheck`, and `./scripts/e2e.sh` all pass.

## Test plan (planner criterion to proof)

New unit test `test/walkthrough.test.ts`:

- `walkScript(false)` and `walkScript(true)` return the exact step arrays
  (order, text, anchor, advance).
- `shouldShowWalkthrough` truth table.
- `hasStoredPassport()` true/false/unavailable cases.

New e2e `e2e/walkthrough.spec.ts` (mirrors the helpers in `dare.spec.ts`:
`seedEnv`, `waitForMap`, `litCount`):

- **Dark path**: SEED_DEMO=0, empty storage. Assert the step 1 caption
  text and that the ring overlaps a `.dare-chip` bounding box. Pick a
  chip, assert step 2 text and the ring over `.dare-play`, click Play and
  wait for `__nowPlaying.playing`, assert step 3 text and the ring over
  "Stamp it", click it. Assert lit count rose, the dare shows "Frontier
  moved.", `#walkthrough` is hidden, and `localStorage["walkthrough-done"]`
  is `"1"`.
- **Lit path**: SEED_DEMO=1, empty storage. Assert step 1 over
  `.dare-play`, Play, step 2 over "Stamp it", stamp. Assert the crossing
  and that the path is gone.
- **Never again**: after finishing, reload and assert `#walkthrough` stays
  hidden. Separately, Skip on first load, reload, assert it stays hidden.
- **Returning user**: `addInitScript` writes a minimal valid passport to
  localStorage before `goto`; assert `#walkthrough` never becomes visible.
- **Mobile + a11y**: 390px viewport. Assert no horizontal scroll, the Skip
  button box height is at least 44px, focus is on the anchored control when
  a step shows, Tab reaches Skip, and Escape hides the path.

| Planner criterion | Proof |
| --- | --- |
| First visit shows a 2 to 4 step path pointing at real controls, one short imperative each, skippable at any step | `walkthrough.test.ts` proves both scripts are 2 or 3 steps with the exact imperative strings. `e2e/walkthrough.spec.ts` dark and lit paths prove each step's ring overlaps the real control (chip, Play, "Stamp it") and that Skip dismisses at any step. |
| Walks the real core action once (stamp, hear, light, dare) using the real controls, not a modal essay | The dark path drives pick to Play to Stamp against the live dare card; the lit path drives Play to Stamp. Each step advances only when the app fires the real event (`__nowPlaying.playing`, lit count rising, dare done). The mobile test asserts the coach mark never blocks the control it points at. |
| After first success never again; a returning user with a passport never sees it | The "never again" and "returning user" e2e cases: reload after a crossing, reload after Skip, and a pre-seeded passport, all keep `#walkthrough` hidden. `walkthrough.test.ts` proves the gate. |
| On staging, a new visitor reaches the signature moment within a minute without hand-crafted input (SEED_DEMO) | The lit-path e2e runs SEED_DEMO=1 with empty storage and reaches "Frontier moved." with a rising lit count through two taps, no typed input. |
| Mobile-first, keyboard reachable with visible focus, copy sweep clean | The mobile + a11y e2e case (390px, 44px Skip, focus on the anchor, Tab to Skip, Escape). `test/copy-lint.test.ts` extended with every new string; T4 requires the full sweep and suites to pass. |

Notes for the implementer:

- The e2e suite runs against `vite preview` (static). The walkthrough
  needs no network. Keep using `seedEnv` to control SEED_DEMO and
  `addInitScript` to pre-write storage.
- The existing seeded e2e specs (`dare.spec.ts`, `passport.spec.ts`,
  `listenbrainz.spec.ts`, `poster.spec.ts`) run with empty storage and
  SEED_DEMO on, so they would now trigger the walkthrough. Add
  `await page.addInitScript(() => { try { localStorage.setItem("walkthrough-done","1"); } catch {} })`
  before `goto` in each of those specs so they keep testing their own
  feature. This is a mechanical, per-spec edit; do not weaken their
  assertions.
- Remove the "first-run orientation shows once, then never again" test in
  `e2e/map.spec.ts`; its coverage moves to `e2e/walkthrough.spec.ts`. The
  map spec's other tests do not open the dare-anchored path, but add the
  same suppression init script there too for determinism.
- The walkthrough starts only after `dareCard.render()`, so its anchors
  always exist on a first visit. If exemplars fail to load and the dare
  has no Play button, the controller's robustness rule advances past the
  audio step; the crossing step still works.
