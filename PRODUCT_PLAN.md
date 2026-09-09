# PRODUCT PLAN — A world map of music that remembers where you've been

## Core value (one sentence)

A living, explorable map of every music genre that fills in with color
where **you** have traveled and dares you across your own border each
day, keeping a passport of everywhere you've been.

## North star

The excellent v3 opens and your years of exploration are already there:
lit territory glowing out of a mostly dark world, every stamp pinned to
the track and the day that earned it, and enough darkness left to still
pull you somewhere new tonight. It makes you feel your own taste as a
*place* with borders and frontiers, and it makes the world past those
borders feel reachable one preview at a time. You leave every visit
having heard something you would never have found on your own, and the
map keeps it for you forever. The measure is simple: months in, a user
can look at their map and see a story of who they became as a listener.

## Quality differentiator (the one dimension we must clearly win)

**Delight through tactility.** The map is instant and alive: touch
anywhere and it plays, your own territory glows out of the dark, and the
frontier visibly moves when you cross it. Every incumbent is either
frozen, silent, stateless, or a list. We beat all of them on the felt
experience of a map you can hear and a world you are visibly filling in.
Speed and polish serve this; they are not the differentiator themselves.
We commit to this one dimension and let the rest be merely excellent.

## Signature moment

The zoom-out. Three glowing neighborhoods in a world of roughly 2,200
genres, and everything else dark. The map knew where you'd been, and
showed you how small it was. This must work from the first three stamps
and must be reachable in the first minute.

---

## Users and MVP user stories

The user: a listener bored of their own taste, the kind who loved Every
Noise at Once and wants a way *out* of their recommendation bubble.

- As a new visitor, I open the map and immediately understand it is a map
  of all music where I light up what I've heard.
- As a new visitor, I stamp a genre I love and watch my first corner turn
  to color, so the map starts to feel like mine.
- As a listener, I touch any genre and hear a 30-second sample instantly,
  so exploring is playful, not a reading exercise.
- As a returning user, I zoom out and see my lit territory against the
  dark, so I feel how much world is still unexplored.
- As a returning user, I take today's dare into one unexplored neighbor,
  hear it, and stamp it, so my frontier moves a little every day.
- As a ListenBrainz user, I paste my public username and watch stamps
  appear on their own, so my map lights up in seconds.
- As any user, I export my passport and make a shareable poster of my lit
  map, so the record is mine to keep and to show.

## Honesty commitment (binding framing)

The passport is an **exploration record**, not a listening history. For
everyone without ListenBrainz, stamps record what they explored inside
the site. A travel passport records trips taken, not a life lived. No
copy may promise "your listening life, visualized" or imply we observe
real streaming. This framing is a requirement, not a preference.

## Data model sketch

**Precomputed static data (committed build artifacts, no runtime job):**
- `Genre`: `id` (MusicBrainz genre), `name`, `x`, `y` (2-D layout
  coordinates), `region` (cluster id, drives color), `neighbors[]`
  (adjacency), `coverage` (has exemplar / sparse).
- `Exemplar` (per genre where available): `trackTitle`, `artist`,
  `previewUrl` (cached iTunes 30-sec clip), `artworkUrl`.

**Client state (browser storage only, never sent to a server):**
- `Passport`: `stamps[]` = `{ genreId, firstListenDate, trackTitle,
  artist, note?, rating? }`, plus `streak`, `frontierHistory[]`,
  `settings`.
- `Dare` (derived, not stored): today's dare = the nearest unstamped
  genre adjacent to the lit set, seeded by calendar date so it is stable
  for the day.

## Screen / endpoint inventory

**Screens (single-page app):**
- **Map** (home): the atlas, dark by default, pan and zoom, tap a genre
  to hear and stamp, today's dare surfaced here. One primary action.
- **Passport**: your stamps as a dated list, count lit of total, streak,
  export / import, make a poster.
- **Settings panel**: paste a ListenBrainz username, data controls.
- **Poster**: generated shareable image of the lit map (modal).

**Endpoints (thin backend, only what the client cannot safely do alone):**
- Static serving of the app and the precomputed data files.
- `GET /api/listenbrainz/:username`: server-side proxy of the public
  genre-activity stats. Validates the username, rate-limits, caches,
  never logs the name. Returns matched genre stamps.
- `GET /healthz`: health check.

There is no auth surface because there are no accounts. The only external
route is the ListenBrainz proxy; it is public and must validate input and
rate-limit. The passport lives entirely in the browser.

## Architecture notes (guidance, not mandates)

- Static SPA plus a thin backend for the single proxy route. Render the
  ~2,200-node map on canvas or WebGL so pan and zoom stay smooth on
  mobile. Passport in IndexedDB or localStorage.
- The map layout and the exemplar previews are computed **offline at
  build time** from open data (MusicBrainz dumps + iTunes Search API) and
  **committed as data files**. The running app performs no heavy ingest
  and near-zero third-party calls.
- The pipelines are **incremental and resumable**: partial progress is
  valid, committed state, because a full run exceeds a single build unit.
  The map ships showing its coverage honestly rather than faking density.
- No runtime LLM. The loop is fully mechanical. Any genre blurbs, if ever
  added, are pre-generated at build time. `llm_request` stays empty.

---

## EPIC list (build order)

### EPIC 1 — The genre atlas, and the staging scaffold

**Scope.** Build the offline, incremental, resumable pipeline that
ingests MusicBrainz genres, genre-genre relationships, and artist tag
co-occurrence, and emits a committed `data/genres.json`: every genre with
2-D coordinates, an adjacency list, and a region cluster. Render it as a
pannable, zoomable, labeled map, dark by default. Stand up the staging
deploy scaffold. This EPIC exists to prove the single biggest bet, the
layout, with eyes, before anything else is funded.

**Acceptance criteria.**
- A committed script regenerates `data/genres.json` from open MusicBrainz
  sources; it is incremental and resumable (partial progress is valid,
  committed state) and does not require one run to finish under an hour.
- `data/genres.json` covers every MusicBrainz genre with `x`/`y`
  coordinates, a `neighbors[]` adjacency list, and a `region` id.
- The map renders all genres, pannable and zoomable, smooth on a 390px
  viewport with no horizontal scroll; first meaningful render within ~1s,
  with a skeleton (never a blank page) while data loads.
- The layout passes an eyes test against named ground truth: metal
  subgenres cluster together, jazz borders blues, zeuhl sits near prog
  rock. `LAYOUT_NOTES.md` records the check with a screenshot artifact.
- Genres are unlit by default; labels legible at appropriate zoom;
  loading and error states designed, in product voice.
- `Dockerfile` builds the static app; `docker-compose.staging.yml` serves
  it; `SEED_DEMO=1` seeds a demo passport so staging shows a partly-lit
  map within a minute. `.env.example` holds placeholders only.
- `README.md` lets a stranger clone, configure, and run it with the exact
  compose commands, verified against the actual files.

**Non-goals.** No stamping, no previews, no dare, no accounts.

### EPIC 2 — Hear it, stamp it (the passport)

**Scope.** Extend the pipeline to resolve and cache one iTunes exemplar
preview per genre. Make genre nodes interactive: touch to hear a 30-second
preview instantly, tap to stamp. Lit genres render in color over the dark
map. Persist the passport in browser storage. Add the passport view and
one-click JSON export / import.

**Acceptance criteria.**
- The pipeline resolves and commits `data/exemplars.json` (one preview per
  genre where one exists), incremental and resumable, honoring the polite
  iTunes rate (~20 req/min); partial coverage is valid and flagged.
- Touching a genre starts audio within 100ms as perceived (preloaded
  cached URL); a genre with no preview shows an honest resting state, not
  a broken player.
- Tapping stamp lights the genre in color immediately (optimistic) and
  persists across reload via browser storage.
- The passport view lists stamps with first-listen date and the track
  that earned each, and shows "N of ~2,200 lit"; the zoom-out shows lit
  territory over dark and works from the first three stamps.
- One click exports the passport as JSON; import restores it. Passport
  data never leaves the browser except the file the user downloads.
- The empty passport state uses positive, directive copy and points at the
  first action. Mobile-first, accessible, copy sweep clean.

**Non-goals.** No daily dare, no ListenBrainz auto-fill, no accounts.

### EPIC 3 — The daily dare

**Scope.** Each day surface exactly one unstamped genre adjacent to the
user's lit territory, with its preview ready. Listen, stamp, watch the
frontier move. It works from an empty passport by letting the user pick a
starting genre. The pick is deterministic per calendar day.

**Acceptance criteria.**
- With a non-empty passport, today's dare is a genre adjacent in the graph
  to at least one lit genre and not yet stamped; it is stable for the whole
  calendar day (seeded by date) and changes the next day.
- With an empty passport, the app invites the user to pick a starting
  genre and seeds the dare from it. The dare prefers a neighbor with a
  playable preview and never dead-ends when a playable neighbor exists.
- The dare card plays the preview instantly, one tap stamps it, and the
  lit frontier visibly advances after stamping.
- Streak and frontier history persist in the passport and survive reload.
- Designed states, mobile-first, accessible, copy sweep clean.

**Non-goals.** No email or push notifications, no ListenBrainz, no
scheduling beyond the deterministic daily pick.

### EPIC 4 — Auto-fill from ListenBrainz, and the shareable poster

**Scope.** Paste a public ListenBrainz username; a thin, rate-limited,
input-validated backend proxy fetches the public genre-activity stats and
the matching genres get stamped automatically, lighting the map in
seconds. Add the shareable poster: a one-page image of the lit map to
download and share. This is the fastest path to the signature moment and
the durable, shareable artifact.

**Acceptance criteria.**
- `GET /api/listenbrainz/:username` validates the username, rate-limits,
  caches responses, and never logs the name; it returns matched genre
  stamps. Errors return product-voice messages, never stack traces.
- Pasting a valid public username lights the map with auto-generated
  stamps within a few seconds; an unknown or empty name shows a positive,
  actionable message and offers manual stamping instead.
- "Make a poster" renders a shareable PNG of the lit map that the user can
  download. It is generated client-side. No account, no upload.
- All framing stays exploration-record, never "your listening history."
  Copy sweep clean.

**Non-goals.** No Spotify OAuth or connect (unbuildable, must never
appear). No Spotify data-export import in V1 (record as a follow-up). No
server-side storage of any imported data. No account creation.

### EPIC 5 — First-run guided walkthrough

**Scope.** A skippable guided path that walks a brand-new user through
lighting their first corner, anchored to the real controls. It appears
only until the user's first success and never again.

**Acceptance criteria.**
- On first visit a guided path of 2 to 4 steps points at real controls,
  one short imperative sentence each, skippable at any step.
- The path walks the actual core action once (stamp a genre, hear it, see
  it light, take the dare) using the real controls, not a modal essay.
- After first success it never shows again; a returning user with an
  existing passport never sees it.
- On staging, a new visitor reaches the signature moment within a minute
  without hand-crafted input (honoring `SEED_DEMO`).
- Mobile-first, keyboard reachable with visible focus, copy sweep clean.

**Non-goals.** No multi-page tutorial, no video, no persistent help
overlay after first success.

### EPIC 6 — Polish pass (final)

**Scope.** A UX, performance, and quality pass over the whole delivered
product against the QUALITY BAR and the quality differentiator. No new
features. Tighten what exists so the map feels instant, tactile, and
alive.

**Acceptance criteria.**
- Hot paths meet the speed budget: first meaningful render under 1s,
  interaction feedback under 100ms, map pan and zoom stay smooth at full
  genre count on a 390px viewport.
- Every screen's empty, loading, and error states are designed and in the
  product's voice. A full copy sweep across every user-visible string
  finds zero em-dashes or en-dashes, zero banned marketing vocabulary, and
  zero negative empty-state phrasing.
- Accessibility: sufficient contrast, visible focus, labeled inputs,
  semantic structure, keyboard reaches everything, audited on the map,
  passport, dare, and settings.
- Mobile: no horizontal scroll at 390px, touch targets around 44px, audio
  plays on tap on mobile browsers.
- Security hygiene: the proxy route validates input and rate-limits; no
  secrets in tracked files; no PII in logs; no stack traces in any user
  surface.
- The README is verified against the actual compose files end to end.
- The signature moment is reachable within the first minute for a brand
  new user, verified on staging.

**Non-goals.** No new features of any kind; refinement only.

---

## Non-goals / Out of scope (the fence)

- **No Spotify OAuth / "connect your library."** Unbuildable for a new app
  and dishonest about what we can observe. It must never appear anywhere.
- **No user accounts, logins, or server-side profiles.** The passport is
  local and portable by design.
- **No social graph, friends, group racing, or leaderboards.** A variant
  direction, not V1.
- **No runtime LLM features** (AI genre guides, chat). Any blurbs are
  pre-generated at build time; `llm_request` stays empty.
- **No editing the taxonomy in-app, no user-submitted genres.**
- **No full track playback or streaming integration.** 30-second previews
  only.
- **No email or push notifications** for the daily dare in V1.
- **No native mobile app.** Responsive web only.
- **No classroom / educator shared-map features.**
- **No moderation, comments, or ratings shared between users.**

## Risks carried from validation (watch these)

1. **Layout quality is the whole bet.** Gated at EPIC 1 with an eyes test.
   If adjacency feels arbitrary after honest iteration, the product should
   be killed, not shipped as a checklist wearing a map costume.
2. **Framing must stay exploration-record**, never real listening history.
3. **Build pipelines exceed one run.** They must be incremental,
   resumable, and committed as they go; derived data is a committed
   artifact, not a runtime job.
4. **Long-tail coverage is uneven.** Ship honest coverage indicators, not
   faked density, especially where the dare sends people.
