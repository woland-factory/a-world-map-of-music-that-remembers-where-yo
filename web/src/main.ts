import type { Atlas, ExemplarIndex, Genre } from "./types";
import { MapRenderer } from "./map/renderer";
import { attachInput, attachControls } from "./map/input";
import { renderLegend } from "./map/legend";
import {
  resolveInitialPassport,
  litSet,
  getPassport,
  addStamp,
  removeStamp,
  importPassport,
  exportPassport,
  isStamped,
  stampFor,
  ensureDare,
  completeDare,
  getDare,
  todayString,
  addStamps,
  hasStoredPassport,
} from "./state/passport";
import { fillFromListenBrainz } from "./state/listenbrainz";
import { PosterModal } from "./ui/posterModal";
import { loadExemplars, getExemplar } from "./state/exemplars";
import { darePreviewUrl } from "./state/dare";
import { Player } from "./audio/player";
import { NowPlaying } from "./ui/nowPlaying";
import { DareCard } from "./ui/dareCard";
import { PassportView } from "./ui/passportView";
import { countLit } from "./map/lit";
import { hideSkeleton, showError } from "./ui/states";
import { Walkthrough } from "./ui/walkthrough";
import { initTelemetry } from "./telemetry";

async function loadAtlas(): Promise<Atlas> {
  const res = await fetch("/data/genres.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`atlas ${res.status}`);
  const atlas = (await res.json()) as Atlas;
  if (!atlas.genres || atlas.genres.length === 0) throw new Error("empty atlas");
  return atlas;
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

interface NowPlayingHook {
  mbid: string | null;
  trackTitle: string | null;
  artist: string | null;
  hasPreview: boolean;
  playing: boolean;
}

async function start(): Promise<void> {
  initTelemetry();
  const canvas = el<HTMLCanvasElement>("map");

  let atlas: Atlas;
  try {
    atlas = await loadAtlas();
  } catch {
    showError(() => window.location.reload());
    return;
  }

  // Exemplars load in parallel and never block the map render.
  const exemplarsPromise = loadExemplars();
  let exemplars: ExemplarIndex = new Map();
  void exemplarsPromise.then((idx) => {
    exemplars = idx;
    (window as unknown as { __exemplarsReady?: boolean }).__exemplarsReady = true;
  });

  // Capture a genuine first visit BEFORE resolveInitialPassport, because
  // SEED_DEMO writes a demo passport on first load and would otherwise mask it.
  const firstVisit = !hasStoredPassport();

  const passport = await resolveInitialPassport(atlas, exemplarsPromise);
  const baselineLit = countLit(atlas, litSet(passport));
  const todayStr = todayString();
  const byId = new Map(atlas.genres.map((g) => [g.id, g]));
  const renderer = new MapRenderer(canvas, atlas, litSet(passport));
  renderer.resize();
  renderer.fit();

  const updateAriaLabel = () => {
    const lit = countLit(atlas, litSet(getPassport()));
    canvas.setAttribute("aria-label", `A map of ${atlas.genres.length} music genres. ${lit} lit.`);
  };
  updateAriaLabel();

  // Expose the renderer for end-to-end tests to read viewport state.
  (window as unknown as { __renderer?: MapRenderer }).__renderer = renderer;

  const player = new Player();
  let selected: Genre | null = null;

  const setHook = (genre: Genre | null, hasPreview: boolean, playing: boolean): void => {
    const ex = genre ? getExemplar(exemplars, genre) : undefined;
    (window as unknown as { __nowPlaying?: NowPlayingHook }).__nowPlaying = {
      mbid: genre?.mbid ?? null,
      trackTitle: ex?.trackTitle ?? null,
      artist: ex?.artist ?? null,
      hasPreview,
      playing,
    };
  };

  let dareCard: DareCard | undefined;
  let walkthrough: Walkthrough | undefined;

  const nowPlaying = new NowPlaying(el("now-playing"), {
    onStamp: () => {
      if (!selected) return;
      addStamp(selected.id, getExemplar(exemplars, selected));
      // Stamping the dare's genre from the map completes the dare too, so the
      // streak and frontier history update exactly once.
      if (getDare()?.genreId === selected.id) completeDare(selected.id, todayStr);
      applyPassportChange();
      nowPlaying.setStamped(true, stampFor(selected.id)?.date);
    },
    onRemove: () => {
      if (!selected) return;
      removeStamp(selected.id);
      applyPassportChange();
      nowPlaying.setStamped(false);
    },
    onClose: () => deselect(),
  });

  let passportView: PassportView;

  const applyPassportChange = (): void => {
    renderer.setLit(litSet(getPassport()));
    updateAriaLabel();
    passportView.refresh();
    // Keep today's dare in sync: pin one when territory first lights, and mark
    // it done when its genre was just stamped. Idempotent when already pinned.
    if (dareCard) {
      ensureDare(atlas, exemplars, todayStr);
      dareCard.render();
    }
    // Advance the walkthrough off the real passport change: a starter pick
    // lights the map, a stamp crosses the frontier. Runs after the dare synced.
    walkthrough?.noteLit(countLit(atlas, litSet(getPassport())), getDare()?.done === true);
  };

  const posterModal = new PosterModal(document, {
    atlas,
    getLit: () => litSet(getPassport()),
  });

  passportView = new PassportView(document, {
    atlas,
    getPassport,
    exportText: exportPassport,
    onRemove: (genreId) => {
      removeStamp(genreId);
      renderer.setLit(litSet(getPassport()));
      updateAriaLabel();
      if (selected && selected.id === genreId) nowPlaying.setStamped(false);
    },
    onImport: (text) => {
      const result = importPassport(text);
      if (result.ok) {
        renderer.setLit(litSet(getPassport()));
        updateAriaLabel();
        if (dareCard) {
          ensureDare(atlas, exemplars, todayStr);
          dareCard.render();
        }
        if (selected) nowPlaying.setStamped(isStamped(selected.id), stampFor(selected.id)?.date);
      }
      return result.ok;
    },
    onSeeMap: () => renderer.fit(),
    onFill: async (name) => {
      const result = await fillFromListenBrainz(name, { fetchImpl: (u) => fetch(u), addStamps });
      if (result.added > 0) {
        // One batch already landed in storage; one repaint here, then the
        // zoom-out frames the newly lit territory.
        applyPassportChange();
        renderer.fit();
        if (selected) nowPlaying.setStamped(isStamped(selected.id), stampFor(selected.id)?.date);
      }
      return result;
    },
    onPoster: () => posterModal.open(),
  });

  const select = (genre: Genre | null): void => {
    if (!genre) {
      deselect();
      return;
    }
    selected = genre;
    const exemplar = getExemplar(exemplars, genre);
    nowPlaying.show(genre, exemplar, isStamped(genre.id), stampFor(genre.id)?.date);
    setHook(genre, !!exemplar, !!exemplar);
    if (exemplar) {
      player.play(exemplar.previewUrl);
      walkthrough?.noteAudio();
    } else player.stop();
  };

  const deselect = (): void => {
    selected = null;
    nowPlaying.hide();
    player.stop();
    setHook(null, false, false);
  };

  attachInput(canvas, renderer, {
    onSelect: (genre) => select(genre),
    onWarm: (genre) => {
      const ex = getExemplar(exemplars, genre);
      if (ex) player.warm(ex.previewUrl);
    },
  });
  attachControls(renderer, {
    zoomIn: el("zoom-in"),
    zoomOut: el("zoom-out"),
    reset: el("reset-view"),
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (posterModal.isOpen) posterModal.close();
    else if (passportView.isOpen) passportView.close();
    else if (nowPlaying.visible) deselect();
    // The dare stays expanded during the walkthrough, so let Escape skip the
    // path itself rather than collapse the card out from under it.
    else if (dareCard?.isExpanded && !walkthrough?.active) dareCard.collapse();
    else if (walkthrough?.active) walkthrough.skip();
  });

  const legend = el("legend");
  renderLegend(atlas, legend, el<HTMLUListElement>("legend-list"));
  legend.hidden = false;
  el("controls").hidden = false;
  el("passport-btn").hidden = false;

  hideSkeleton();

  // The dare is computed once exemplars resolve so it can prefer a playable
  // neighbor. It never blocks the map, which is already interactive above.
  exemplars = await exemplarsPromise.catch(() => new Map());
  ensureDare(atlas, exemplars, todayStr);

  // Warm the dare's preview the moment it is known so the first Play is
  // instant. Called on load and after a starter pick, never on passport reads.
  const warmDare = (): void => {
    const url = darePreviewUrl(getPassport(), exemplars, atlas);
    if (url) player.warm(url);
  };

  dareCard = new DareCard(el("dare"), {
    atlas,
    getPassport,
    getExemplars: () => exemplars,
    today: () => todayStr,
    onPlay: (genre, ex) => {
      setHook(genre, true, true);
      player.play(ex.previewUrl);
      walkthrough?.noteAudio();
    },
    onStampDare: () => {
      const dare = getDare();
      if (!dare) return;
      const genre = byId.get(dare.genreId);
      addStamp(dare.genreId, genre ? getExemplar(exemplars, genre) : undefined);
      completeDare(dare.genreId, todayStr);
      applyPassportChange();
      if (selected && selected.id === dare.genreId)
        nowPlaying.setStamped(true, stampFor(dare.genreId)?.date);
    },
    onPickStarter: (genreId) => {
      const genre = byId.get(genreId);
      addStamp(genreId, genre ? getExemplar(exemplars, genre) : undefined);
      applyPassportChange(); // ensures a fresh dare from the newly lit start
      warmDare();
    },
    onSeeMap: () => {
      renderer.fit();
      dareCard?.collapse();
    },
  });
  dareCard.render();
  warmDare();

  // The guided first run points at the dare card's real controls, so it is
  // built last, once those anchors exist. It self-gates to a first visit.
  walkthrough = new Walkthrough({
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

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => renderer.resize(), 100);
  });
}

void start();
