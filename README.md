# A world map of music

A living map of every music genre, built on open MusicBrainz data. Genres
sit near the genres they sound like, so the map reads as a landscape:
metal in one country, jazz and blues next door, electronic music across
the way. Tap a genre to hear a 30-second preview, then stamp the ones you
love. The places you explore light up, so your own corner of music grows
out of a mostly dark world.

Pan and zoom a dark, labeled map of roughly 2,200 genres. Touch anywhere
to play it, stamp a genre to keep it, and watch your passport fill in. Your
passport lives in your browser and exports to a file you own.

Each day the map dares you one step past your borders: it picks one new
genre next to your lit territory, plays its preview, and one tap stamps it
and pushes the frontier into the dark. Coming back on consecutive days
builds a streak. Your streak and every crossing are saved in the same
browser-local passport.

## How it works

- An offline pipeline reads the MusicBrainz genre list, the artists tagged
  with each genre, and any genre-to-genre relationships, then places every
  genre in 2-D by how often it shares artists with other genres. The result
  is committed as `data/genres.json`.
- A second pipeline resolves one 30-second preview per genre from the
  iTunes Search API and commits it as `data/exemplars.json`, keyed by genre
  mbid. Coverage is partial by design and reported honestly in the file.
- The web app is a static single page. It loads `data/genres.json` and
  draws it on a canvas, then loads `data/exemplars.json` in parallel for
  audio. A passport (your stamps, stored in the browser) lights those
  genres in their region color.
- The daily dare is derived at load from the same data: it reads the local
  calendar date, finds the genres adjacent to your lit ones, and picks one
  deterministically, so the dare is identical all day and changes the next.
  Nothing runs in the background and no clock beyond the local date is used.

## Run it

You need Docker.

```bash
git clone <this-repo-url>
cd a-world-map-of-music-that-remembers-where-yo
cp .env.example .env
docker compose up --build
```

Open http://127.0.0.1:8080. The demo passport is seeded by default, so you
land on a partly-lit map. Set `SEED_DEMO=0` in `.env` to start with a dark
map instead.

To develop with hot reload:

```bash
docker compose -f docker-compose.dev.yml up
```

Open http://127.0.0.1:5173.

`docker-compose.staging.yml` is the deployment file. It serves the app on
container port 80 behind a reverse proxy and does not publish a host port.

## Regenerate the atlas

The atlas is a committed build artifact, so you do not need to regenerate
it to run the app. To rebuild it from MusicBrainz:

```bash
npm install
# MusicBrainz asks for a contact in the request header.
export MUSICBRAINZ_CONTACT="you@example.com"
npm run build:atlas
```

The pipeline is polite to MusicBrainz (one request per second), so a full
run takes a while. It is incremental and resumable: progress is cached
under `data/cache/`, an interrupted run continues where it left off, and
re-running never refetches a genre that is already cached. Running only the
compute step (`npm run atlas:emit`) rebuilds `data/genres.json` from the
cache with no network calls.

## Regenerate the previews

The 30-second previews come from the iTunes Search API, which needs no key
and no account:

```bash
npm install
npm run exemplars:fetch   # resolve one preview per genre (resumable)
npm run exemplars:emit    # write data/exemplars.json from the cache
```

The fetch stage is polite to iTunes (about 20 requests per minute), so a
full pass takes a while. It is incremental and resumable: one line per
genre is cached in `data/cache/exemplars.jsonl`, an interrupted run
continues where it left off, and re-running refetches nothing already
cached. Partial coverage is expected. Many obscure genres have no preview,
and the app shows an honest resting state for those. The emit step rebuilds
`data/exemplars.json` from the cache with no network calls.

## Contribute

- `pipeline/` holds the offline build (genre fetch, graph, layout, cluster,
  emit, and the separate iTunes exemplar stages). See `pipeline/index.ts`
  for the stage orchestration.
- `web/` holds the single-page app (`web/src/map` for the canvas renderer
  and input, `web/src/audio` for playback, `web/src/ui` for the now-playing
  panel, passport view, and dare card, `web/src/state` for the passport,
  the daily dare logic, exemplars, and runtime config).
- `data/` holds the committed atlas, the exemplar previews, and the
  resumable pipeline caches.

Run the tests:

```bash
npm test          # unit and integration (Vitest)
./scripts/e2e.sh  # end-to-end in the pinned Playwright container
```

`npm test` reads the committed atlas and needs no network. The e2e script
builds the production app and drives it in a browser.

## License

MIT. See `LICENSE`.
