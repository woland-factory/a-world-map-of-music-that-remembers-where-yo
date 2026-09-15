# EPIC SPEC: Auto-fill from ListenBrainz, and the shareable poster

Expand of the planner's EPIC 4 scope. Two deliverables:

1. A thin, rate-limited, input-validated backend proxy,
   `GET /api/listenbrainz/:username`, that fetches a user's public
   ListenBrainz genre-activity stats and returns the genres that match the
   atlas. The client turns those into ordinary passport stamps, lighting
   the map in seconds.
2. "Make a poster": a client-side PNG of the lit map, previewed in a modal
   and downloadable. No account, no upload, no server involvement.

This is the first EPIC that adds a runtime backend. Everything else in the
product stays static and browser-local.

## Quality differentiator (restated, binding)

Delight through tactility: an instant, alive map you can hear. Touch
anywhere and it plays, your own territory glows out of the dark, and the
frontier visibly moves when you cross it.

What it demands of THIS EPIC: the fill must feel like the map catching
fire, not like a form submission. The button gives feedback within 100ms,
the stamps land in one batch (one repaint, one storage write), and on
success the view frames the zoom-out so the newly lit territory is the
first thing the user sees. The poster is the same glow, made portable:
lit dots glowing out of the dark at print size, generated in under a
second, with zero network traffic.

## Scope

In scope:

- New `server/` directory: a zero-dependency Node service (ESM
  JavaScript, Node 22 built-in `fetch` and `http`) exposing
  `GET /api/listenbrainz/:username` and `GET /healthz`.
- Infra wiring: an `api` build target in the Dockerfile, an `api` service
  in all three compose files, an nginx `location /api/` proxy block, and a
  vite dev-server proxy for `/api`.
- Passport sheet additions: a "Fill from ListenBrainz" section (input +
  button + status line) and a "Make a poster" action.
- Poster module: pure layout/draw code plus a modal with preview and
  Download PNG.
- Batch stamp application in `web/src/state/passport.ts` (one storage
  write for N stamps).
- Copy, tests (unit, integration, e2e with mocked `/api`), README update,
  copy-lint additions.

Out of scope (binding non-goals, from the planner):

- No Spotify OAuth or connect. The word Spotify must not appear in the UI.
- No Spotify data-export import in V1. It stays a recorded follow-up in
  the product plan; do not build any part of it.
- No server-side storage of any imported data. The proxy's response cache
  is in-memory only, dies with the process, and never touches disk.
- No account creation, no login, no server-side profiles.
- Also out: persisting the typed username anywhere (server logs, server
  disk, client localStorage), LB OAuth/tokens (public stats only), and
  any new npm dependency for the server.

## Verified external contract (checked live, 2026-09-15)

`GET https://api.listenbrainz.org/1/stats/user/{user_name}/genre-activity`

- 200 body: `{"payload": {"genre_activity": [{"genre": "ambient",
  "hour": 0, "listen_count": 405}, ...], "range": "all_time", ...}}`.
  Genre names are lowercase MusicBrainz genre tags, the same vocabulary as
  the atlas. One row per (genre, hour of day); sum `listen_count` across
  hours per genre.
- 204: stats not yet calculated for that user (valid user, empty body).
- 404: unknown user.
- No auth required for public stats. Send a descriptive `User-Agent`
  (`world-map-of-music/1.0`). Read the shape defensively:
  `body?.payload?.genre_activity ?? []`.

## Technical design

### Architecture

The shipped container today is nginx serving static files. Add a second
container, `api`, built from the same Dockerfile via a new target. nginx
proxies `/api/` to it by service name. The api container is never
published on the host; nginx is the only path to it. No database, no
migrations: the passport schema stays at v3 and LB stamps are ordinary
stamps (date = the local day of the fill, no track fields, because the
map did not play those tracks and must not claim it did).

### New files

- `server/lb.mjs`: pure, dependency-free logic, exported for tests.
  - `validateUsername(raw)`: decode with `decodeURIComponent` (a
    `URIError` means invalid), trim, require 1..64 chars, reject any of
    control chars (U+0000..U+001F, U+007F), `/`, `\`. Returns
    `{ok: true, name}` or `{ok: false}`.
  - `matchGenres(genreActivity, atlasNameIndex)`: aggregate
    `listen_count` per lowercased `genre` string, join against the atlas
    by lowercased name, drop non-matches, sort by listenCount desc then
    name asc, cap at 500 entries. Returns
    `[{mbid, name, listenCount}]` using the atlas's canonical casing.
  - `TtlCache(maxEntries)`: `get(key, now)` / `set(key, value, ttlMs,
    now)`, evicts the oldest entry past `maxEntries` (500).
  - `RateLimiter(limit, windowMs)`: sliding window per key,
    `allow(key, now)`. 10 requests per minute per client IP.
- `server/app.mjs`: `createHandler({atlas, fetchImpl, now, log,
  reportError})` returning a `(req, res)` function. All time and I/O are
  injected so tests never touch the network or the clock.
- `server/index.mjs`: bootstrap. Reads `data/genres.json` (path from
  `ATLAS_PATH`, default `data/genres.json`), builds the name index,
  starts `http.createServer` on `PORT` (default 8081), host `0.0.0.0`.
- `web/src/state/listenbrainz.ts`: DOM-free client flow,
  `fillFromListenBrainz(name, deps)` with injected fetch and passport
  ops. Returns `{ok, added, message}`.
- `web/src/poster/poster.ts`: pure poster layout and drawing.
- `web/src/ui/posterModal.ts`: the poster modal (preview, download,
  focus management).
- `test/server.test.ts`, `test/listenbrainz.test.ts`,
  `test/poster.test.ts`, `e2e/listenbrainz.spec.ts`, `e2e/poster.spec.ts`.

### Modified files

- `web/index.html`: LB section and poster button inside the passport
  sheet, poster modal markup.
- `web/src/ui/passportView.ts`: wire the LB form and poster button via
  injected deps (`onFill`, `onPoster`).
- `web/src/state/passport.ts`: add `addStamps(mbids: string[]): number`
  (batch; resolves via the existing mbid map, skips already-stamped,
  appends all, one `writePassport`, returns the number added).
- `web/src/main.ts`: construct the deps, refresh renderer/dare/aria after
  a fill, call `renderer.fit()` on a successful fill, Escape-key ordering
  (poster modal first, then passport sheet, then now-playing, then dare).
- `web/src/style.css`: styles for the new controls and modal (existing
  tokens and patterns; 44px targets; visible focus).
- `vite.config.ts`: `server.proxy` for `/api` to
  `process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8081"`.
- `nginx.conf`, `Dockerfile`, `docker-compose.yml`,
  `docker-compose.staging.yml`, `docker-compose.dev.yml`: wiring below.
- `test/copy-lint.test.ts`: add every new dynamic string.
- `README.md`: the proxy route, the privacy stance, the two-service run,
  `server/` in the contribute map.

### API contract

`GET /api/listenbrainz/:username`

Success (200), `Content-Type: application/json; charset=utf-8`:

```json
{ "stamps": [ { "mbid": "…", "name": "jazz", "listenCount": 412 } ],
  "pending": false }
```

- Upstream 204 maps to 200 with `{"stamps": [], "pending": true}`.
- A valid user whose stats match nothing returns
  `{"stamps": [], "pending": false}`.
- `stamps` is capped at 500, sorted by `listenCount` desc.

Errors are always JSON of the shape `{"error": "<one product-voice
sentence or two>"}`, never a stack trace, never HTML from the app itself:

| Case | Status | `error` body |
| --- | --- | --- |
| Invalid username (fails validation) | 400 | That name has a character ListenBrainz skips. Check it, or tap any genre to stamp it yourself. |
| Upstream 404 (unknown user) | 404 | ListenBrainz can't find that name. Check the spelling, or tap any genre to stamp it yourself. |
| Local rate limit exceeded | 429 (+ `Retry-After: 60`) | Lots of lookups right now. Wait a minute and try again. |
| Upstream 429/5xx, network error, or 8s timeout | 502 | ListenBrainz didn't answer. Try again in a moment. |
| Unexpected server exception | 500 | The lookup broke on our side. Try again in a moment. |
| Unknown `/api/...` path | 404 | Check the address and try again. |

`GET /healthz` returns 200 `{"ok": true}` (compose healthcheck; not
proxied by nginx).

All responses carry `X-Content-Type-Options: nosniff` and
`Cache-Control: no-store` (the server-side cache is the proxy's own; the
browser must not add a second, unbounded one).

### Server behavior (the security and privacy criteria live here)

- Routing: the handler receives the original URI including the `/api`
  prefix (nginx forwards it unchanged). Route on
  `/api/listenbrainz/<segment>` exactly; anything else under `/api` is
  the JSON 404.
- Rate limit: keyed by client IP, taken from the `X-Real-IP` header when
  present (nginx sets it; the api port is never published so the header
  is trustworthy), else the socket address. 10/min sliding window. The
  429 must fire before any upstream call.
- Cache: in-memory `TtlCache`, key = lowercased trimmed username.
  TTLs: success 6h, upstream-404 5min, pending-204 10min. Max 500
  entries. A cache hit performs no upstream call. Nothing is ever
  written to disk.
- Upstream call: `https://api.listenbrainz.org/1/stats/user/` +
  `encodeURIComponent(name)` + `/genre-activity`, with
  `AbortSignal.timeout(8000)` and the `User-Agent` above. Deduplicate
  concurrent in-flight requests for the same name (one upstream call,
  N waiters).
- Privacy, non-negotiable: the username appears in no log line, no error
  report, and no persistent store, on any code path. The only log format
  is `lb <status> <ms>ms cache=<hit|miss|skip>` plus a fixed-string
  startup line. `console.log(req.url)` or logging the error of a failed
  upstream call verbatim (it can contain the URL) are defects; scrub by
  never interpolating the URL or name into anything logged.
- Error tracking: `reportError(dsn, err)` in `server/lb.mjs`. When
  `SENTRY_DSN` is set, POST a minimal Sentry store payload (hand-rolled,
  no SDK: parse the DSN, POST
  `{scheme}://{host}/api/{projectId}/store/` with the `X-Sentry-Auth`
  key header, body `{message: err.name + ": " + err.message}` after
  replacing any occurrence of the current username with `[name]`).
  Fire-and-forget, wrapped in catch, called only for unexpected
  exceptions (the 500 path). When the env is absent it is a no-op.

### Client fill flow

Passport sheet gains a section under the stamp list, above the existing
actions row:

```html
<section class="ps-fill" aria-labelledby="lb-heading">
  <h3 id="lb-heading">Fill from ListenBrainz</h3>
  <p class="ps-hint">Stamps the genres your public stats show. Looked up once, never stored.</p>
  <form id="lb-form">
    <label for="lb-name">ListenBrainz name</label>
    <input id="lb-name" type="text" autocomplete="off" spellcheck="false" maxlength="64" placeholder="e.g. rob" />
    <button id="lb-fill" class="primary" type="submit">Light my map</button>
  </form>
  <p id="lb-status" class="ps-msg" role="status" aria-live="polite" hidden></p>
</section>
```

Flow in `fillFromListenBrainz(name, deps)`:

1. Trim. Empty: return the local message "Type a ListenBrainz name
   first, or tap any genre to stamp it yourself." without any fetch.
2. Show busy state within 100ms: disable the button, set `#lb-status`
   to "Looking up your genres."
3. `fetch("/api/listenbrainz/" + encodeURIComponent(name))`. Any network
   failure or non-JSON body (nginx 502 while the api restarts, for
   example) maps to "ListenBrainz didn't answer. Try again in a moment."
4. Error JSON: show `body.error` verbatim in `#lb-status`.
5. 200 with `pending: true`: "ListenBrainz is still adding up your
   stats. Try again later, or tap any genre to stamp it yourself."
6. 200 with stamps but zero matches after `addStamps` because all were
   already lit: "Your map already shows those genres."
7. 200 with an empty `stamps` array: "Your stats use tags this map
   skips. Tap any genre to stamp it yourself."
8. 200 with `added > 0`: apply via `addStamps(mbids)` (ONE storage
   write, then one `applyPassportChange`-style refresh in main.ts:
   renderer lit set, aria-label, passport view, `ensureDare`). Then
   `renderer.fit()` so the zoom-out frames the newly lit territory, and
   show "Lit 24 new genres from your travels." (singular: "Lit 1 new
   genre from your travels.").

Rules:

- The username is never persisted client-side (no localStorage, no URL
  param). The input keeps its in-session value only.
- Auto-filled stamps never call `completeDare` and never bump the
  streak. If the fill happens to stamp today's dare genre, the existing
  `ensureDare` logic marks the dare done without a streak bump. The
  streak stays a record of dares actually taken.
- Framing: all copy in this feature says stamps, stats, travels, and
  explored. The strings "listening history" and "your history" must not
  appear anywhere in the UI.

### Poster

Trigger: a "Make a poster" button in the passport sheet's actions row.
Modal markup (sibling of the passport sheet, above it in z-order):

```html
<div id="poster" class="poster-modal" role="dialog" aria-modal="true" aria-labelledby="poster-heading" hidden>
  <div class="poster-inner">
    <header>
      <h2 id="poster-heading">Your poster</h2>
      <button id="poster-close" class="sheet-close" type="button" aria-label="Close">&times;</button>
    </header>
    <p id="poster-wait" role="status">Printing your map.</p>
    <img id="poster-img" alt="Poster of your lit map" hidden />
    <div class="poster-actions">
      <button id="poster-download" class="primary" type="button" hidden>Download PNG</button>
    </div>
  </div>
</div>
```

`web/src/poster/poster.ts`:

- Constants: width 1080, height 1350 (4:5 portrait), background
  `BACKGROUND` from `web/src/map/colors.ts`.
- `fitTransform(bounds, rect)`: pure. Fits the atlas bounds into a
  target rect preserving aspect, centered. Handles degenerate bounds
  (width or height 0) without dividing by zero. Returns
  `{scale, dx, dy}`.
- `posterCountLine(lit, total)`: pure. `"412 of 2,197 genres lit"`,
  numbers via `toLocaleString("en-US")`.
- `posterDateLine(date)`: pure. `"September 15, 2026"` via
  `toLocaleDateString("en-US", {year: "numeric", month: "long",
  day: "numeric"})`.
- `drawPoster(canvas, atlas, lit, opts: {dateLabel, host})`: sets the
  canvas to 1080x1350, fills the background, fits the map into the rect
  x 60..1020, y 170..1120 using `fitTransform`. Draws unlit dots first
  (radius 2, `UNLIT_COLOR`), then lit dots (radius 5, `regionColor`,
  `shadowBlur` 14 in the dot's own color), mirroring the live
  renderer's draw order so glow reads over the dark field. Text, all
  `system-ui` so nothing loads over the network: title "A world map of
  music" (600 34px, centered, y 96, `rgba(233,238,246,0.92)`), the
  count line (600 44px, centered, y 1210), and one footer line (400
  24px, centered, y 1268, `rgba(148,163,184,0.9)`) with the date label
  and, when non-empty, the host separated by a middot, for example
  "September 15, 2026 · music.example.org".
- `makePosterBlob(atlas, lit, opts)`: draws on a fresh offscreen canvas
  and resolves `canvas.toBlob` as a PNG `Blob`. Rejects only if the
  browser returns null.

`web/src/ui/posterModal.ts` behavior:

- Open: show the modal immediately with the "Printing your map." status
  (feedback within 100ms), move focus to Close, then on the next frame
  generate the blob, set `#poster-img.src` to an object URL, reveal the
  image and Download, hide the status.
- Download: an anchor click with `download="music-map-poster.png"` on
  the same object URL.
- Close (button or Escape): hide, revoke the object URL, restore focus
  to the element that opened it. Escape closes the poster before the
  passport sheet (ordering in main.ts's keydown handler).
- The host passed in is `window.location.host`; pass an empty string
  when it starts with `localhost` or `127.0.0.1` so local posters skip
  the footer host.
- No fetches of any kind on this path. The canvas draws no external
  images (no artwork), so `toBlob` can never hit a tainted-canvas error.

### Infra wiring

Dockerfile: add a target before the nginx stage.

```dockerfile
FROM node:22-alpine AS api
WORKDIR /app
ENV NODE_ENV=production PORT=8081
COPY server/ server/
COPY data/genres.json data/genres.json
USER node
EXPOSE 8081
CMD ["node", "server/index.mjs"]
```

nginx.conf: add above the `location /` block.

```nginx
location /api/ {
  resolver 127.0.0.11 valid=30s ipv6=off;
  set $api_upstream api;
  proxy_pass http://$api_upstream:8081;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_read_timeout 15s;
}
```

(The variable form makes nginx resolve at request time, so the web
container starts and serves the map even if the api container is down;
the client copy covers the resulting 502.)

Compose:

- `docker-compose.yml`: add service `api` (build target `api`, no host
  port, `SENTRY_DSN` passed through, `mem_limit: 128m`,
  `restart: unless-stopped`, healthcheck
  `wget -qO- http://127.0.0.1:8081/healthz`). `web` gets
  `depends_on: [api]`.
- `docker-compose.staging.yml`: same `api` service with
  `container_name: a-world-map-of-music-that-remembers-where-yo-staging-api`,
  on the default network only (NOT the external staging network; nginx
  fronts it), `oom_score_adj: 800`. `web` gets `depends_on: [api]`.
- `docker-compose.dev.yml`: add `api` service (image `node:22-alpine`,
  same volume mounts, `command: node server/index.mjs`, no host port)
  and set `API_PROXY_TARGET: http://api:8081` in the `web` service env
  so the vite proxy reaches it.

`.env.example` needs no new keys (PORT and ATLAS_PATH have safe
defaults; there are no new secrets).

### Copy inventory (final strings, sweep-clean; ship these verbatim)

Already listed in the API table and flows above, plus:

- Section heading: "Fill from ListenBrainz"
- Hint: "Stamps the genres your public stats show. Looked up once, never stored."
- Input label: "ListenBrainz name"; placeholder: "e.g. rob"
- Button: "Light my map"
- Busy: "Looking up your genres."
- Poster button: "Make a poster"; modal heading "Your poster"; status
  "Printing your map."; action "Download PNG"; image alt "Poster of
  your lit map".

Every one of these, and every string in the API error table, goes into
the dynamic-strings list in `test/copy-lint.test.ts`.

## Ordered task list

### T1: The proxy service

Build `server/lb.mjs`, `server/app.mjs`, `server/index.mjs` exactly per
the design, plus `test/server.test.ts`.

Acceptance criteria:

- `node server/index.mjs` starts with only the repo checked out (no
  `npm install` needed by the server itself) and serves `/healthz`.
- `validateUsername` accepts "rob" and names with inner spaces, rejects
  empty, whitespace-only, longer than 64, slashes, backslashes, control
  characters, and malformed percent-encoding.
- `matchGenres` sums hourly rows per genre, matches case-insensitively
  against the atlas name index, drops unmatched tags, sorts by count
  desc, caps at 500.
- Handler (integration-tested through a real `http` server on port 0
  with an injected fake `fetchImpl`): 200/204/404/timeout/network-error
  upstream cases and the local 400/429 cases all return exactly the
  statuses and JSON bodies in the API table. The 400 and 429 paths make
  zero upstream calls. A second request for the same name is served
  from cache with `fetchImpl` called once. The injected `log` capture,
  concatenated across every test case, never contains the username.
- No new entries in `package.json` `dependencies`.

### T2: Ship it behind nginx

Dockerfile target, nginx block, three compose files, vite dev proxy,
README, `.env.example` untouched.

Acceptance criteria:

- `docker compose up --build` brings up `web` and `api`, both healthy.
- `curl http://127.0.0.1:8080/api/listenbrainz/a%2Fb` returns the 400
  product-voice JSON through nginx (deterministic, no upstream call, so
  it verifies the full proxy chain offline).
- `curl http://127.0.0.1:8080/` still serves the app; static behavior,
  caching headers, and the staging file's network layout are unchanged
  except for the additions above.
- The api container publishes no host port in any compose file and does
  not join the external staging network.
- README explains the one runtime route in a sentence, states the
  privacy stance (looked up once, never logged, never stored), and the
  Run/Contribute sections match the actual files.

### T3: Fill from ListenBrainz in the passport sheet

`web/src/state/listenbrainz.ts`, `addStamps` in passport.ts, markup in
index.html, wiring in passportView.ts and main.ts, styles,
`test/listenbrainz.test.ts`, `e2e/listenbrainz.spec.ts` (all `/api`
routes mocked with `page.route`; the e2e web server is static).

Acceptance criteria:

- `addStamps` applies N stamps with exactly one localStorage write,
  skips already-stamped and unknown mbids, and returns the added count.
- Submitting a mocked valid name lights the map: lit count in the
  canvas aria-label and the passport count line both rise by the number
  of new stamps, the stamps persist across reload, the view returns to
  fit, and the success message shows the count.
- The busy status appears while a delayed mocked response is in flight
  (feedback within 100ms of the click).
- Empty and whitespace names show the local message and trigger no
  `/api` request; mocked 404 and 502 show their exact product-voice
  strings and change nothing.
- Auto-filled stamps carry today's date and no track fields, and the
  streak count is unchanged after a fill that includes the dare genre.
- The username is absent from localStorage after a successful fill and
  a reload.
- New controls are keyboard reachable, labeled, at least 44px tall, and
  work at a 390px viewport with no horizontal scroll.

### T4: The poster

`web/src/poster/poster.ts`, `web/src/ui/posterModal.ts`, markup,
wiring, styles, `test/poster.test.ts`, `e2e/poster.spec.ts`.

Acceptance criteria:

- `fitTransform` centers and preserves aspect for wide, tall, and
  degenerate bounds; `posterCountLine(412, 2197)` is exactly
  "412 of 2,197 genres lit".
- On a seeded map, "Make a poster" opens the modal within 100ms, shows
  the preview image (naturalWidth 1080, naturalHeight 1350), and the
  Download button saves `music-map-poster.png` whose file size is over
  20 kB.
- Zero non-origin requests occur between opening the modal and the
  completed download (asserted with a request listener in the e2e).
- Escape closes the modal before the passport sheet, focus returns to
  the opener, and the object URL is revoked on close.
- Works at a 390px viewport: modal fits, no horizontal scroll, buttons
  at least 44px.

### T5: Copy sweep and final gates

Acceptance criteria:

- Every new user-visible string (index.html additions plus the dynamic
  strings from server errors, fill messages, and poster) is appended to
  `test/copy-lint.test.ts` and the sweep passes: no em or en dashes, no
  banned vocabulary, no negative empty-state phrasing.
- The strings "listening history", "Spotify", and "OAuth" appear in no
  user-visible string (grep across `web/` and `server/`).
- `npm test`, `npm run typecheck`, and `./scripts/e2e.sh` all pass.

## Test plan (planner criterion to proof)

| Planner criterion | Proof |
| --- | --- |
| Proxy validates, rate-limits, caches, never logs the name, product-voice errors | `test/server.test.ts`: validation matrix; 429 after 10 requests in a window with no upstream call; single-fetch cache assertion; log-capture-never-contains-name assertion across all cases; exact error-body assertions for 400/404/429/502/500. T2 curl check proves the chain through nginx. |
| Valid name lights the map in seconds; unknown or empty name shows a positive, actionable message and offers manual stamping | `e2e/listenbrainz.spec.ts` (mocked routes): success path asserts lit count, persistence, fit, message; 404/empty paths assert exact strings containing the manual-stamp offer and an unchanged map. `test/listenbrainz.test.ts` covers every status-to-message mapping without a DOM. |
| Make a poster renders a downloadable client-side PNG, no account, no upload | `e2e/poster.spec.ts`: download event with the right filename and size, preview dimensions, zero non-origin requests during the flow. `test/poster.test.ts` proves the pure layout math and text. |
| Framing stays exploration-record; copy sweep clean | `test/copy-lint.test.ts` extended with every new string; T5 grep for "listening history"; stamp shape (today's date, no track fields) asserted in `test/listenbrainz.test.ts`. |

Notes for the implementer:

- The e2e suite runs against `vite preview` (static only). Every
  ListenBrainz e2e test must mock `/api/**` with `page.route`; none may
  depend on the real proxy or the network. The real proxy is proven by
  the vitest integration tests and the T2 curl check.
- The existing export/import e2e asserts zero non-origin requests; the
  mocked `/api` routes are same-origin, so nothing there changes.
- `test/scaffold.test.ts` guards `.env.example`; it needs no changes
  since no keys are added. Do not add secret-looking values anywhere.
