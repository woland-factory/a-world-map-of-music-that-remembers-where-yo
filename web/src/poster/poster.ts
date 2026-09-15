// Poster layout and drawing: pure math plus one canvas pass. Everything
// draws from data already in memory with system fonts, so making a poster
// never touches the network and toBlob can never hit a tainted canvas.

import type { Atlas } from "../types";
import { BACKGROUND, UNLIT_COLOR, regionColor } from "../map/colors";

export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1350; // 4:5 portrait

const MAP_RECT = { x: 60, y: 170, w: 960, h: 950 };

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FitTransform {
  scale: number;
  dx: number;
  dy: number;
}

// Fit the atlas bounds into a target rect preserving aspect, centered.
// Degenerate bounds (zero width or height) scale by the other axis; a
// single point sits at the rect center with scale 1.
export function fitTransform(bounds: Bounds, rect: Rect): FitTransform {
  const bw = bounds.maxX - bounds.minX;
  const bh = bounds.maxY - bounds.minY;
  const sx = bw > 0 ? rect.w / bw : Infinity;
  const sy = bh > 0 ? rect.h / bh : Infinity;
  const scale = Math.min(sx, sy) === Infinity ? 1 : Math.min(sx, sy);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return {
    scale,
    dx: rect.x + rect.w / 2 - cx * scale,
    dy: rect.y + rect.h / 2 - cy * scale,
  };
}

export function posterCountLine(lit: number, total: number): string {
  return `${lit.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} genres lit`;
}

export function posterDateLine(date: Date): string {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export interface PosterOpts {
  dateLabel: string;
  host: string;
}

export function drawPoster(
  canvas: HTMLCanvasElement,
  atlas: Atlas,
  lit: Set<number>,
  opts: PosterOpts,
): void {
  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available");

  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

  const t = fitTransform(atlas.bounds, MAP_RECT);
  // Unlit dots first, then lit with glow, mirroring the live renderer's
  // draw order so glow reads over the dark field.
  for (const g of atlas.genres) {
    if (lit.has(g.id)) continue;
    ctx.beginPath();
    ctx.arc(g.x * t.scale + t.dx, g.y * t.scale + t.dy, 2, 0, Math.PI * 2);
    ctx.fillStyle = UNLIT_COLOR;
    ctx.fill();
  }
  for (const g of atlas.genres) {
    if (!lit.has(g.id)) continue;
    const color = regionColor(g.region);
    ctx.shadowBlur = 14;
    ctx.shadowColor = color;
    ctx.beginPath();
    ctx.arc(g.x * t.scale + t.dx, g.y * t.scale + t.dy, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "600 34px system-ui, sans-serif";
  ctx.fillStyle = "rgba(233,238,246,0.92)";
  ctx.fillText("A world map of music", POSTER_WIDTH / 2, 96);

  const litCount = atlas.genres.reduce((n, g) => n + (lit.has(g.id) ? 1 : 0), 0);
  ctx.font = "600 44px system-ui, sans-serif";
  ctx.fillText(posterCountLine(litCount, atlas.genres.length), POSTER_WIDTH / 2, 1210);

  ctx.font = "400 24px system-ui, sans-serif";
  ctx.fillStyle = "rgba(148,163,184,0.9)";
  const footer = opts.host ? `${opts.dateLabel} · ${opts.host}` : opts.dateLabel;
  ctx.fillText(footer, POSTER_WIDTH / 2, 1268);
}

// Draw on a fresh offscreen canvas and resolve a PNG Blob. Rejects only
// if the browser returns null from toBlob.
export function makePosterBlob(atlas: Atlas, lit: Set<number>, opts: PosterOpts): Promise<Blob> {
  const canvas = document.createElement("canvas");
  drawPoster(canvas, atlas, lit, opts);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob returned null"))),
      "image/png",
    );
  });
}
