import type { Atlas } from "./types";
import { MapRenderer } from "./map/renderer";
import { attachInput, attachControls } from "./map/input";
import { renderLegend } from "./map/legend";
import { resolveInitialPassport, litSet } from "./state/passport";
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

  const passport = await resolveInitialPassport(atlas);
  const lit = litSet(passport);

  const renderer = new MapRenderer(canvas, atlas, lit);
  renderer.resize();
  renderer.fit();

  canvas.setAttribute(
    "aria-label",
    `A map of ${atlas.genres.length} music genres. ${countLit(atlas, lit)} lit.`,
  );

  // Expose the renderer for end-to-end tests to read viewport state.
  (window as unknown as { __renderer?: MapRenderer }).__renderer = renderer;

  attachInput(canvas, renderer);
  attachControls(renderer, {
    zoomIn: el("zoom-in"),
    zoomOut: el("zoom-out"),
    reset: el("reset-view"),
  });

  const legend = el("legend");
  renderLegend(atlas, legend, el<HTMLUListElement>("legend-list"));
  legend.hidden = false;
  el("controls").hidden = false;

  hideSkeleton();
  maybeShowOrientation();

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => renderer.resize(), 100);
  });
}

void start();
