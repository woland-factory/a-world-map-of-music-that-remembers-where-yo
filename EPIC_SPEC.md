# EPIC SPEC — The genre atlas, and the staging scaffold

## What this EPIC proves

This is the foundation bet. Build the offline pipeline that turns open
MusicBrainz data into a committed `data/genres.json` (every genre with 2-D
coordinates, an adjacency list, and a region cluster), render it as a
pannable, zoomable, dark-by-default map, and stand up the staging deploy
scaffold. The single question this EPIC answers, with eyes on a real
screen: **is the layout good enough to build a product on?** Metal
subgenres must cluster, jazz must border blues, zeuhl must sit near prog
rock. If the layout is arbitrary after honest iteration, the product
should be killed here, not dressed up later.

## Quality differentiator (this app must win here)

**Delight through tactility: an instant, alive map you can hear.** Touch
anywhere and it plays, your own territory glows out of the dark, and the
frontier visibly moves when you cross it. Every incumbent is frozen,
silent, stateless, or a list. We win on the felt experience of a map you
can hear and a world you are visibly filling in.

**What it demands of THIS EPIC:** hearing, stamping, and the dare are
later EPICs, but the *map itself* is born here, and its feel is the
whole differentiator. This EPIC owns two of the differentiator's four
pillars: **instant** (skeleton immediately, real map fast, pan and zoom
that never stutters on a phone) and **glowing territory out of the dark**
(lit genres render in color over an unlit dark field, proven on staging
with a seeded demo passport). A map that loads slowly, janks while
panning, or reads as a flat list of dots fails the differentiator even if
every checkbox is green.

---

## Scope

### In scope

1. A committed, offline, **incremental and resumable** build pipeline
   that ingests MusicBrainz genres, genre-genre relationships, and artist
   tag co-occurrence, and emits a committed `data/genres.json`.
2. `data/genres.json`: every MusicBrainz genre with `x`/`y` coordinates,
   a `neighbors[]` adjacency list, and a `region` id.
3. A static single-page web app that renders all genres as a dark,
   pannable, zoomable, labeled map, mobile-first at 390px.
4. Lit-vs-unlit rendering: genres unlit (dim) by default; a passport (a
   set of genre ids) makes those genres glow in their region color.
5. The `SEED_DEMO` affordance that seeds a fixed demo passport so staging
   shows a partly-lit map within a minute.
6. Designed loading, error, and first-run orientation states in the
   product's voice.
7. The staging deploy scaffold: `Dockerfile`, `docker-compose.staging.yml`,
   runtime env config, `.env.example` with placeholders only.
8. `LAYOUT_NOTES.md` recording the eyes test with a screenshot artifact.
9. `README.md` a stranger can use to clone, configure, and run the app.

### Out of scope (non-goals — binding)

- **No stamping.** There is no user control to record a genre, no
  tap-to-stamp, no write to the passport from user interaction. The only
  writer of passport data in this EPIC is the `SEED_DEMO` seeder.
- **No previews / audio.** No iTunes calls, no players, no `exemplars.json`.
- **No daily dare.**
- **No accounts, no login, no backend proxy route.** (The ListenBrainz
  proxy and `/healthz` app route belong to EPIC 4.) This EPIC's app is
  static; the only server is the static file server in the compose file.
- No poster export, no passport view screen, no ListenBrainz.

### Two boundary clarifications (read before building)

These two lines sit exactly on the fence. Build them as written.

- **Lit rendering is in scope; the stamp interaction is not.** The
  acceptance criteria require staging to show a partly-lit map
  (`SEED_DEMO`), and the differentiator is territory glowing out of the
  dark. So the renderer MUST support a lit state driven by a passport.
  What stays out is the *interaction* that creates stamps. In this EPIC
  the passport is populated only by the demo seeder, never by clicking a
  genre. Do not add a stamp button, a tap-to-light gesture, or any
  interaction-driven passport write.
- **First-run orientation is in scope; the guided success walkthrough is
  EPIC 5.** QUALITY BAR §4 requires a brand-new user to understand the
  product and reach the core action. In this EPIC the reachable core
  action is *exploring the map* (pan and zoom), because stamping does not
  exist yet. So build a light, skippable first-run orientation that (a)
  says in one line what the map is and (b) invites the user to explore.
  Do NOT build the multi-step guided path that walks the stamp-hear-light
  success. That path needs the stamp action and is owned by EPIC 5.
  Building it here is drift into a non-goal.

---

## Technical design

### Stack and repository layout

Recommended, buildable-by-one-agent stack. Equivalent substitutions are
fine where noted; the contracts (schema, endpoints, budgets, thresholds)
are firm.

- **Pipeline:** Node.js + TypeScript scripts. Graph work with the
  `graphology` ecosystem: `graphology`, `graphology-layout-forceatlas2`
  (layout), `graphology-communities-louvain` (region clustering). These
  are the recommended libraries because they are deterministic with a
  fixed seed and purpose-built for exactly this graph-to-map job.
- **Frontend:** Vite static build. **Canvas 2D** for the map (WebGL is
  allowed but not required; ~2,200 nodes render smoothly on Canvas 2D
  with a viewport transform and redraw-on-change). No UI framework is
  required; a small one is fine if it does not bloat first render.
- **Serving:** static files behind nginx in the container.

```
/                         repo root
  data/
    genres.json           committed OUTPUT (the atlas)
    demo-passport.json    committed demo seed (list of genre NAMES)
    cache/                committed resumable pipeline cache (see below)
  pipeline/               build-time TS scripts (Node)
    index.ts              orchestrator: runs stages, resumable
    fetch-genres.ts
    fetch-relations.ts
    fetch-cooccurrence.ts
    build-graph.ts        similarity edges + top-K neighbors
    layout.ts             ForceAtlas2, fixed seed
    cluster.ts            Louvain, fixed seed
    emit.ts               writes data/genres.json
  web/                    Vite SPA
    index.html
    src/
      main.ts
      map/renderer.ts     canvas draw + viewport transform
      map/input.ts        pan (drag/touch) + zoom (wheel/pinch) + keyboard
      map/legend.ts       region legend (accessible DOM)
      state/passport.ts   read passport + SEED_DEMO seeding
      state/env.ts        reads window.__ENV__
      ui/states.ts        skeleton / error / first-run orientation
  test/                   automated tests (see Test plan)
  Dockerfile
  docker-compose.staging.yml
  .env.example
  README.md
  LAYOUT_NOTES.md
  package.json
```

### Data sources (MusicBrainz web service)

Use the MusicBrainz WS/2 JSON API. Do **not** attempt to download or
parse the multi-GB database dumps; the API plus disk caching is the
buildable path and satisfies the resumability contract.

- Base URL: `https://musicbrainz.org/ws/2/`
- **Rate limit: at most 1 request per second.** Serialize requests and
  sleep between them. Set a descriptive `User-Agent` identifying the app
  and a contact (MusicBrainz requires this). Read the contact from an env
  var with a placeholder in `.env.example`; never hardcode a personal
  address in tracked files.
- **Genre list:** `GET /genre/all?fmt=json&limit=100&offset=N`. Returns
  `{ "genre-count": N, "genres": [{ "id": <mbid>, "name": <string> }] }`.
  Page through all offsets. This is the authoritative set of genres the
  output must cover.
- **Genre-genre relationships:** attempt
  `GET /genre/<mbid>?inc=genre-rels&fmt=json` and ingest any relationships
  (subgenre-of, fusion-of, and similar) as **strong** edges. If the genre
  entity returns no such relationships, proceed on co-occurrence alone.
  Co-occurrence is the primary, always-available signal; genre-rels are a
  boost where present.
- **Artist tag co-occurrence (primary similarity signal):** for each
  genre `G`, fetch up to 100 top artists tagged with `G` via
  `GET /artist?query=tag:"<G>"&fmt=json&limit=100`. From those artists,
  read the tags present on each artist and accumulate a weighted count of
  every other tag that is itself a known genre. If the search response
  does not include per-artist tags, fall back to
  `GET /artist/<mbid>?inc=tags&fmt=json` per artist (heavier, still
  cached and resumable). The result is, per genre, a vector of co-tag
  weights over other genres.

### Pipeline: stages and resumability

The pipeline is a sequence of stages orchestrated by `pipeline/index.ts`.
It must be **incremental and resumable**: an interrupted run resumes from
committed cache without re-fetching, and a full run is allowed to take
longer than an hour. Partial coverage is a valid, committable state.

Stages:

1. **fetch-genres** → writes `data/cache/genres.json` (raw genre list).
   Cheap; a few paginated calls.
2. **fetch-relations** → per-genre genre-rels, cached in
   `data/cache/relations/` (or one JSONL). Skips genres already cached.
3. **fetch-cooccurrence** → per-genre co-occurrence vectors, cached in
   `data/cache/cooccurrence.jsonl` (append-only, one line per completed
   genre). The heavy stage. On each run it processes only genres not yet
   present in the cache, so resuming after interruption never repeats
   work. This is what makes a >1h build safe.
4. **build-graph** → from the cache, compute pairwise genre similarity
   (cosine similarity of co-occurrence vectors; add a fixed boost when an
   explicit genre relationship exists), keep the **top-K = 10** most
   similar neighbors per genre as edges. Deterministic.
5. **layout** → ForceAtlas2 on the graph with a **fixed seed** and a fixed
   iteration count; normalize coordinates into a stable bounds box.
   Deterministic: same cache in, same coordinates out.
6. **cluster** → Louvain community detection with a fixed seed → integer
   `region` id per genre. Label each region by the name of its
   highest-degree (most central) genre for the legend.
7. **emit** → write `data/genres.json` (schema below), covering **every**
   genre from stage 1. A genre with no co-occurrence data yet still
   appears (placed by whatever edges exist, or isolated); coverage is
   honest, never faked.

Resumability contract to satisfy: deleting `data/genres.json` and
re-running the pipeline with the cache present regenerates an identical
file **without any network calls**; deleting one genre's cache entry and
re-running re-fetches only that genre. `data/cache/` is committed so a
fresh clone resumes rather than restarts.

### `data/genres.json` schema (forward-only)

```jsonc
{
  "version": 1,
  "generated": "2026-09-10T00:00:00Z",   // ISO timestamp from the run
  "source": "MusicBrainz",
  "bounds": { "minX": number, "maxX": number, "minY": number, "maxY": number },
  "regions": [
    { "id": 0, "label": "metal" }         // label = most central genre in region
  ],
  "genres": [
    {
      "id": 0,                            // 0-based integer index, stable within a build
      "mbid": "b74b3b6c-...",             // MusicBrainz genre id
      "name": "black metal",
      "x": 123.4,
      "y": -56.7,
      "region": 3,                        // references regions[].id
      "neighbors": [12, 45, 78]           // up to 10 genre ids, most similar first
    }
  ]
}
```

- `neighbors` holds **integer `id`s** (not MBIDs) to keep the file lean.
- Every `neighbors` entry MUST reference an existing `genres[].id`.
- The file is forward-only extensible: EPIC 2 will add exemplar fields.
  Do not add exemplar/coverage/preview fields now.
- **Size budget:** `data/genres.json` gzipped MUST be under 400KB so first
  render is fast.

### Passport, demo seed, and `SEED_DEMO`

- **Passport shape (client-only, this EPIC):** the minimum needed to light
  the map. `{ "lit": [<genreId>, ...] }` in browser storage
  (`localStorage` key e.g. `passport`). No stamp metadata is required in
  this EPIC (dates and tracks arrive in EPIC 2).
- **`data/demo-passport.json`:** a committed, small list of genre **NAMES**
  (not ids, so it survives pipeline regeneration) chosen to produce the
  signature look: roughly **three glowing neighborhoods** in a dark world.
  Pick a few metal subgenres, a few jazz/blues genres, and a few
  electronic genres, all names that exist in the MusicBrainz genre set.
  The app resolves names to ids at load time by name lookup; names absent
  from the atlas are skipped.
- **`SEED_DEMO` flow (runtime env, no rebuild):** the static app reads a
  runtime config object `window.__ENV__` injected by a small file
  `env.js`. The container entrypoint generates `env.js` from environment
  variables at start (envsubst on a template), so the same image toggles
  behavior via env. When `window.__ENV__.SEED_DEMO === "1"` and no
  passport exists yet, the app seeds the passport from
  `demo-passport.json` on first load. When unset or `"0"`, the app starts
  with an empty (all-dark) passport. `.env.example` lists `SEED_DEMO`
  with a placeholder; `docker-compose.staging.yml` sets `SEED_DEMO=1`.

Do not use Vite build-time env for `SEED_DEMO`; the runtime `env.js`
pattern is required so staging can toggle the seed without rebuilding.

### Frontend rendering

- **Canvas map.** One full-viewport canvas, `devicePixelRatio`-aware. A
  viewport transform (offset + scale) maps atlas coordinates to screen.
  Redraw on change only (requestAnimationFrame), not in a busy loop.
- **Unlit genres:** dim, low-contrast dots on a near-black background.
- **Lit genres (passport):** rendered in their `region` color at high
  lightness with a soft glow so territory reads as *glowing out of the
  dark*. Assign region colors from a fixed palette of distinct hues
  (aim for reasonable separation and good contrast on dark; a
  colorblind-aware ordering is preferred but not required to be perfect).
- **Labels:** legible at appropriate zoom. Show labels only for nodes
  above a screen-size/zoom threshold and within the viewport to avoid
  clutter; enforce a minimum readable font size and sufficient contrast.
  At the default zoomed-out view, show a small number of region-level or
  high-degree labels so the map is never an unlabeled dot field.
- **Pan and zoom:** drag to pan (mouse and touch); wheel and pinch to
  zoom; on-screen zoom in/out and reset-view controls (each ≥44px).
  Keyboard: arrow keys pan, `+`/`-` zoom, so keyboard reaches everything
  the mouse can. Clamp zoom to sane min/max and keep the atlas within
  reach (no panning into empty infinity).
- **Performance:** skeleton visible immediately (well under 1s); the real
  map interactive quickly after `genres.json` loads; pan and zoom stay
  smooth with all genres on a 390px viewport, with no visible jank. No
  horizontal scroll at 390px.
- **Accessibility:** the canvas carries `role="img"` and an `aria-label`
  summarizing the map (for example, the genre count and how many are
  lit). The region legend is real, accessible DOM (not canvas-only).
  Visible focus states on all controls; every control labeled.

### Designed states and copy (swept)

Use these strings verbatim (already swept for em-dashes, banned
vocabulary, and negative empty-state phrasing). If you change them,
re-sweep.

- **Loading / skeleton** (holds layout steady, dim placeholder field,
  never a white screen): `Charting the atlas of music.`
- **First-run orientation** (skippable; shown until dismissed, then never
  again via a `localStorage` flag):
  - Line 1 (what it is): `A map of every music genre. The places you explore light up.`
  - Line 2 (how to explore): `Drag to explore. Pinch to zoom.`
  - Dismiss control label: `Got it`
- **Error** (data failed to load; product voice, actionable, with a
  retry): heading `Let's try that again`, body
  `Check your connection and reload the map.`, button `Reload`
- **Controls** (aria-labels): `Zoom in`, `Zoom out`, `Reset view`
- **Legend** heading: `Regions`

The map is never truly empty in this EPIC (it always renders the full
atlas), so there is no blank empty state to design; the "nothing lit yet"
condition is the normal dark default, oriented by the first-run copy
above.

### Deploy scaffold

- **Dockerfile:** multi-stage. Stage 1 (node) installs deps and runs the
  Vite build (the committed `data/genres.json` and `demo-passport.json`
  are bundled or copied into the static output). Stage 2 (nginx:alpine)
  serves the static build. An entrypoint script generates
  `/usr/share/nginx/html/env.js` from environment
  (`SEED_DEMO`, and the optional analytics/error keys below) before nginx
  starts. The Dockerfile builds the **static app**; it does not run the
  data pipeline (the pipeline runs offline; its output is committed).
- **docker-compose.staging.yml:** builds and serves the app on a mapped
  port; sets `environment: SEED_DEMO=1` so staging shows a partly-lit
  map. A container healthcheck on the served index is fine (there is no
  backend `/healthz` in this EPIC).
- **Analytics and error tracking (env-gated, no-op without env):** if
  `SENTRY_DSN` is present, initialize the Sentry browser SDK in the
  frontend; if `UMAMI_URL` and `UMAMI_WEBSITE_ID` are present, include the
  Umami script. Both flow through `env.js` and MUST be completely inert
  when their env is absent. Keep this minimal; do not add custom event
  instrumentation in this EPIC.
- **.env.example:** placeholders only, no real secrets. At least:
  `SEED_DEMO`, `MUSICBRAINZ_CONTACT` (pipeline User-Agent contact),
  `SENTRY_DSN`, `UMAMI_URL`, `UMAMI_WEBSITE_ID`. `.env` stays untracked.

### README (for strangers)

`README.md` must let a stranger who never saw this project:
- **Understand** it in two or three plain sentences (a living map of every
  music genre; the places you explore light up; built on open MusicBrainz
  data).
- **Run** it with the exact commands, verified against the actual files:
  clone, `cp .env.example .env`, then the real
  `docker compose -f docker-compose.staging.yml up --build` command and
  the URL to open. Include how to regenerate the atlas
  (`npm run build:atlas` or the actual script name) and note it is
  incremental and resumable.
- **Contribute:** where the pipeline and web code live, and how to run the
  tests.
- No factory internals (no mention of the pipeline that built this repo,
  agents, task types, or internal service hostnames).

---

## Ordered task list (each with acceptance criteria)

### Task 1 — Scaffold and toolchain
Set up `package.json`, TypeScript, Vite web app, and the empty
`pipeline/` and `test/` trees.
- **AC:** `npm install` succeeds; `npm run build` produces a static
  bundle; `npm test` runs (even if trivially) and the test runner is
  wired.

### Task 2 — Pipeline fetch stages (resumable cache)
Implement fetch-genres, fetch-relations, fetch-cooccurrence with 1 req/s
rate limiting, a descriptive User-Agent from env, and per-genre disk
caching under `data/cache/`.
- **AC:** running the fetch stages populates `data/cache/`; re-running
  makes **zero** network calls for already-cached genres; interrupting and
  resuming continues from the last cached genre; a missing contact env
  fails loudly with a clear message rather than sending a bad User-Agent.

### Task 3 — Graph, layout, clustering, emit
Implement build-graph (cosine similarity, genre-rel boost, top-K=10
neighbors), ForceAtlas2 layout (fixed seed), Louvain clustering (fixed
seed), and emit `data/genres.json` per schema.
- **AC:** given a fixed cache, the pipeline emits a `data/genres.json`
  that (a) contains **every** genre from the genre list, (b) has valid
  `x`/`y`/`region`/`neighbors` for each, (c) every `neighbors` id
  references an existing genre, (d) is byte-identical across two runs from
  the same cache with no network calls, and (e) is under 400KB gzipped.

### Task 4 — Real data, layout proximity test, LAYOUT_NOTES
Run the pipeline against real MusicBrainz data (to completion or to a
committed resumable checkpoint with broad coverage), commit
`data/genres.json` and `data/cache/`, add the automated proximity test,
and write `LAYOUT_NOTES.md` with a screenshot.
- **AC:** `data/genres.json` is committed with real data covering the full
  genre set. The automated proximity test (Test plan T4) passes. Manual
  eyes check for jank and label legibility captured. `LAYOUT_NOTES.md`
  records, for each named check (metal subgenres cluster, jazz borders
  blues, zeuhl near prog rock), PASS/FAIL and the observed nearest genres,
  plus references a committed screenshot artifact of the labeled map.
  If a named genre is absent from MusicBrainz, the notes state the
  substitution used.

### Task 5 — Map render, pan/zoom, mobile
Canvas renderer, viewport transform, unlit dot field, labels with a zoom
threshold, drag/wheel/pinch/keyboard navigation, on-screen controls.
- **AC:** the map renders all genres dark by default; pan and zoom are
  smooth on a 390px viewport with no horizontal scroll; labels are legible
  at appropriate zoom and not a cluttered mess when zoomed out; keyboard
  arrows/`+`/`-` pan and zoom; controls are ≥44px.

### Task 6 — Lit rendering, passport read, SEED_DEMO seed
Read the passport from browser storage; render lit genres glowing in
region color; implement `demo-passport.json` and the `env.js`/`SEED_DEMO`
seeding path.
- **AC:** with a passport present, those genres glow in region color over
  the dark map; with `SEED_DEMO=1` and no existing passport, the app seeds
  from `demo-passport.json` on first load and shows roughly three glowing
  neighborhoods; with `SEED_DEMO` unset, the map starts all-dark. No
  stamp control or interaction-driven passport write exists.

### Task 7 — Designed states, accessibility, copy sweep
Skeleton, error-with-retry, first-run orientation (dismiss-once), canvas
`role="img"`/`aria-label`, accessible legend, focus states, contrast.
- **AC:** skeleton shows immediately and holds layout; a failed
  `genres.json` load shows the error state with a working Reload; the
  first-run orientation appears once and never again after dismissal;
  keyboard reaches every control with visible focus; the copy sweep over
  every user-visible string finds zero em-dashes/en-dashes, zero banned
  vocabulary, and zero negative empty-state phrasing.

### Task 8 — Deploy scaffold
Dockerfile (multi-stage, nginx, `env.js` entrypoint), 
`docker-compose.staging.yml` (serves, `SEED_DEMO=1`, healthcheck),
env-gated Sentry/Umami, `.env.example` placeholders.
- **AC:** `docker compose -f docker-compose.staging.yml up --build` serves
  the app locally; with the default `SEED_DEMO=1` the served map is
  partly lit within a minute of opening; `.env.example` contains
  placeholders only and `.env` is gitignored; the app runs with all
  analytics/error env absent (they are inert).

### Task 9 — README for strangers
Write `README.md` per the README contract above.
- **AC:** every command in the README is verified against the actual files
  (compose filename, service, port, script names) and works from a clean
  clone; no factory internals appear.

### Task 10 — Test suite and final sweep
Wire all automated tests (Test plan below) into `npm test`; run the full
copy sweep one final time.
- **AC:** `npm test` runs green; the sweep is clean.

---

## Test plan (which automated test proves each planner criterion)

Map from the planner's acceptance criteria to concrete tests.

- **T1 — Pipeline regenerates, incremental, resumable, >1h allowed.**
  Unit/integration test with a small fixture cache: (a) running emit from
  cache produces `genres.json` with no network calls (network layer
  mocked/asserted zero calls); (b) two runs from the same fixture cache
  produce byte-identical output (determinism = resumability of the compute
  half); (c) a test that seeds a partial cache (some genres missing) and
  asserts the fetch stage would fetch only the missing ones and that emit
  still produces a valid file over the present genres. Proves: *committed
  script regenerates; incremental and resumable; partial progress valid.*

- **T2 — Coverage and schema of `data/genres.json`.** A test that loads
  the **committed** `data/genres.json` and asserts: every genre from the
  committed genre-list cache appears; each has numeric `x`/`y`, an integer
  `region` in `regions`, and a `neighbors` array of ≤10 ids each
  referencing an existing genre; gzipped size < 400KB. Proves: *covers
  every genre with x/y, neighbors[], region.*

- **T3 — Map renders, pannable/zoomable, mobile, skeleton first.**
  End-to-end (Playwright or equivalent) at a 390px viewport: skeleton
  element present before data resolves; canvas present after load;
  `document.documentElement.scrollWidth <= innerWidth` (no horizontal
  scroll); simulated drag changes the viewport transform; zoom control
  changes scale. A payload-budget assertion that the map data fetched is
  within budget. Proves: *renders all genres, pannable/zoomable, smooth on
  390px, no horizontal scroll, skeleton not blank page.* (Frame-rate
  smoothness is verified by eye and recorded in `LAYOUT_NOTES.md`.)

- **T4 — Layout eyes test, made repeatable.** An automated proximity test
  over the committed `data/genres.json`, using **nearest-neighbor
  membership** (robust, not brittle absolute distances): a set of metal
  subgenres are mutually within each other's k-nearest (k≈30) and closer
  on average than random pairs; `blues` is within `jazz`'s k-nearest;
  `zeuhl` is within `progressive rock`'s k-nearest. Genres absent from the
  data are skipped and the skip is logged. Plus the manual record in
  `LAYOUT_NOTES.md` with a screenshot artifact. Proves: *layout passes the
  eyes test against named ground truth; LAYOUT_NOTES.md + screenshot.*

- **T5 — Unlit default, lit rendering, states, copy.** Unit test: given an
  empty passport the renderer marks zero genres lit; given a passport the
  renderer marks exactly those genres lit with their region color. E2E:
  first-run orientation shows once then not after dismissal (localStorage
  flag); forcing a failed data fetch shows the error state with a working
  Reload. A copy-lint test that greps every user-visible string for
  em-dashes/en-dashes, the banned vocabulary list, and negative
  empty-state phrasing and asserts zero hits. Proves: *unlit by default;
  labels legible; loading and error states designed in product voice.*

- **T6 — SEED_DEMO and staging scaffold.** Unit/E2E: with
  `window.__ENV__.SEED_DEMO="1"` and no stored passport, the app seeds
  from `demo-passport.json` and lights the mapped genres; with it unset,
  nothing is lit. A test/assertion that `demo-passport.json` names resolve
  to real genres in `genres.json` (so the demo is never empty). A check
  that `.env.example` contains no real secret values. The compose bring-up
  is verified manually and captured (the README command runs). Proves:
  *Dockerfile builds static app; compose serves it; SEED_DEMO seeds a demo
  passport for a partly-lit map within a minute; .env.example placeholders
  only.*

- **T7 — README correctness.** A check (script or documented manual
  verification in the run) that the compose filename, service name, port,
  and npm script names referenced in `README.md` match the actual files.
  Proves: *README lets a stranger clone, configure, run with the exact
  commands, verified against the actual files.*

---

## Assumptions and decisions (stated for the reviewer)

- The planner's scope block was present and authoritative; this spec
  expands it directly and does not re-derive scope from the title.
- **Co-occurrence is the primary similarity signal; genre-genre
  relationships are a boost where MusicBrainz exposes them.** This hedges
  the uncertainty about whether the WS/2 genre entity returns genre-rels,
  without blocking. If it does, those edges strengthen the layout; if it
  does not, co-occurrence alone still produces the atlas.
- **The API, not the dumps.** Chosen for buildability and to satisfy
  resumability with simple disk caching. Downloading multi-GB dumps is out
  of scope and unnecessary.
- **Canvas 2D over WebGL** for ~2,200 nodes, to keep first render and the
  build simple; WebGL is permitted if the implementer prefers.
- **Lit rendering with a seeded passport is in scope; the stamp
  interaction is not** (see boundary clarifications). This is how the
  differentiator is demonstrated on staging without building EPIC 2.
- **First-run orientation, not the EPIC 5 walkthrough** (see boundary
  clarifications), because stamping does not exist in this EPIC.
