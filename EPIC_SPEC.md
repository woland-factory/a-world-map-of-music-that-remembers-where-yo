# EPIC SPEC — Hear it, stamp it (the passport)

## What this EPIC proves

EPIC 1 shipped the atlas: 2,197 genres laid out as a dark, pannable,
zoomable map, with lit rendering driven by a passport that only a demo
seeder could write. This EPIC makes the map **alive and yours**. Two
things become true for the first time:

1. **You can hear it.** Touch any genre and a 30-second preview plays,
   sourced from cached iTunes previews resolved offline at build time.
2. **You can keep it.** Tap Stamp and that genre lights in color, pinned
   to the track and the day that earned it, saved in the browser and
   exportable as a file you own.

The signature moment (the zoom-out: your glowing neighborhoods against a
dark world) becomes reachable through real user action, not a seed. This
EPIC turns a beautiful read-only map into the durable personal artifact
the whole product exists to build.

## Quality differentiator (this app must win here)

**Delight through tactility: an instant, alive map you can hear.** Touch
anywhere and it plays, your own territory glows out of the dark, and the
frontier visibly moves when you cross it. Every incumbent (Every Noise,
musicmap, Music-Map, volt.fm) is frozen, silent, stateless, or a list. We
win on the felt experience of a map you can hear and a world you are
visibly filling in.

**What it demands of THIS EPIC:** this is the EPIC where the
differentiator stops being a promise. It owns the two pillars EPIC 1
could only stage with a fake seed:

- **You can hear it, instantly.** A tap must produce sound with no
  perceptible wait. The preview URL is already in memory (loaded from a
  committed data file), playback starts inside the tap gesture, and
  visual feedback appears within 100ms no matter how fast the audio
  buffers. A tap that spins, stalls, or needs a network lookup before it
  plays fails the differentiator even if every checkbox is green.
- **The frontier moves when you cross it.** Stamping must light the
  genre in its region color *immediately* (optimistic), and that light
  must survive a reload. The felt loop is: touch, hear, stamp, watch
  your corner brighten.

A silent tap, a laggy stamp, or a passport that forgets on reload is a
differentiator failure, not a minor bug.

---

## Scope

### In scope

1. **Exemplar pipeline.** A committed, offline, incremental and resumable
   build stage that resolves **one iTunes preview per genre where one
   exists** and emits a committed `data/exemplars.json`. Honors a polite
   iTunes rate (~20 requests/min). Partial coverage is valid and flagged.
2. **Hear a genre.** Tapping a genre node on the map selects it, plays its
   30-second preview instantly, and reveals a "now playing" panel with the
   track and artist. A genre with no exemplar shows an honest resting
   state, never a broken player.
3. **Stamp a genre.** An explicit Stamp action lights the genre in its
   region color immediately (optimistic) and records a stamp with the
   first-listen date and the track that earned it. Persisted in browser
   storage; survives reload. A stamp can be removed (the inverse of the
   core action, so a mis-tap is recoverable).
4. **The passport view.** A panel listing every stamp with its
   first-listen date and the track that earned it, a "N of ~2,200 lit"
   count, a designed empty state, and a one-tap "See your map" that frames
   the zoom-out signature moment. Works from the first three stamps.
5. **Export and import.** One click exports the passport as a JSON file
   the user downloads; import restores it. Passport data never leaves the
   browser except that downloaded file. Import validates at the boundary.
6. **Passport v2 data model and migration.** Extend the stored passport
   from a bare id list to dated stamps with track metadata, migrating any
   existing v1 passport (and the demo seed) forward without data loss.
7. Mobile-first, accessible, designed states, copy sweep clean, README
   and `.env.example` updated for the new pipeline stage.

### Out of scope (non-goals — binding)

- **No daily dare.** No "today's genre", no date-seeded suggestion, no
  frontier/streak logic. That is EPIC 3. Do not add `streak`,
  `frontierHistory`, or a dare surface, even though the passport model
  will later grow them.
- **No ListenBrainz auto-fill.** No username entry, no
  `GET /api/listenbrainz/:username`, no backend proxy route, no
  auto-stamping from listening data. That is EPIC 4. This EPIC's app stays
  static (the only server is the static file server).
- **No accounts, login, or server-side storage of any kind.** The
  passport is local and portable.
- **No shareable poster / PNG export.** JSON export/import only. The
  poster is EPIC 4.
- **No first-run guided walkthrough.** The skippable orientation card from
  EPIC 1 stays as-is; do not build the multi-step guided success path
  (EPIC 5). See boundary clarifications.
- **No full-track playback or streaming.** 30-second iTunes previews only.
- **No runtime LLM, no genre blurbs.**
- **No in-app taxonomy editing, no user-submitted genres.**

### Boundary clarifications (read before building)

These sit exactly on the fence. Build them as written.

- **Hear-and-stamp is in scope; the dare is not.** Selecting a genre plays
  it and reveals a Stamp button; stamping lights it and records the stamp.
  What stays out is any *suggestion* of where to go next: no dare card, no
  "try this neighbor", no frontier advancement prompt. The user drives
  every selection by touching the map themselves.
- **Un-stamp is in scope; bulk editing is not.** A single stamp can be
  removed (from the now-playing panel or the passport view) so a mis-tap
  is recoverable. Do not build multi-select, bulk clear, undo history, or
  a "reset passport" beyond what import naturally does by replacing state.
- **First-run orientation stays as EPIC 1 shipped it.** QUALITY BAR §4's
  guided-success walkthrough is EPIC 5 and needs the dare loop to be
  meaningful. Now that stamping exists, keep the existing one-time
  orientation card; you MAY update its second line to point at the new
  core action (hear + stamp) since that is now reachable, but do NOT build
  a multi-step highlighted path. Building it here is drift into EPIC 5.

---

## Technical design

The stack is fixed by EPIC 1: Node + TypeScript pipeline, Vite static SPA,
Canvas 2D map, nginx static serving, runtime `env.js`. Reuse the existing
patterns (rate-limited client, append-only JSONL cache, deterministic
emit, `scripts/copy-data.mjs`, `role="img"` canvas, `localStorage` state).
The contracts below (schemas, budgets, thresholds) are firm; equivalent
implementations are fine where noted.

### New and changed files

```
pipeline/
  lib/itunes.ts          NEW  serialized iTunes Search client, ~20 req/min
  fetch-exemplars.ts     NEW  stage: resolve one preview per genre (resumable)
  emit-exemplars.ts      NEW  stage: write data/exemplars.json from cache
  index.ts               EDIT register exemplars + emit-exemplars stages
  types.ts               EDIT ExemplarRecord, ExemplarsFile shapes
data/
  cache/exemplars.jsonl  NEW committed resumable cache (one line per genre)
  exemplars.json         NEW committed OUTPUT (previews keyed by mbid)
web/src/
  types.ts               EDIT Exemplar, ExemplarIndex, Passport v2, Stamp
  state/passport.ts      EDIT v2 stamps, add/remove stamp, migrate, export/import
  state/exemplars.ts     NEW  load + index exemplars.json (Map by mbid)
  audio/player.ts        NEW  single Audio element, warm + play
  ui/nowPlaying.ts       NEW  now-playing panel (hear + stamp + resting state)
  ui/passportView.ts     NEW  passport panel (list, count, export/import, zoom-out)
  map/renderer.ts        EDIT hitTest(screenX,screenY) -> Genre | null
  map/input.ts           EDIT tap detection -> onSelect(genre)
  main.ts                EDIT wire exemplars, audio, now-playing, passport view
  index.html             EDIT passport button, now-playing + passport markup
  style.css              EDIT now-playing panel, passport sheet styles
scripts/copy-data.mjs    EDIT copy exemplars.json into web/public/data
data/demo-passport.json  KEEP names; seed synthesizes dates + tracks (below)
```

### Exemplar pipeline

**Source: iTunes Search API (no key).**
`https://itunes.apple.com/search?term=<genre>&entity=song&limit=25`.
Returns `{ resultCount, results: [{ trackName, artistName, previewUrl,
artworkUrl100, ... }] }`. For each genre, pick the **first result that has
a non-empty `previewUrl`** as the exemplar; record `trackName`,
`artistName`, `previewUrl`, and `artworkUrl100`. If no result has a
preview, record a negative (see cache) so the genre is not refetched.

**`pipeline/lib/itunes.ts` (new client, mirrors `lib/mb.ts`):**
- Serialized, single in-flight request, throttled to a **minimum 3000ms
  interval** (≤ ~20 req/min). No API key, no personal contact required.
- Set a descriptive `User-Agent` (reuse the app UA string; it needs no
  secret). Encode the query with `encodeURIComponent`.
- On `429`/`5xx`, honor `Retry-After` if present, else exponential
  backoff, with a bounded retry count. A genre that still fails after
  retries is left uncached (retried on the next pass), exactly like
  `fetch-cooccurrence`. Never abort the whole run for one genre.
- Export a `requestsMade()` counter for tests.

**Stage `fetch-exemplars` (`pipeline/fetch-exemplars.ts`):**
- Load the genre list from `data/cache/genres.json` (authoritative set).
- Read `data/cache/exemplars.jsonl`; build the set of already-completed
  mbids (positive *and* negative records both count as done).
- Front-load the same PRIORITY core set used by `fetch-cooccurrence` (the
  ground-truth genres and demo-passport genres) so a partial run yields a
  demo-ready, testable file. The rest follow in stable mbid order.
- For each pending genre: query iTunes, append **one** JSONL line
  (positive with track fields, or negative `{ mbid, name, found: false }`).
  One appended line per completed genre so an interrupted run resumes
  without repeating work.
- Log progress every N genres and a final `fetched / negative / to-retry`
  summary.

**Stage `emit-exemplars` (`pipeline/emit-exemplars.ts`):**
- Read `data/cache/exemplars.jsonl` and the committed atlas
  `data/genres.json` (for the authoritative mbid set and total count).
- Emit `data/exemplars.json` with only the **positive** exemplars, keyed
  by **mbid** (stable across atlas rebuilds; the client joins on
  `genre.mbid`). Drop any cached mbid absent from the current atlas.
- Deterministic: sort keys by mbid; use a fixed `generated` timestamp read
  from `data/cache/genres.json`'s `fetchedAt` (same source EPIC 1 uses),
  so two runs from the same cache produce a byte-identical file with **no
  network calls**.

**`data/exemplars.json` schema (forward-only):**
```jsonc
{
  "version": 1,
  "generated": "2026-09-10T00:00:00Z",   // = genres cache fetchedAt (deterministic)
  "source": "iTunes Search API",
  "coverage": { "total": 2197, "withPreview": 1487 },  // honest, flagged
  "exemplars": {
    "b74b3b6c-...": {                     // key = genre mbid
      "trackTitle": "…",
      "artist": "…",
      "previewUrl": "https://audio-ssl.itunes.apple.com/…m4a",
      "artworkUrl": "https://…/100x100bb.jpg"            // optional; omit if absent
    }
  }
}
```
- **Size budget:** `data/exemplars.json` gzipped MUST be under **300KB** so
  it never delays first render. If real coverage pushes it over, drop
  `artworkUrl` first (artwork is a nice-to-have, the preview is the point).
- Forward-only: EPIC 3/4 may add fields; do not remove or rename these.

**Resumability contract (must hold, mirrors EPIC 1):** deleting
`data/exemplars.json` and re-running `emit-exemplars` with the cache
present regenerates a byte-identical file with **zero** network calls;
deleting one genre's line from `exemplars.jsonl` and re-running the fetch
stage refetches **only** that genre. `data/cache/exemplars.jsonl` is
committed so a fresh clone resumes rather than restarts.

**Package scripts (add, keep the atlas pipeline separate so an atlas
rebuild never triggers iTunes fetches):**
- `exemplars:fetch` → `tsx pipeline/index.ts exemplars`
- `exemplars:emit` → `tsx pipeline/index.ts emit-exemplars`

### Passport v2 (client state, browser-only)

Extend `web/src/state/passport.ts`. The renderer only needs a lit set, so
`litSet(passport)` keeps returning `Set<genreId>`; the renderer is
unchanged apart from `hitTest`.

```ts
interface Stamp {
  genreId: number;      // atlas id, for fast lit lookup this session
  mbid: string;         // stable across atlas rebuilds (join key on import)
  date: string;         // first-listen date, "YYYY-MM-DD" (local)
  trackTitle?: string;  // the track that earned it (from the exemplar)
  artist?: string;
}
interface Passport {
  version: 2;
  stamps: Stamp[];      // at most one per genre; genreId unique
}
```

- **`localStorage` key stays `passport`.** `readPassport()` runs a
  `migratePassport(raw)`:
  - v2 object with a `stamps` array → validated passthrough (drop stamps
    whose genreId/mbid is not resolvable in the loaded atlas; coerce/repair
    types; keep at most one stamp per genre).
  - **legacy v1** `{ lit: number[] }` (what EPIC 1 and the old demo seed
    wrote) → convert each id to `{ genreId, mbid, date: today }` with no
    track fields (unknown at migration time). No data is lost; the map
    stays lit.
  - anything else / corrupt → treat as empty passport.
- **`addStamp(genreId, exemplar?)`**: no-op if already stamped; else append
  a stamp with `date = today` (local `YYYY-MM-DD`) and, when an exemplar
  exists, `trackTitle`/`artist` from it. Persist synchronously.
- **`removeStamp(genreId)`**: drop the stamp, persist.
- **`exportPassport()`**: serialize the current passport to a JSON string
  for download (see UI). No network.
- **`importPassport(text)`**: parse and **validate at the boundary**
  before replacing state:
  - reject non-JSON / wrong shape with a product-voice error (no stack
    trace);
  - cap `stamps` length at the atlas genre count; drop stamps whose `mbid`
    is not in the atlas; re-resolve `genreId` from `mbid` against the
    loaded atlas (so an import survives an atlas rebuild); truncate
    `trackTitle`/`artist` to a sane length; keep dates only if they match
    `YYYY-MM-DD`, else drop the date field.
  - Strings are rendered with `textContent` only (never `innerHTML`), so a
    malicious import cannot inject markup.

### Demo seed (staging must show a rich passport)

`data/demo-passport.json` stays a list of genre **names** (survives atlas
regeneration). The seeding path in `resolveInitialPassport` (already gated
by `SEED_DEMO` + "no existing passport") now produces **full v2 stamps**:
for each resolved name, create a stamp whose `date` steps back a few days
from today (deterministic per index, so the passport view shows a
plausible exploration history) and whose `trackTitle`/`artist` come from
the loaded exemplar when present. This makes the staging passport view
demonstrate its real value (dated stamps with tracks), not a bare list.

### Hearing a genre (audio + selection)

**Loading exemplars (`web/src/state/exemplars.ts`):** fetch
`/data/exemplars.json` and build a `Map<mbid, Exemplar>`. Load it **in
parallel with, and never blocking, the map render** (the map paints from
`genres.json` first; audio becomes available when exemplars resolve).
`getExemplar(genre)` returns the entry or `undefined`.

**Audio (`web/src/audio/player.ts`):** ONE reusable `HTMLAudioElement`,
`preload="auto"`.
- `warm(url)`: if `url` differs from the current src, set src (begins
  buffering). Called on desktop hover and on the pointerdown that may
  become a tap, so the clip is warm before the tap resolves.
- `play(url)`: set src if needed, then `play()`. MUST be called
  synchronously inside the tap gesture so mobile autoplay policy is
  satisfied. Selecting a new genre stops the previous clip; a clip plays
  to its natural 30s end otherwise.
- `stop()`: pause and reset. Called when the now-playing panel closes or
  the user taps empty map space.
- Expose a test hook `window.__nowPlaying = { mbid, trackTitle, artist,
  hasPreview, playing }`, updated synchronously on select (audio output is
  unreliable in headless browsers; tests assert intent + UI, not sound).

**Hit-testing (`map/renderer.ts`):** add
`hitTest(screenX, screenY): Genre | null` — invert the viewport transform,
find the nearest genre within a **tap radius of ~14px** (comfortable on
touch); return null if none. Linear scan over 2,197 nodes is well under a
frame; no spatial index needed.

**Tap vs pan (`map/input.ts`):** a pointer sequence is a **tap** when
pointerup occurs within ~6px of pointerdown and under ~400ms; a larger
move is a pan (unchanged). On tap, call `onSelect(genre | null)` supplied
by `main.ts`. On pointerdown of a potential tap over a genre, call
`audio.warm(previewUrl)` to pre-buffer.

**Selection flow (`main.ts` + `ui/nowPlaying.ts`):** on select of a genre:
1. Synchronously (this tick, well under 100ms): highlight the node, open
   the now-playing panel with the track/artist (or resting state), update
   `window.__nowPlaying`.
2. If it has a preview, `audio.play(url)`; else leave the panel in the
   resting state (no player controls, no error).
3. The panel shows a **Stamp** button (primary). Tapping it calls
   `addStamp`, then `renderer.setLit(newLitSet)` **immediately**
   (optimistic light), updates the canvas `aria-label` lit count, and
   flips the button to a stamped state with a Remove affordance. Persist
   after the optimistic render.
- Selecting empty space (`hitTest` null) closes the panel and stops audio.

### The passport view (`ui/passportView.ts`)

A panel/sheet toggled by a **Passport button** (top-right, ≥44px, shows the
lit count as a badge). Contents:
- **Header:** title `Passport`, count line `{N} of ~2,200 lit` (use the
  literal `~2,200`; N is live).
- **Stamp list:** newest first. Each row: a region-color swatch, the genre
  name, a secondary line `"{trackTitle} · {artist}"` when known (middot
  separator, not a dash) else the date alone, and the first-listen date.
  Each row has a small **Remove** control. Rows are the only unbounded
  list in the app; it is capped by the genre count (~2,200) and scrolls
  within the sheet, so it cannot grow without bound.
- **Empty state (designed, positive, directive, points at the map):**
  headline `Your map is dark`, body `Tap a genre to hear it. Stamp the
  ones you love.`, and the panel closes to reveal the map. (No blank
  region, no negative phrasing.)
- **Actions:** `Export` (download), `Import` (file picker), and
  `See your map` — the last closes the panel and calls `renderer.fit()` so
  the user lands on the zoom-out signature moment (their glow against the
  dark). This works from the first three stamps with no special case.
- **Export:** build a `Blob` of `exportPassport()`, create an object URL,
  click a hidden `<a download="music-passport.json">`, revoke the URL. No
  network.
- **Import:** hidden `<input type="file" accept="application/json">`; on
  change, read the file, call `importPassport(text)`; on success replace
  state, `renderer.setLit(...)`, refresh the list and count; on failure
  show a product-voice inline message (see copy).

### Designed states and copy (verbatim, already swept)

Use these strings exactly. If you change them, re-sweep for em-dashes/
en-dashes, banned vocabulary, and negative empty-state phrasing.

- **Now playing, has preview:** primary button `Stamp`; once stamped, the
  control shows `Stamped {date}` with a secondary `Remove stamp`.
- **Now playing, resting state (genre has no preview):** body
  `Silent for now. Stamp it to remember.`; primary button `Stamp`. (No
  player controls, no error, no "no preview" text.)
- **Passport button label / aria-label:** `Passport`.
- **Passport header:** `Passport`; count line `{N} of ~2,200 lit`.
- **Passport empty state:** headline `Your map is dark`; body `Tap a genre
  to hear it. Stamp the ones you love.`
- **Passport actions:** `Export`, `Import`, `See your map`.
- **Import success (inline):** `Passport restored.`
- **Import failure (inline, product voice, actionable):** `That file did
  not look like a passport. Pick a passport you exported here.`
- **Row remove control aria-label:** `Remove stamp` (+ genre name for
  screen readers).

Sweep note: separators in the stamp list use the middot `·`, never a dash.
The count uses `~2,200`. The failure copy avoids "something went wrong"
and stack traces. Extend the copy-lint test's dynamic-string list with all
strings above (the ones built in TS), since only `index.html` is scanned
from disk.

### Accessibility and mobile

- The now-playing panel and passport sheet are real DOM with headings,
  labeled buttons, and visible focus (reuse the EPIC 1 `:focus-visible`
  rules). Every button ≥44px. Opening the passport moves focus into it;
  closing returns focus to the Passport button. `Escape` closes either
  overlay.
- The canvas `aria-label` continues to report genre and lit counts; update
  it on every stamp/un-stamp so assistive tech hears the frontier move.
- The map is a canvas, so genre selection is pointer-driven; provide a
  keyboard path to the passport and its controls (they are DOM). Selecting
  individual genres by keyboard on the canvas is **not** required in this
  EPIC (canvas node-level keyboard nav is a known limitation carried
  forward; note it, do not build a hidden DOM node per genre now).
- Mobile-first at 390px: passport is a bottom/full sheet, now-playing
  panel sits above the zoom controls and clears the safe-area insets, no
  horizontal scroll, artwork and text readable without zoom.

### Performance

- First meaningful render is unchanged and must stay <1s: the map paints
  from `genres.json`; `exemplars.json` loads in parallel and only gates
  audio, never the map.
- Stamp feedback is optimistic and synchronous (<100ms): light the node,
  then persist.
- No unindexed hot-path work: hit-test is a bounded linear scan; the stamp
  list is capped by the genre count and scrolls.

### Deploy, README, env

- `scripts/copy-data.mjs`: add `exemplars.json` to the copied files, with a
  safe placeholder (`{ "version":1, "generated":"1970-01-01T00:00:00Z",
  "source":"iTunes Search API", "coverage":{"total":0,"withPreview":0},
  "exemplars":{} }`) when the file is absent, so dev/build work before the
  exemplar pipeline has run.
- No new runtime env is required (no key, no backend). Do not add secrets.
  `.env.example` gains a short comment that the exemplar stage needs no
  key. `SEED_DEMO` behavior is unchanged (now seeds richer stamps).
- **README:** add the exemplar pipeline to the "regenerate the data"
  section with the exact new script names (`npm run exemplars:fetch`,
  `npm run exemplars:emit`), noting it is incremental, resumable, honors
  the polite iTunes rate, and that partial coverage is expected and shown
  honestly. Update the one-line product description if needed to mention
  hearing and stamping. Verify every command against the actual files. No
  factory internals.

---

## Ordered task list (each with acceptance criteria)

### Task 1 — Exemplar fetch stage (resumable, rate-limited)
Add `lib/itunes.ts`, `fetch-exemplars.ts`, wire the `exemplars` stage into
`index.ts` and `package.json`. Add `ExemplarRecord` to `pipeline/types.ts`.
- **AC:** running the stage appends to `data/cache/exemplars.jsonl` (one
  line per completed genre, positive or negative); re-running makes
  **zero** network calls for already-cached genres; deleting one line
  refetches only that genre; requests are throttled to ≤ ~20/min;
  transient failures are retried and, if still failing, left for the next
  pass without aborting the run.

### Task 2 — Emit `data/exemplars.json` (deterministic, flagged, budgeted)
Add `emit-exemplars.ts` and wire it into `index.ts`/`package.json`.
- **AC:** given a fixed cache and committed atlas, emit writes
  `data/exemplars.json` keyed by mbid with only positive exemplars, a
  `coverage` object, and a deterministic `generated`; two runs from the
  same cache are **byte-identical** with no network; every key resolves to
  a genre in `data/genres.json`; the file is **under 300KB gzipped**.

### Task 3 — Real exemplar data committed
Run the exemplar pipeline against real iTunes data (to completion or to a
committed resumable checkpoint with broad coverage of the priority set and
the demo genres), commit `data/exemplars.json` and
`data/cache/exemplars.jsonl`.
- **AC:** `data/exemplars.json` is committed with real previews; every
  `data/demo-passport.json` genre that has an iTunes preview resolves to
  one (so staging can hear and show tracks); coverage is reported honestly
  in the file; the gzip budget holds.

### Task 4 — Passport v2, migration, stamp/un-stamp, export/import
Extend `state/passport.ts`: v2 stamps, `migratePassport`, `addStamp`,
`removeStamp`, `exportPassport`, `importPassport` with boundary
validation. Update the demo seed to synthesize dated stamps with tracks.
- **AC:** a legacy `{lit:[...]}` passport migrates to v2 with the same
  genres lit and no data loss; adding a stamp records genreId, mbid, local
  date, and track fields when an exemplar exists; removing works; export
  then import round-trips to an equivalent passport; import rejects
  non-JSON/garbage without throwing to the UI, drops stamps whose mbid is
  absent from the atlas, re-resolves genreId from mbid, and caps length;
  imported strings are never rendered as HTML.

### Task 5 — Load exemplars, audio, hit-test, tap-to-select
Add `state/exemplars.ts`, `audio/player.ts`; add `renderer.hitTest`; add
tap detection + `onSelect` to `input.ts`; wire selection in `main.ts`.
- **AC:** exemplars load in parallel and never delay first render; tapping
  a genre selects it and (with a preview) starts audio within the tap
  gesture with visible feedback under 100ms; a drag still pans and does not
  select; tapping empty space deselects and stops audio; `window.__nowPlaying`
  reflects the current selection synchronously.

### Task 6 — Now-playing panel and optimistic stamp
Add `ui/nowPlaying.ts` and its markup/styles. Wire Stamp / Remove.
- **AC:** selecting a genre with a preview shows the track and artist and a
  Stamp button; selecting a genre without a preview shows the resting-state
  copy and a Stamp button, never a broken player; tapping Stamp lights the
  genre in its region color immediately and persists across reload; the
  canvas `aria-label` lit count updates; Remove un-lights and persists.

### Task 7 — Passport view, count, export/import UI, zoom-out
Add `ui/passportView.ts`, the Passport button, markup and styles; wire
export download and import file picker; `See your map` calls `fit()`.
- **AC:** the passport lists every stamp with its first-listen date and the
  track that earned it, shows `N of ~2,200 lit`, and updates live on
  stamp/un-stamp/import; the empty state shows the designed copy and points
  at the map; Export downloads `music-passport.json` with no network;
  Import restores the passport and re-lights the map; `See your map` frames
  the zoom-out and works from the first three stamps; usable at 390px with
  no horizontal scroll and ≥44px targets; focus is managed and `Escape`
  closes.

### Task 8 — States, accessibility, copy sweep, README, tests
Final pass: designed states, focus management, extend the copy-lint
dynamic-string list, update `scripts/copy-data.mjs`, `.env.example`,
`README.md`, and wire all tests below into `npm test`.
- **AC:** `npm test` runs green; the copy sweep over every user-visible
  string (including the new TS strings) finds zero em-dashes/en-dashes,
  zero banned vocabulary, and zero negative empty-state phrasing; the
  README commands are verified against the actual files; `.env.example`
  holds placeholders only and mentions no key is needed for exemplars.

---

## Test plan (which automated test proves each planner criterion)

- **T1 — Exemplar pipeline resolves, incremental, resumable, rate-flagged.**
  Integration test with a mocked iTunes fetch over a small fixture genre
  cache: (a) the fetch stage appends one line per genre and makes zero
  calls for already-cached genres; (b) removing one cache line causes only
  that genre to be refetched; (c) the throttle enforces the ≥3000ms
  interval (assert the client's spacing/`requestsMade` under fake timers or
  a spy); (d) a genre with no preview records a negative and is not
  refetched. **Proves:** *resolves one preview per genre where one exists,
  incremental and resumable, honors ~20 req/min, partial coverage valid and
  flagged.*

- **T2 — `exemplars.json` schema, coverage, join, budget.** Load the
  committed `data/exemplars.json` and `data/genres.json`: every exemplar
  key is an mbid present in the atlas; each entry has non-empty
  `previewUrl`, `trackTitle`, `artist`; `coverage.total` equals the atlas
  genre count and `withPreview` equals the entry count; two emit runs from
  the same cache are byte-identical; gzipped size < 300KB. **Proves:**
  *commits `data/exemplars.json`, one preview per genre where one exists,
  coverage flagged.*

- **T3 — Hear a genre within 100ms perceived; honest resting state.** E2E:
  tap a known-preview genre; assert the now-playing panel shows the track
  and `window.__nowPlaying.playing` is true within a tight budget (audio
  intent + UI, not sound output); tap a genre known to lack a preview and
  assert the resting-state copy shows and no player/error element appears.
  Unit: `audio.play` sets src and calls play; selecting a new genre stops
  the previous. **Proves:** *touching a genre starts audio within 100ms as
  perceived; a genre with no preview shows an honest resting state.*

- **T4 — Optimistic stamp lights immediately and persists.** E2E: select a
  genre, click Stamp, assert the canvas `aria-label` lit count increments
  synchronously; reload and assert the genre is still lit (localStorage).
  Unit: `addStamp` is idempotent, records date + track; `litSet` includes
  it; `removeStamp` reverses it. **Proves:** *tapping stamp lights the
  genre in color immediately (optimistic) and persists across reload.*

- **T5 — Passport view: list, count, zoom-out from three stamps.** E2E:
  seed three stamps, open the passport, assert three rows each with a date
  and the earning track, the `N of ~2,200 lit` count, and that
  `See your map` closes the panel and fits the view (renderer viewport
  changes to the fit scale). Empty-passport E2E: the empty-state copy shows
  and points at the map. **Proves:** *passport lists stamps with
  first-listen date and the track that earned each, shows N of ~2,200 lit,
  zoom-out works from the first three stamps.*

- **T6 — Export/import round-trip, browser-only, validated.** Unit:
  `exportPassport`→`importPassport` yields an equivalent passport;
  `importPassport` rejects non-JSON and wrong shapes without throwing to
  the UI, drops stamps whose mbid is not in the atlas, re-resolves genreId
  from mbid, and caps length. E2E: Export triggers a `music-passport.json`
  download (assert the download event / `a[download]`); no network request
  leaves the origin during export/import (assert via route interception).
  **Proves:** *one click exports JSON, import restores it, data never
  leaves the browser except the downloaded file.*

- **T7 — Empty state, mobile, accessibility, copy sweep.** E2E at 390px:
  no horizontal scroll with the passport open; Passport button and actions
  ≥44px; focus enters the passport on open and `Escape` closes it. Copy
  lint (extended `visibleCopy()` including the new TS strings): zero
  em-dashes/en-dashes, zero banned vocabulary, zero negative empty-state
  phrasing. **Proves:** *empty passport state uses positive, directive copy
  and points at the first action; mobile-first, accessible, copy sweep
  clean.*

- **T8 — Migration and demo seed.** Unit: a stored legacy `{lit:[...]}`
  migrates to v2 with the same genres lit; with `SEED_DEMO="1"` and no
  stored passport, the seed produces v2 stamps with dates and (where the
  exemplar exists) tracks, and every demo name that resolves is stamped.
  **Proves:** the demo/staging passport view demonstrates real value, and
  no existing passport is lost.

---

## Assumptions and decisions (stated for the reviewer)

- **The planner's scope block was present and authoritative;** this spec
  expands it directly and does not re-derive scope from the title.
- **iTunes exemplars are keyed by mbid, not atlas id,** so the previews
  survive an atlas rebuild that renumbers genre ids; the client joins on
  `genre.mbid`. The atlas pipeline and the exemplar pipeline stay
  independent (separate scripts) so rebuilding one never forces the other.
- **Selection plays; an explicit Stamp button stamps.** Tapping a node is
  low-commitment (hear it); stamping is a deliberate second action, so a
  tap never accidentally writes to the passport. This satisfies "touch to
  hear, tap to stamp" without accidental stamps on a dense field of dots.
- **Un-stamp is included** as the inverse of the core action, because a
  mis-tap on ~2,200 small nodes is likely and an unrecoverable stamp would
  make the artifact feel fragile. Bulk editing stays out of scope.
- **The 100ms budget is met by preloading + synchronous feedback,** not by
  assuming instant network audio: the preview URL is in memory, playback
  starts inside the gesture, and the node highlight plus now-playing panel
  appear the same tick. Actual buffering may take longer; the felt latency
  does not.
- **Partial preview coverage is expected and shown honestly** (per-genre
  resting state in the UI, `coverage` in the data file). The long tail of
  obscure genres will lack previews; the popular core (including the demo
  genres) will not, which is what makes staging sing.
- **No new backend, no new env, no key.** iTunes Search needs none; the
  passport is browser-only. The app stays static, consistent with the
  EPIC's non-goals.
- **Canvas per-node keyboard selection is deferred,** not built: it is a
  known limitation carried from EPIC 1. All DOM controls (passport, now
  playing, export/import) are fully keyboard reachable with visible focus.
</content>
</invoke>
