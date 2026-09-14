import type { Atlas, Genre, Passport } from "../types";
import { regionColor } from "../map/colors";

const APPROX_TOTAL = "~2,200";

export interface PassportViewDeps {
  atlas: Atlas;
  getPassport: () => Passport;
  exportText: () => string;
  onRemove: (genreId: number) => void;
  onImport: (text: string) => boolean;
  onSeeMap: () => void;
}

// The passport sheet: the list of stamps, the lit count, export/import, and
// the "See your map" zoom-out. Every string is set with textContent.
export class PassportView {
  private sheet: HTMLElement;
  private button: HTMLButtonElement;
  private badge: HTMLElement;
  private countLine: HTMLElement;
  private list: HTMLElement;
  private empty: HTMLElement;
  private msg: HTMLElement;
  private fileInput: HTMLInputElement;
  private download: HTMLAnchorElement;
  private byId: Map<number, Genre>;
  private lastFocus: HTMLElement | null = null;

  constructor(root: Document, private deps: PassportViewDeps) {
    this.byId = new Map(deps.atlas.genres.map((g) => [g.id, g]));
    this.sheet = root.getElementById("passport")!;
    this.button = root.getElementById("passport-btn") as HTMLButtonElement;
    this.badge = root.getElementById("passport-count")!;
    this.countLine = root.getElementById("passport-countline")!;
    this.list = root.getElementById("passport-list")!;
    this.empty = root.getElementById("passport-empty")!;
    this.msg = root.getElementById("passport-msg")!;
    this.fileInput = root.getElementById("passport-file") as HTMLInputElement;
    this.download = root.getElementById("passport-download") as HTMLAnchorElement;

    this.button.addEventListener("click", () => this.open());
    root.getElementById("passport-close")!.addEventListener("click", () => this.close());
    root.getElementById("passport-export")!.addEventListener("click", () => this.doExport());
    root.getElementById("passport-import")!.addEventListener("click", () => this.fileInput.click());
    root.getElementById("passport-see")!.addEventListener("click", () => {
      this.close();
      this.deps.onSeeMap();
    });
    this.fileInput.addEventListener("change", () => this.doImport());
    this.sheet.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close();
    });

    this.refresh();
  }

  // Update the badge, count line, list, and empty state from current state.
  refresh(): void {
    const stamps = this.deps.getPassport().stamps;
    const n = stamps.length;
    this.badge.textContent = String(n);
    this.countLine.textContent = `${n} of ${APPROX_TOTAL} lit`;
    this.empty.hidden = n > 0;
    this.list.hidden = n === 0;

    this.list.replaceChildren();
    // Newest first: by date desc, then most-recently added.
    const ordered = stamps
      .map((s, idx) => ({ s, idx }))
      .sort((a, b) => (a.s.date === b.s.date ? b.idx - a.idx : a.s.date < b.s.date ? 1 : -1));

    for (const { s } of ordered) {
      const g = this.byId.get(s.genreId);
      if (!g) continue;
      const li = document.createElement("li");
      li.className = "ps-row";

      const swatch = document.createElement("span");
      swatch.className = "ps-swatch";
      swatch.style.background = regionColor(g.region);
      swatch.setAttribute("aria-hidden", "true");

      const body = document.createElement("div");
      body.className = "ps-body";
      const name = document.createElement("span");
      name.className = "ps-name";
      name.textContent = g.name;
      body.append(name);
      if (s.trackTitle && s.artist) {
        const meta = document.createElement("span");
        meta.className = "ps-meta";
        meta.textContent = `${s.trackTitle} · ${s.artist}`;
        body.append(meta);
      }
      const date = document.createElement("span");
      date.className = "ps-date";
      date.textContent = s.date;
      body.append(date);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "ps-remove";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove stamp ${g.name}`);
      remove.addEventListener("click", () => {
        this.deps.onRemove(s.genreId);
        this.refresh();
      });

      li.append(swatch, body, remove);
      this.list.append(li);
    }
  }

  open(): void {
    this.lastFocus = document.activeElement as HTMLElement;
    this.refresh();
    this.sheet.hidden = false;
    const close = this.sheet.querySelector<HTMLButtonElement>("#passport-close");
    close?.focus();
  }

  close(): void {
    this.sheet.hidden = true;
    this.hideMsg();
    (this.lastFocus ?? this.button).focus();
  }

  get isOpen(): boolean {
    return !this.sheet.hidden;
  }

  private doExport(): void {
    const blob = new Blob([this.deps.exportText()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    this.download.href = url;
    this.download.download = "music-passport.json";
    this.download.click();
    URL.revokeObjectURL(url);
  }

  private doImport(): void {
    const file = this.fileInput.files?.[0];
    this.fileInput.value = ""; // allow re-importing the same file
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const ok = this.deps.onImport(String(reader.result ?? ""));
      if (ok) {
        this.refresh();
        this.showMsg("Passport restored.");
      } else {
        this.showMsg("That file did not look like a passport. Pick a passport you exported here.");
      }
    };
    reader.onerror = () =>
      this.showMsg("That file did not look like a passport. Pick a passport you exported here.");
    reader.readAsText(file);
  }

  private showMsg(text: string): void {
    this.msg.textContent = text;
    this.msg.hidden = false;
  }

  private hideMsg(): void {
    this.msg.hidden = true;
    this.msg.textContent = "";
  }
}
