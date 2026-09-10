# A world map of music

A living map of every music genre, built on open MusicBrainz data. Genres
sit near the genres they sound like, so the map reads as a landscape:
metal in one country, jazz and blues next door, electronic music across
the way. The places you explore light up, so your own corner of music
grows out of a mostly dark world.

This repository is the first milestone: the genre atlas and the map that
renders it. Pan and zoom a dark, labeled map of roughly 2,200 genres, with
a seeded demo passport that shows what a lit map looks like.

## How it works

- An offline pipeline reads the MusicBrainz genre list, the artists tagged
  with each genre, and any genre-to-genre relationships, then places every
  genre in 2-D by how often it shares artists with other genres. The result
  is committed as `data/genres.json`.
- The web app is a static single page. It loads `data/genres.json` and
  draws it on a canvas. A passport (a set of genre ids in your browser)
  lights those genres in their region color.

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

## Contribute

- `pipeline/` holds the offline build (fetch, graph, layout, cluster,
  emit). See `pipeline/index.ts` for the stage orchestration.
- `web/` holds the single-page app (`web/src/map` for the canvas renderer
  and input, `web/src/state` for the passport and runtime config).
- `data/` holds the committed atlas and the resumable pipeline cache.

Run the tests:

```bash
npm test          # unit and integration (Vitest)
./scripts/e2e.sh  # end-to-end in the pinned Playwright container
```

`npm test` reads the committed atlas and needs no network. The e2e script
builds the production app and drives it in a browser.

## License

MIT. See `LICENSE`.
