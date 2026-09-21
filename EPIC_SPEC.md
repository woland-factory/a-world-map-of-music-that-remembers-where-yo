# EPIC SPEC: Polish pass (final)

A UX, performance, and quality pass over the whole delivered product
against the QUALITY BAR and the quality differentiator. No new features.
Tighten what already ships so the map feels instant, tactile, and alive,
and close the concrete gaps this spec names on hot paths, designed states,
copy, accessibility, mobile, security headers, and the README.

This is a refinement EPIC (`polish: true`, and the planner's scope says
"no new features"). Every task below sharpens something that already
exists. Where a task makes an existing capability reachable (keyboard
selecting a genre) or felt (a tapped node responding on the map), that is
refinement to meet the written bar, not a new feature. The fence is
explicit per task under "Do NOT". When a change would add a new
user-facing capability, it is out of scope.

## Quality differentiator (restated, binding)

**Delight through tactility: an instant, alive map you can hear.** Touch
anywhere and it plays, your own territory glows out of the dark, and the
frontier visibly moves when you cross it. Every incumbent is frozen,
silent, stateless, or a list. We win on the felt experience of a map you
can hear and a world you are visibly filling in.

What it demands of THIS EPIC: the winning dimension is the felt one, so
this pass is held to the differentiator, not just the baseline. A tap that
plays a sound but leaves the node looking dead is a tactility defect. Pan
and zoom that stutter at full genre count on a phone is a tactility
defect. The map must stay instant and responsive to the touch at 2,197
genres on a 390px screen, and a tapped genre must visibly answer on the
map, not only in a side panel.

## Scope

In scope (refinement only, against the delivered app):

- **Perceived speed.** Repeat-visit load, first-paint gating, and pan/zoom
  smoothness at full genre count on a 390px viewport. Immediate tactile
  feedback on tap.
- **Designed states.** Close the three real gaps: the dare card can render
  visible-but-empty, the now-playing panel can show a real track as
  permanently "silent", and a failed audio preview has no surface.
- **Copy sweep.** Harden `test/copy-lint.test.ts` so it actually enforces
  the negative-phrasing rule and covers every user-visible string,
  including the two current blind spots.
- **Accessibility.** Focus trapping in the two dialogs, a keyboard path to
  the map's core action, a real page `<h1>`, the one sub-44px control, the
  weak non-text border contrast, and the over-broad now-playing live
  region.
- **Mobile.** The single sub-44px touch target; confirm no horizontal
  scroll and audio-on-tap on a mobile viewport.
- **Security hygiene.** Add the missing response security headers on the
  static (nginx) surface. Re-confirm the proxy's validation, rate limit,
  no-PII logging, and no-stack-trace guarantees still hold.
- **README.** Re-verify every command against the actual compose files,
  including after the nginx header change.
- **Signature moment.** Verify a brand-new visitor reaches the zoom-out
  (lit territory in a dark world) within the first minute on staging
  (SEED_DEMO=1), with no hand-crafted input.

Out of scope (binding non-goals, from the planner):

- **No new features of any kind.** Refinement only.
- No genre search box, no roving-tabindex list of 2,197 nodes, no filter,
  no new panel, no new setting. The keyboard-select task adds exactly one
  affordance on the already-focusable canvas and nothing else.
- No content-hashed data filenames / build-pipeline change (a heavier
  caching scheme). The caching fix is header-level only.
- No redesign, no animation showreel, no new visual language, no design
  system. Do not "improve" layouts that already clear the bar.
- No change to the atlas data, the pipeline, the passport schema, the dare
  logic, the ListenBrainz matching, or the poster output.
- No Content-Security-Policy tuning beyond the small static-header set
  named below (a strict CSP for a canvas app that loads Umami/Sentry from a
  CDN is its own project; do not start it here).

## Quality bar focus for this EPIC

This EPIC is the QUALITY BAR pass, so every clause is load-bearing. The
tasks below turn §1 (speed), §2 (mobile), §3 (designed states), §5
(security), §6 (accessibility), §7 (radically simple), §8 (copy), and §9
(README) into concrete, provable criteria for THIS app's real screens: the
map, the passport sheet (which also holds the ListenBrainz "fill" settings
surface), the daily dare card, the now-playing panel, and the poster
modal. §4 (first-run walkthrough) shipped in EPIC 5; this pass only
re-verifies it still fires correctly and stays out of the way, and that the
signature moment behind it is reachable in the first minute.

## Baseline (what is already good, do not touch)

Confirmed by audit; these already meet the bar and must not regress:

- Global `:focus-visible` outline covers every button, the canvas, and the
  input (`web/src/style.css`). Both dialogs save, move, and restore focus
  and honor Escape.
- Audio pre-warming on `pointerdown`, mouse hover, and dare load; a
  synchronous, autoplay-safe `player.play()` inside the tap gesture with
  swallowed decode failures. Audio already plays on tap, including mobile.
- rAF-coalesced, redraw-on-change rendering (no idle CPU); off-screen dot
  culling; dpr capped at 2.5; genre labels capped at 40, region labels at
  10; resize debounced.
- The proxy validates the username (type, 1..64 length, rejects control
  chars / `/` / `\`), rate-limits 10 requests / 60s per client IP, never
  interpolates the name into any log line, scrubs the name from Sentry
  reports, and returns only fixed friendly error strings (never a stack).
- No secrets in tracked files; `.env` is gitignored; `SENTRY_DSN` / Umami
  values are injected from env at runtime. The delivered visible copy has
  zero em/en dashes, zero banned vocabulary, and zero negative empty-state
  phrasing. The README's commands and ports all match the compose files.

Leave all of the above as is. The tasks below are the delta.

---

## Technical design and ordered task list

Each task lists the files to touch, the concrete change, its acceptance
criteria, and its proof. Tasks are independent and may land in any order,
except that T7 (README re-verify) and T8 (staging verify) run last.

### T1: Perceived speed and tactile feedback (§1 + differentiator)

**Files:** `web/src/main.ts`, `web/src/state/exemplars.ts`,
`web/src/state/passport.ts` (the three `fetch(..., { cache: "no-store" })`
call sites), `web/index.html` (preload hint), `web/src/map/input.ts`
(pointermove throttle), `web/src/map/renderer.ts` (selected-node render).

Concrete changes:

1. **Repeat-visit load.** Remove `{ cache: "no-store" }` from the three
   committed-data fetches: `/data/genres.json` (`main.ts` `loadAtlas`),
   `/data/exemplars.json` (`exemplars.ts` `loadExemplars`), and
   `/data/demo-passport.json` (`passport.ts` `loadDemoNames`). These are
   committed build artifacts served by nginx with
   `Cache-Control: public, max-age=300` and revalidation; `no-store`
   currently defeats that and forces a full re-download (~700 KB atlas +
   ~450 KB exemplars) on every load. Rely on the nginx header. Do NOT add
   content-hashed filenames (out of scope). `env.js` stays `no-store`
   (nginx already sets that; the app does not fetch it).
2. **Start the largest download earlier.** Add
   `<link rel="preload" href="/data/genres.json" as="fetch"
   crossorigin="anonymous">` in `web/index.html` `<head>` so the atlas
   download overlaps module parse instead of waiting for it.
3. **Throttle hover hit-testing.** In `input.ts`, the mouse `pointermove`
   handler runs an O(n) `hitTest` over all ~2,197 nodes on every event
   with no throttle. Coalesce it to at most one hit-test per animation
   frame (a pending-rAF guard), so a fast mousemove cannot spin the CPU.
   Behavior (warming the hovered genre) is unchanged; only the rate is
   capped. Touch is already exempt from this path; do not change touch.
4. **Tactile tap feedback on the map (differentiator).** Today, tapping a
   genre opens the now-playing panel but the node itself does not change on
   the canvas, so the map looks dead to the touch. Add a lightweight
   selected-node highlight to the renderer: `MapRenderer.setSelected(genre
   | null)` that stores the id and requests a draw; `draw()` paints a
   single accent ring around the selected node (reuse the existing accent
   token and the lit-dot draw path). Call `setSelected` from `main.ts`
   `select()` and clear it in `deselect()`. This is feedback, not
   animation: under `prefers-reduced-motion` it is a static ring (no
   pulse). Keep it to one node; do not add hover highlights, trails, or
   per-node animation.
5. **Meet the pan/zoom budget, measurement-gated.** Verify pan and zoom
   stay smooth (target: no dropped-frame stutter, ≥ ~50fps median during a
   sustained pan) at full genre count on a 390px viewport with a full-ish
   passport lit. If the check passes, change nothing further. If it does
   NOT, address the named hotspots in order until it does, smallest first:
   (a) cache the genre-label candidate set per viewport instead of
   `filter`+`sort` every frame in `drawGenreLabels`; (b) skip or cheapen
   the per-lit-dot `shadowBlur` while a gesture is actively in progress.
   Do not pre-optimize hotspots the measurement does not implicate.

Acceptance criteria:

- None of the three data fetches passes `cache: "no-store"`; a second load
  of the app within the cache window serves `genres.json` and
  `exemplars.json` from cache (no full re-download), verified from the
  network trace or response `from cache` status.
- `web/index.html` `<head>` contains a `preload` hint for
  `/data/genres.json`.
- The mouse `pointermove` hit-test runs at most once per frame; a synthetic
  burst of pointermove events triggers a bounded number of hit-tests.
- Tapping a genre draws a selected ring on that node on the canvas within
  the same interaction (feedback within 100ms, independent of audio
  decode); deselecting removes it. The ring is static under reduced motion.
- First meaningful render stays under ~1s on an ordinary connection: the
  skeleton shows immediately and the map replaces it without a blank frame.
- Pan and zoom are smooth at 2,197 genres on a 390px viewport, evidenced by
  a captured measurement (frame timing or a recorded interaction). No hot
  path does unbounded per-event work.

Do NOT: add content-hashing, a service worker, hover node highlights, node
animations beyond the single static/pulse selection ring, or any
optimization the FPS check does not require.

### T2: Designed states (§3)

**Files:** `web/src/ui/dareCard.ts`, `web/src/ui/nowPlaying.ts`,
`web/src/main.ts`.

Three real gaps, each currently an undesigned surface:

1. **Dare card never renders visible-but-empty.** In `dareCard.ts`
   `render()`, the card is un-hidden and its content cleared, then the code
   `return`s early when the dare's genre cannot resolve, leaving a blank
   visible card with no copy and no exit. Guard it: when there is no
   starter prompt, no resolvable dare, no done state, and no no-frontier
   state to show, keep the card hidden (`root.hidden = true`) rather than
   showing an empty panel. The legitimate "no dare available" case already
   has a designed surface ("You reached every neighbor." /
   "Tap the map to leap somewhere new.") when it applies.
   No new copy is invented for the unresolvable-data edge; the card simply
   does not appear.
2. **A real track can read as permanently silent.** When a genre is
   selected before `exemplars` resolves, `getExemplar` returns undefined
   and the now-playing panel shows the resting line "Silent for now. Stamp
   it to remember.", and it never refreshes when exemplars arrive, so a
   genre that DOES have a preview looks silent forever. Fix: in the
   `exemplarsPromise.then(...)` handler in `main.ts`, if a genre is
   currently `selected` and now resolves to an exemplar while the panel is
   showing the resting state, refresh the now-playing panel for that genre
   (show its track, enable playback). Do not auto-play on this refresh;
   audio stays user-initiated.
3. **A failed audio preview has a voice.** A preview URL that fails to load
   currently fails silently. Surface it in the now-playing panel with one
   swept-clean line (see copy inventory): `That preview didn't load. Tap
   another genre to hear it.` Wire it off the player's existing decode/error
   path (the `Player` already swallows the error; expose an `onError`
   callback or a returned rejection the panel can render). Keep it inside
   the now-playing panel; do not add a global toast.

Acceptance criteria:

- The dare card is never visible with an empty content region: whenever
  there is nothing designed to show, it is hidden.
- Selecting a genre with a real preview before exemplars finish loading
  ends with the panel showing that genre's track once exemplars resolve
  (not the resting "silent" line).
- A genre whose preview fails to load shows the designed "That preview
  didn't load. Tap another genre to hear it." line in the now-playing
  panel, never a silent dead end and never a console-only failure.

Do NOT: add loading spinners to the dare (it is built after exemplars
resolve and the map stays interactive), add a global toast system, or
change the passport / poster / map error states, which already pass.

### T3: Copy sweep hardening (§8)

**Files:** `test/copy-lint.test.ts`, and any string added by T2.

The delivered copy is clean, but the sweep test has blind spots that let
it drift:

1. **The negative-phrasing check is dead in part.** `const NEGATIVE` is
   defined and then discarded with `void NEGATIVE`; only a hardcoded subset
   is asserted. Enforce a curated negative-phrase list against the
   tag-stripped visible text: `you don't have`, `unable to`, `something
   went wrong`, `you have no`, `nothing here`, `no stamps`, `no genres`.
   Keep the list curated (do NOT assert a bare `"no "` / `"nothing "`
   substring, which false-positives on words like "piano" or "no-store").
   Remove the `void NEGATIVE` dead line.
2. **Close the two coverage blind spots.** Add the dare "done" fallback
   string `a new sound` (used to build "You crossed into a new sound." when
   the genre name is missing) to the `dynamic` list. Include the region
   legend labels the app renders into `#legend-list`: read them from the
   committed atlas (`data/genres.json`, the `label` field on each region)
   and append them to the swept copy so a voice defect in a region label is
   caught.
3. **Register any T2 string.** Add the T2 audio-error line to the `dynamic`
   list.

Acceptance criteria:

- `test/copy-lint.test.ts` asserts the curated negative-phrase list (no
  `void NEGATIVE`), and the suite still passes on the current, clean copy.
- The `dynamic` list includes `a new sound`, the T2 audio-error string, and
  the sweep pulls in region labels from the committed atlas.
- The full sweep passes: zero em-dashes, zero en-dashes, zero banned
  vocabulary, zero negative empty-state phrasing across every user-visible
  string (index.html plus every dynamic string plus region labels).

Do NOT: rewrite delivered copy that already passes, or add bare-substring
rules that produce false positives.

### T4: Accessibility (§6)

**Files:** `web/src/ui/passportView.ts`, `web/src/ui/posterModal.ts`
(focus trap), `web/src/map/input.ts` + `web/src/main.ts` (keyboard select),
`web/index.html` (page `<h1>`, now-playing live region), `web/src/style.css`
(legend toggle size, border contrast).

1. **Focus trap in both dialogs.** The passport sheet and the poster modal
   set `aria-modal="true"`, move and restore focus, and honor Escape, but
   Tab still escapes to the map controls behind them. Contain Tab /
   Shift+Tab within the open dialog (a keydown trap cycling the dialog's
   focusables, or set the background `#app` children `inert` while a dialog
   is open and clear it on close). Do not change the existing
   save/restore-focus behavior. When the poster sits above the passport,
   Escape still closes the poster first (already wired); the trap must
   respect that stacking.
2. **Keyboard reaches the map's core action.** The canvas is already
   focusable and keyboard-pans/zooms, but selecting, hearing, and stamping
   an arbitrary genre is pointer-only. Add exactly one affordance: with the
   canvas focused, Enter (and Space) selects the genre nearest the current
   viewport centre and runs the existing `select()` path (opens
   now-playing, plays the preview, exposes Stamp). The user aims with the
   arrow-key pan and `+`/`-` zoom that already exist. Reuse the existing
   nearest-node logic (a centre-point variant of `hitTest`); add no genre
   list, search, or roving tabindex. This closes "keyboard reaches
   everything a mouse can" with the smallest possible change.
3. **A real page heading.** The only `<h1>` today lives inside the hidden
   error overlay, so the live page has no `<h1>` and several orphan
   `<h2>`s. Give the app a single visible-or-visually-hidden `<h1>` (the
   product name, e.g. "A world map of music") as the document's top
   heading. A visually-hidden `<h1>` is acceptable if it must not compete
   with the map for space; it must remain in the accessibility tree.
4. **Legend toggle touch/hit size.** `.legend button` (`#legend-toggle`) is
   ~21px tall with no `min-height`. Give it `min-height: 44px` (it is
   already full-width). This is both the §6 and §2 fix for that control.
5. **Non-text contrast.** `--border` at `rgba(148,163,184,.22)` renders
   control outlines (inputs, ghost buttons, zoom controls, legend, row
   dividers) under the 3:1 WCAG 1.4.11 non-text minimum. Raise the border
   token (or the specific control borders) to clear 3:1 against the panel
   background while keeping the dark aesthetic. Verify text tokens still
   pass AA (they already do; do not regress them).
6. **Scope the now-playing live region.** The entire `#now-playing`
   `<section>` is `aria-live="polite"` and wraps the Stamp / Remove / Close
   buttons, risking noisy re-announcements. Move `aria-live` to the text
   content only (the title + track lines), not the interactive controls.

Acceptance criteria:

- With the passport sheet open, Tab and Shift+Tab stay within the sheet and
  never land on the map, controls, legend, or dare behind it; same for the
  poster modal. Focus still restores to the opener on close, and Escape
  still closes (poster before passport when stacked).
- With the canvas focused, pressing Enter or Space selects the centre-most
  visible genre, opens the now-playing panel, plays its preview if it has
  one, and the Stamp button is then keyboard-operable. A keyboard-only user
  can hear and stamp a genre without a pointer.
- The live page exposes exactly one `<h1>` in the accessibility tree.
- `#legend-toggle` is at least 44px tall at 390px.
- The control-border colour meets 3:1 against its background; text still
  meets AA.
- `aria-live` on the now-playing surface covers the text, not the buttons.

Do NOT: build a genre search/list, add a skip-link system, restructure the
heading hierarchy beyond adding the single `<h1>`, or change the dialogs'
existing focus save/restore.

### T5: Mobile (§2)

**Files:** covered by T1 (audio-on-tap already works) and T4 (legend
toggle 44px); this task is primarily verification plus the one shared fix.

Concrete: confirm at a 390px viewport that (a) there is no horizontal
scroll on any surface (map, passport sheet, dare card, now-playing, poster,
fill form), (b) every interactive control is ≥ ~44px including the legend
toggle fixed in T4, and (c) tapping a genre starts audio on a mobile
browser context. No new layout work is expected beyond the legend-toggle
size; the fluid base layout already clears 390px. If verification finds a
new sub-44px control or an overflow, fix it minimally.

Acceptance criteria:

- No horizontal scroll at 390px on any surface (existing dare test already
  asserts this for the dare; extend the check to the passport sheet and
  poster modal).
- Every interactive control's touch target is ≥ ~44px at 390px, including
  `#legend-toggle`.
- Audio plays on tap at a mobile viewport (a tap selects a genre and
  `__nowPlaying.playing` becomes true).

Do NOT: introduce a new small-viewport redesign; the base layout is the
mobile layout and it passes.

### T6: Security headers on the static surface (§5)

**Files:** `nginx.conf`.

The proxy is already hardened (validation, rate limit, no-PII logs, no
stack traces, `X-Content-Type-Options: nosniff`, `no-store`). The gap is
the static/SPA surface served by nginx, which sends no security headers.
Add, at the server level so they apply to the HTML and assets:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (the app is never framed; this blocks
  clickjacking without needing a full CSP)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `server_tokens off;` (stop leaking the nginx version in the `Server`
  header)

Use `add_header ... always;` so the headers ride error responses too, and
confirm the per-location `add_header` blocks for `/data/`, `/env.js`, and
`/assets/` still emit their `Cache-Control` (an `add_header` in a
`location` overrides inherited server-level `add_header`; re-declare the
security headers where needed, or structure so both apply). Do NOT add a
Content-Security-Policy in this pass (out of scope, and a strict CSP with
the CDN-loaded Umami/Sentry scripts is its own project).

Acceptance criteria:

- A request to `/` (and to a hashed `/assets/` file) returns
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and
  `Referrer-Policy: strict-origin-when-cross-origin`.
- The `Server` header no longer includes the nginx version.
- `/data/`, `/env.js`, and `/assets/` still return their existing
  `Cache-Control` values (the header interaction did not drop them).
- The proxy's own guarantees are re-confirmed unchanged: username
  validation, 10/60s rate limit, no name in any log line, no stack trace in
  any error body.

Do NOT: add a CSP, add HSTS (TLS is terminated by the factory's shared
proxy, not this container), or change the proxy code.

### T7: README verification end to end (§9)

**Files:** `README.md` (only if a mismatch is found).

Re-verify every command and claim against the actual
`docker-compose.yml`, `docker-compose.staging.yml`,
`docker-compose.dev.yml`, `Dockerfile`, `nginx.conf`, `package.json`
scripts, and `.env.example`: the ports (8080 local, 5173 dev), the compose
up commands, the npm script names (`build:atlas`, `atlas:emit`,
`exemplars:fetch`, `exemplars:emit`, `test`), `./scripts/e2e.sh`, and the
two-container (`web` + `api`) topology. The audit found the README
currently accurate; this task guarantees it stays accurate after T6's
nginx change. The README does not document response headers, so T6 needs no
README edit unless a command or port changed (it did not).

Acceptance criteria:

- Every command in `README.md` runs as written against the actual files;
  every referenced npm script exists; every port matches its compose
  mapping. Any mismatch found is fixed in `README.md` in this run.
- No factory internals appear in the README.

### T8: Signature moment reachable in the first minute (§4 verify + AMBITION)

**Files:** verification only; e2e in `e2e/`.

The signature moment is the zoom-out: lit territory glowing in a mostly
dark world, reachable from the first stamps. On staging (`SEED_DEMO=1`) a
brand-new visitor lands on a partly-lit demo map and the EPIC-5 walkthrough
leads them through a frontier crossing. Verify the whole first-minute path
end to end: skeleton, then a lit-over-dark map, then the guided crossing,
then the reset-view zoom-out that frames the lit territory against the
dark, with no hand-crafted input.

Acceptance criteria:

- With SEED_DEMO=1 and empty storage, a fresh load shows a partly-lit map
  within ~1s (skeleton first, never a blank page), the lit count is > 0,
  and the reset-view / fit shows lit territory against dark.
- The first-run walkthrough still fires only on a genuine first visit,
  advances off the real controls, is skippable, and never shows for a
  returning user (EPIC-5 behavior did not regress).
- The frontier-crossing signature moment (play, stamp, lit count rises,
  "Frontier moved.") is reachable within the first minute through the
  guided path, verified on the staging build.

---

## Copy inventory (new/changed strings, sweep-clean; ship verbatim)

Only one genuinely new user-visible string is introduced by this pass. It
is swept clean (no em/en dash, no banned vocabulary, positive and
directive) and must be added to `test/copy-lint.test.ts`:

- Now-playing audio failure: `That preview didn't load. Tap another genre to hear it.`

No other task adds visible copy. T2's dare-card fix hides the card rather
than inventing a string. The page `<h1>` reuses the product name already in
the `<title>` ("A world map of music"). Every string this pass touches goes
through the T3 sweep.

## Test plan (planner criterion to proof)

Automated tests prove each criterion. Unit/integration tests run under
Vitest (`npm test`); end-to-end tests run under Playwright via
`./scripts/e2e.sh`, reusing the existing helpers in `e2e/dare.spec.ts`
(`seedEnv`, `waitForMap`, `litCount`, `selectGenre`) and the standard
`addInitScript` that sets `walkthrough-done` to suppress the walkthrough in
feature specs that are not testing it.

New/updated tests:

- **`test/copy-lint.test.ts` (T3):** enforce the curated negative list,
  add the missing dynamic strings and the T2 audio-error line, and pull
  region labels from the committed atlas into the swept copy. Suite passes
  on current copy.
- **`test/player.test.ts` / a now-playing unit test (T2):** the panel
  refreshes from resting to a real track when exemplars resolve for the
  selected genre; a failed preview surfaces the designed error line.
- **A renderer unit test (T1):** `setSelected(genre)` marks a node and
  `setSelected(null)` clears it; `draw()` is requested on change.
- **`e2e/polish.spec.ts` (new):**
  - Data caching: a second `page.goto("/")` does not re-download
    `genres.json` / `exemplars.json` (assert from response `fromCache` /
    the network trace), and the `<head>` preload hint is present.
  - Tactile feedback: clicking a genre draws the selected ring (assert via
    an exposed renderer flag, mirroring the existing `__renderer` hook) and
    `#now-playing` opens within the same interaction.
  - Keyboard core action: focus the canvas, press Enter, assert
    `#now-playing` opens for the centre genre and Stamp is focusable and
    operable by keyboard; the lit count rises after a keyboard stamp.
  - Focus trap: open the passport sheet, Tab through it, assert focus never
    leaves the dialog; repeat for the poster modal; assert focus restores on
    close.
  - Security headers: fetch `/` and assert `x-content-type-options`,
    `x-frame-options`, and `referrer-policy` are present and the `server`
    header carries no version; assert `/data/…` still carries its
    `Cache-Control`.
  - Mobile: at 390px, no horizontal scroll on the passport sheet and poster
    modal; `#legend-toggle` bounding box height ≥ 44; a genre tap sets
    `__nowPlaying.playing` true.
- **`e2e/map.spec.ts` / staging path (T8):** with SEED_DEMO=1 and empty
  storage, first paint shows a lit-over-dark map with lit count > 0 within
  the load budget; the guided crossing reaches "Frontier moved." within the
  first minute.

| Planner criterion | Proof |
| --- | --- |
| Hot paths meet the speed budget: first render < 1s, feedback < 100ms, pan/zoom smooth at full genre count on 390px | T1: caching + preload land (e2e asserts no re-download and the preload hint); the selected ring gives on-canvas feedback within the interaction (renderer unit test + e2e); pointermove hit-test throttled to one per frame; a captured pan/zoom measurement at 2,197 genres on 390px shows no stutter. Skeleton-first render is asserted by the existing `waitForMap`. |
| Every empty/loading/error state designed and in voice; copy sweep finds zero em/en dashes, banned vocab, negative phrasing | T2 closes the dare-blank, silent-track, and audio-error gaps (unit + e2e). T3 hardens the sweep to actually enforce negatives and to cover the two blind spots and region labels; `test/copy-lint.test.ts` passes. |
| Accessibility: contrast, visible focus, labeled inputs, semantic structure, keyboard reaches everything, on map/passport/dare/settings | T4: focus-trap e2e for both dialogs; keyboard-select e2e reaches hear+stamp on the map; single `<h1>` in the a11y tree; border contrast ≥ 3:1; now-playing live region scoped. Existing focus outlines and labeled `#lb-name` are re-confirmed. |
| Mobile: no horizontal scroll at 390px, ~44px targets, audio on tap | T5 + T1: e2e at 390px asserts no horizontal scroll on passport and poster, `#legend-toggle` ≥ 44px, and `__nowPlaying.playing` true after a tap. The existing dare mobile test still passes. |
| Security: proxy validates + rate-limits; no secrets; no PII in logs; no stack traces in any user surface | Re-confirmed by the existing `test/server.test.ts` / proxy tests (validation, 10/60s limit, fixed error strings, no name in logs) and the audit; T6 adds the static-surface headers, proven by the header e2e. No secrets remain tracked; `.env` gitignored. |
| README verified against the actual compose files end to end | T7: every command, port, and script name checked against the real compose/Dockerfile/package.json; fixed in-run if any drift. |
| Signature moment reachable within the first minute for a brand-new user, verified on staging | T8: SEED_DEMO=1 e2e shows lit-over-dark within the load budget and drives the guided crossing to "Frontier moved." within a minute; the EPIC-5 walkthrough gate is re-verified as non-regressed. |

Notes for the implementer:

- The e2e suite runs against the built app in the pinned Playwright
  container (`./scripts/e2e.sh`), starting nginx-served static output. For
  the security-header e2e, assert against the served response of the
  production build, not the vite dev server.
- Keep every feature e2e's existing `addInitScript` that sets
  `walkthrough-done`; the new `polish.spec.ts` cases that are not about the
  walkthrough should include it too, and the T8 staging case must NOT (it
  is verifying the first-run path).
- The renderer already exposes `window.__renderer` and `window.__nowPlaying`
  for e2e; expose a minimal `selected`-id read on `__renderer` for the
  tactile-feedback assertion rather than reading pixels.
- Prove pan/zoom smoothness with a captured frame-timing measurement or a
  recorded interaction artifact; a subjective "feels fine" is not a proof.
- `npm test`, `npm run typecheck`, and `./scripts/e2e.sh` must all pass at
  the end. Do not weaken any existing assertion to make room for a change.
