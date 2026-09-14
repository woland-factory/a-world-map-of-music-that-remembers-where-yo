import type { Exemplar, Genre } from "../types";

export interface NowPlayingDeps {
  onStamp: () => void;
  onRemove: () => void;
  onClose: () => void;
}

// The now-playing panel: shows the selected genre, its track (or an honest
// resting state), and a Stamp / Remove control.
export class NowPlaying {
  private panel: HTMLElement;
  private title: HTMLElement;
  private track: HTMLElement;
  private stampBtn: HTMLButtonElement;
  private stampedTag: HTMLElement;
  private removeBtn: HTMLButtonElement;

  constructor(root: HTMLElement, private deps: NowPlayingDeps) {
    this.panel = root;
    this.title = root.querySelector("#np-title")!;
    this.track = root.querySelector("#np-track")!;
    this.stampBtn = root.querySelector("#np-stamp")!;
    this.stampedTag = root.querySelector("#np-stamped")!;
    this.removeBtn = root.querySelector("#np-remove")!;

    this.stampBtn.addEventListener("click", () => this.deps.onStamp());
    this.removeBtn.addEventListener("click", () => this.deps.onRemove());
    root.querySelector("#np-close")!.addEventListener("click", () => this.deps.onClose());
  }

  show(genre: Genre, exemplar: Exemplar | undefined, stamped: boolean, date?: string): void {
    this.title.textContent = genre.name;
    if (exemplar) {
      this.track.textContent = `${exemplar.trackTitle} · ${exemplar.artist}`;
    } else {
      this.track.textContent = "Silent for now. Stamp it to remember.";
    }
    this.setStamped(stamped, date);
    this.panel.hidden = false;
  }

  setStamped(stamped: boolean, date?: string): void {
    this.stampBtn.hidden = stamped;
    this.stampedTag.hidden = !stamped;
    this.removeBtn.hidden = !stamped;
    if (stamped && date) this.stampedTag.textContent = `Stamped ${date}`;
  }

  hide(): void {
    this.panel.hidden = true;
  }

  get visible(): boolean {
    return !this.panel.hidden;
  }
}
