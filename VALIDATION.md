# VALIDATION — A world map of music that remembers where you've been

## Verdict: VIABLE

Viable as value, with one hard risk that must be gated at EPIC 1 and one
honesty requirement that must be baked into the framing. Both are named
below with the exact conditions under which I would flip this verdict.

All load-bearing technical claims were re-verified live on 2026-09-09
from this worktree:

- **iTunes Search API**: keyless, returns `previewUrl` 30-second AAC
  clips (confirmed with a live query for "zeuhl"). Works today.
- **MusicBrainz genre API**: public, keyless, currently 2,197 genres
  (`genre-count` from the live endpoint). JSON dumps are current
  (latest: 2026-09-09) and publicly downloadable.
- **ListenBrainz stats API**: public and keyless per user, including a
  `genre-activity` endpoint that returns genre-level listen counts for a
  plain username (confirmed live for user `rob`). The zero-login
  auto-fill path is real.

So every ingredient exists, is free, needs no key, no OAuth, and no
third-party approval. The question is not "can the parts be obtained"
but "does assembling them produce the magic," which is a layout-quality
question, addressed under Risks.

## Core value proposition

A living, explorable map of all ~2,200 music genres that fills in with
color where *you* have traveled and dares you across your own border
each day. Every existing map (everynoise.com frozen, musicmap.info,
Gnod) is a stateless reference work; every existing tracker (Last.fm,
1001 Albums Generator) has no map. The combination — spatial adjacency ×
persistent personal territory × a mechanical daily dare — exists
nowhere, and the signature moment (zooming out to see three glowing
neighborhoods in a mostly dark world) cannot be reproduced by a chatbot,
a spreadsheet, or any incumbent.

It survives the standard tests:

- **Chatbot test**: a chatbot can name genres but cannot be a pannable
  space with visible adjacency, instant audio, and a rendered record of
  darkness shrinking over months. The tenth session is visibly different
  from the first; a chat answer leaves nothing behind.
- **Existing-free-tool test**: named alternatives checked in the dossier
  (everynoise, musicmap, Gnod, volt.fm, ListenBrainz explorer, 1001AG)
  each hold one piece; none holds the combination. The frozen everynoise
  snapshot in particular keeps no record of anyone.
- **Durable artifact**: the listening passport — dated genre stamps,
  each pinned to the exact track that earned it, exportable as JSON and
  a shareable poster. The map is regenerable from it. This is literally
  the artifact ENAO mourners wish their decade of exploration had left.
- **Compounding**: value accumulates with use by construction. The lit
  region grows; the dare engine feeds off the passport's own frontier.

## Minimal feature set (the smallest product that delivers the value)

1. **The map**: a precomputed 2-D embedding of MusicBrainz's genre
   vocabulary (genre-genre relationships + artist tag co-occurrence
   from the dumps), rendered pannable/zoomable, with hover/tap playing a
   cached iTunes preview exemplar per genre. Built once, offline; the
   runtime is a static site plus data files.
2. **The passport**: stamp a genre (manually, or auto-fill from a public
   ListenBrainz username), stored in browser storage, one-click JSON
   export/import. Each stamp: date + the track that earned it.
3. **The lit map**: passport renders as colored territory over the dark
   map. The zoom-out is the signature moment and must work from the
   first three stamps.
4. **The daily dare**: pick one unstamped genre adjacent to the user's
   territory, play its preview instantly, one tap to stamp. Must work
   from an empty passport (dare from a seed genre the user picks).

No accounts, no server-side user state, no runtime LLM (`llm_request`
stays empty — the loop is fully mechanical, and any genre blurbs can be
pre-generated at build time).

## Main risks

1. **Layout quality is the single point of failure.** ENAO's geography
   came from Spotify's proprietary audio analysis; here it must emerge
   from community tag co-occurrence and genre relationships. If
   neighbors do not feel musically adjacent, the dare loop degrades into
   a random genre picker and the whole defense collapses into "a
   checklist with extra steps." Mitigation: EPIC 1 builds ONLY the
   layout and judges it with eyes against known ground truth (metal
   subgenres must cluster, jazz must border blues, zeuhl must sit near
   prog) before anything else is funded. This is a data-science outcome,
   not a feature; it must be allowed to fail early and cheaply.
2. **The passport must be framed as an exploration record, not a
   listening history.** The skeptic's strongest objection is right:
   no new app can observe most people's real listening (Spotify's API is
   closed). For everyone without ListenBrainz, stamps record previews
   explored inside the site. That is honest and sufficient — a travel
   passport records trips taken, not life lived, and 1001 Albums
   Generator thrives on exactly this self-reported shape — but any copy
   promising "your listening life, visualized" would be a lie the user
   feels within a week. The plan must commit to the exploration framing.
3. **Retention is a hypothesis.** The mourning evidence endorses the
   map; the daily-dare-plus-record loop is validated only by analogy
   (1001AG). A motivated first session may stamp most of what a user
   ever stamps. Acceptable for a free delight product, and the dare
   mechanic is the cheapest possible bet against it, but it is a bet.
4. **Build-time pipeline vs. run ceilings.** The MusicBrainz dumps are
   gigabytes, and resolving ~2,200 genre exemplars through iTunes at the
   polite ~20 req/min rate takes about two hours of wall clock. Neither
   fits one 1-hour agent run. Mitigation: the pipeline must be
   incremental and committed as it goes (partial exemplar cache is
   valid state; the map ships showing coverage honestly), and derived
   data files are committed artifacts, not runtime jobs.
5. **Long-tail data quality.** Community genre tagging is uneven; some
   regions will be sparse or mislabeled, and some obscure genres —
   exactly where the dare wants to send people — will lack good iTunes
   exemplars. Ship honest coverage indicators rather than faking density.

## What would make me reject it

- If EPIC 1's layout, after honest iteration, still fails the eyes test
  (adjacent genres do not sound adjacent; known clusters do not form),
  the product has no magic and should be killed rather than shipped as a
  checklist wearing a map costume.
- If the plan drifts toward promising real listening history (Spotify
  OAuth, "sync your library") — that promise is unbuildable and the
  product must never make it.
- If the dare loop cannot produce a genuinely playable preview for the
  large majority of dares near common starting territories, the daily
  loop dies on contact.

None of these is true today, and the first is exactly what EPIC 1 is
designed to find out for the price of one build unit. Proceed.
