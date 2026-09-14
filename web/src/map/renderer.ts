import type { Atlas, Genre } from "../types";
import { BACKGROUND } from "./colors";
import { computeRenderGenres, type RenderGenre } from "./lit";

const TAP_RADIUS = 14; // comfortable touch target around a genre node

export interface Viewport {
  scale: number;
  offsetX: number;
  offsetY: number;
}

const LABEL_RATIO = 2.5; // above this zoom (relative to fit) show genre labels
const MAX_GENRE_LABELS = 40;
const MIN_FONT = 11;

export class MapRenderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;
  private render: RenderGenre[];
  private regionCentroids: { region: number; x: number; y: number; label: string }[];
  vp: Viewport = { scale: 1, offsetX: 0, offsetY: 0 };
  fitScale = 1;
  private frame = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private atlas: Atlas,
    lit: Set<number>,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available");
    this.ctx = ctx;
    this.render = computeRenderGenres(atlas, lit);
    this.regionCentroids = this.computeCentroids();
  }

  private computeCentroids() {
    const sums = new Map<number, { x: number; y: number; n: number }>();
    for (const g of this.atlas.genres) {
      const s = sums.get(g.region) ?? { x: 0, y: 0, n: 0 };
      s.x += g.x;
      s.y += g.y;
      s.n += 1;
      sums.set(g.region, s);
    }
    // Only label regions large enough to read as a neighborhood, biggest
    // first, so a zoomed-out map shows a few anchors instead of a wall of
    // overlapping names.
    return this.atlas.regions
      .map((r) => {
        const s = sums.get(r.id) ?? { x: 0, y: 0, n: 1 };
        return { region: r.id, x: s.x / s.n, y: s.y / s.n, label: r.label, size: s.n };
      })
      .filter((r) => r.size >= 4)
      .sort((a, b) => b.size - a.size)
      .slice(0, 10);
  }

  setLit(lit: Set<number>): void {
    this.render = computeRenderGenres(this.atlas, lit);
    this.requestDraw();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.cssW = rect.width;
    this.cssH = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.requestDraw();
  }

  fit(): void {
    const b = this.atlas.bounds;
    const pad = 40;
    const w = Math.max(b.maxX - b.minX, 1);
    const h = Math.max(b.maxY - b.minY, 1);
    const scale = Math.min((this.cssW - pad * 2) / w, (this.cssH - pad * 2) / h);
    this.fitScale = scale;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    this.vp = {
      scale,
      offsetX: this.cssW / 2 - cx * scale,
      offsetY: this.cssH / 2 - cy * scale,
    };
    this.requestDraw();
  }

  get width(): number {
    return this.cssW;
  }
  get height(): number {
    return this.cssH;
  }

  clampScale(scale: number): number {
    const min = this.fitScale * 0.6;
    const max = this.fitScale * 40;
    return Math.max(min, Math.min(max, scale));
  }

  // Zoom keeping the point (cx, cy) in screen space fixed.
  zoomBy(factor: number, cx: number, cy: number): void {
    const next = this.clampScale(this.vp.scale * factor);
    const applied = next / this.vp.scale;
    this.vp.offsetX = cx - (cx - this.vp.offsetX) * applied;
    this.vp.offsetY = cy - (cy - this.vp.offsetY) * applied;
    this.vp.scale = next;
    this.clampOffset();
    this.requestDraw();
  }

  panBy(dx: number, dy: number): void {
    this.vp.offsetX += dx;
    this.vp.offsetY += dy;
    this.clampOffset();
    this.requestDraw();
  }

  // Keep the atlas center within reach so panning never leaves empty space.
  clampOffset(): void {
    const b = this.atlas.bounds;
    const margin = Math.min(this.cssW, this.cssH) * 0.6;
    const left = b.minX * this.vp.scale + this.vp.offsetX;
    const right = b.maxX * this.vp.scale + this.vp.offsetX;
    const top = b.minY * this.vp.scale + this.vp.offsetY;
    const bottom = b.maxY * this.vp.scale + this.vp.offsetY;
    if (left > this.cssW - margin) this.vp.offsetX -= left - (this.cssW - margin);
    if (right < margin) this.vp.offsetX += margin - right;
    if (top > this.cssH - margin) this.vp.offsetY -= top - (this.cssH - margin);
    if (bottom < margin) this.vp.offsetY += margin - bottom;
  }

  private toScreenX(x: number): number {
    return x * this.vp.scale + this.vp.offsetX;
  }
  private toScreenY(y: number): number {
    return y * this.vp.scale + this.vp.offsetY;
  }

  // Nearest genre within a tap radius of a screen point, or null. A linear
  // scan over ~2,200 nodes is well under a frame, so no spatial index.
  hitTest(screenX: number, screenY: number): Genre | null {
    let best: Genre | null = null;
    let bestDist = TAP_RADIUS * TAP_RADIUS;
    for (const r of this.render) {
      const dx = this.toScreenX(r.genre.x) - screenX;
      const dy = this.toScreenY(r.genre.y) - screenY;
      const d = dx * dx + dy * dy;
      if (d <= bestDist) {
        bestDist = d;
        best = r.genre;
      }
    }
    return best;
  }

  requestDraw(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  private draw(): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    const ratio = this.vp.scale / this.fitScale;
    const dotBase = ratio < 1.5 ? 1.6 : 2.2;

    // Unlit dots first, then lit on top so glow reads over the field.
    for (const r of this.render) {
      if (r.lit) continue;
      this.drawDot(r, dotBase, false);
    }
    for (const r of this.render) {
      if (!r.lit) continue;
      this.drawDot(r, dotBase + 1.2, true);
    }

    if (ratio < LABEL_RATIO) this.drawRegionLabels();
    else this.drawGenreLabels();
  }

  private drawDot(r: RenderGenre, radius: number, glow: boolean): void {
    const sx = this.toScreenX(r.genre.x);
    const sy = this.toScreenY(r.genre.y);
    if (sx < -20 || sx > this.cssW + 20 || sy < -20 || sy > this.cssH + 20) return;
    const ctx = this.ctx;
    if (glow) {
      ctx.shadowBlur = 12;
      ctx.shadowColor = r.color;
    }
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fillStyle = r.color;
    ctx.fill();
    if (glow) ctx.shadowBlur = 0;
  }

  private drawRegionLabels(): void {
    const ctx = this.ctx;
    ctx.font = "600 14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const placed: { x: number; y: number }[] = [];
    for (const c of this.regionCentroids) {
      const sx = this.toScreenX(c.x);
      const sy = this.toScreenY(c.y);
      if (sx < 0 || sx > this.cssW || sy < 0 || sy > this.cssH) continue;
      if (placed.some((p) => Math.abs(p.x - sx) < 90 && Math.abs(p.y - sy) < 18)) continue;
      placed.push({ x: sx, y: sy });
      // Shadow so the name reads over the dot field.
      ctx.shadowBlur = 6;
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.fillStyle = "rgba(233,238,246,0.92)";
      ctx.fillText(c.label, sx, sy);
      ctx.shadowBlur = 0;
    }
  }

  private drawGenreLabels(): void {
    const ctx = this.ctx;
    const fontPx = Math.max(MIN_FONT, Math.min(15, 11 * (this.vp.scale / this.fitScale) * 0.25));
    ctx.font = `500 ${fontPx}px system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    // Prioritize lit genres, then well-connected ones.
    const inView = this.render
      .filter((r) => {
        const sx = this.toScreenX(r.genre.x);
        const sy = this.toScreenY(r.genre.y);
        return sx > 0 && sx < this.cssW && sy > 0 && sy < this.cssH;
      })
      .sort((a, b) => {
        if (a.lit !== b.lit) return a.lit ? -1 : 1;
        return b.genre.neighbors.length - a.genre.neighbors.length;
      });

    const placed: { x: number; y: number }[] = [];
    let count = 0;
    for (const r of inView) {
      if (count >= MAX_GENRE_LABELS) break;
      const sx = this.toScreenX(r.genre.x);
      const sy = this.toScreenY(r.genre.y);
      if (placed.some((p) => Math.abs(p.x - sx) < 70 && Math.abs(p.y - sy) < 16)) continue;
      placed.push({ x: sx, y: sy });
      ctx.fillStyle = r.lit ? r.color : "rgba(203,213,225,0.75)";
      ctx.fillText(r.genre.name, sx + 5, sy);
      count++;
    }
  }
}
