// The poster modal: opens instantly with a printing status, generates the
// PNG on the next frame, previews it, and downloads it from the same
// object URL. No fetches of any kind happen on this path.

import type { Atlas } from "../types";
import { makePosterBlob, posterDateLine } from "../poster/poster";

export interface PosterModalDeps {
  atlas: Atlas;
  getLit: () => Set<number>;
}

// Local posters skip the footer host so a dev machine name never prints.
function posterHost(): string {
  const host = window.location.host;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) return "";
  return host;
}

export class PosterModal {
  private modal: HTMLElement;
  private wait: HTMLElement;
  private img: HTMLImageElement;
  private downloadBtn: HTMLButtonElement;
  private closeBtn: HTMLButtonElement;
  private url: string | null = null;
  private lastFocus: HTMLElement | null = null;
  private token = 0;

  constructor(root: Document, private deps: PosterModalDeps) {
    this.modal = root.getElementById("poster")!;
    this.wait = root.getElementById("poster-wait")!;
    this.img = root.getElementById("poster-img") as HTMLImageElement;
    this.downloadBtn = root.getElementById("poster-download") as HTMLButtonElement;
    this.closeBtn = root.getElementById("poster-close") as HTMLButtonElement;

    this.closeBtn.addEventListener("click", () => this.close());
    this.downloadBtn.addEventListener("click", () => this.download());
  }

  get isOpen(): boolean {
    return !this.modal.hidden;
  }

  // Show the frame and the status immediately (feedback within 100ms),
  // then draw on the next frame so the open never blocks the tap.
  open(): void {
    this.lastFocus = document.activeElement as HTMLElement;
    this.modal.hidden = false;
    this.wait.hidden = false;
    this.img.hidden = true;
    this.downloadBtn.hidden = true;
    this.closeBtn.focus();
    const token = ++this.token;
    requestAnimationFrame(() => {
      if (token !== this.token) return; // closed before the frame
      void makePosterBlob(this.deps.atlas, this.deps.getLit(), {
        dateLabel: posterDateLine(new Date()),
        host: posterHost(),
      })
        .then((blob) => {
          if (token !== this.token) return;
          this.url = URL.createObjectURL(blob);
          this.img.src = this.url;
          this.img.hidden = false;
          this.downloadBtn.hidden = false;
          this.wait.hidden = true;
        })
        .catch(() => {
          // Blob generation failed: keep the modal honest and recoverable.
          if (token !== this.token) return;
          this.wait.textContent = "The poster didn't print. Close this and try again.";
        });
    });
  }

  private download(): void {
    if (!this.url) return;
    const a = document.createElement("a");
    a.href = this.url;
    a.download = "music-map-poster.png";
    a.click();
  }

  close(): void {
    this.token++;
    this.modal.hidden = true;
    if (this.url) {
      URL.revokeObjectURL(this.url);
      this.url = null;
    }
    this.img.removeAttribute("src");
    this.wait.textContent = "Printing your map.";
    (this.lastFocus ?? document.body).focus();
  }
}
