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
} from "./state/passport";
import { loadExemplars, getExemplar } from "./state/exemplars";
import { Player } from "./audio/player";
import { NowPlaying } from "./ui/nowPlaying";
import { PassportView } from "./ui/passportView";
import { countLit } from "./map/lit";
import { hideSkeleton, showError, maybeShowOrientation } from "./ui/states";
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

  const passport = await resolveInitialPassport(atlas, exemplarsPromise);
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

  const nowPlaying = new NowPlaying(el("now-playing"), {
    onStamp: () => {
      if (!selected) return;
      addStamp(selected.id, getExemplar(exemplars, selected));
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
  };

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
        if (selected) nowPlaying.setStamped(isStamped(selected.id), stampFor(selected.id)?.date);
      }
      return result.ok;
    },
    onSeeMap: () => renderer.fit(),
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
    if (exemplar) player.play(exemplar.previewUrl);
    else player.stop();
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
    if (passportView.isOpen) passportView.close();
    else if (nowPlaying.visible) deselect();
  });

  const legend = el("legend");
  renderLegend(atlas, legend, el<HTMLUListElement>("legend-list"));
  legend.hidden = false;
  el("controls").hidden = false;
  el("passport-btn").hidden = false;

  hideSkeleton();
  maybeShowOrientation();

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => renderer.resize(), 100);
  });
}

void start();
