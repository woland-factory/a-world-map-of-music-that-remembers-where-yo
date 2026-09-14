import type { Atlas, Exemplar, ExemplarIndex, Genre, Passport } from "../types";
import { currentStreak, oneLitNeighbor, starterGenres } from "../state/dare";
import { litSet } from "../state/passport";

export interface DareCardDeps {
  atlas: Atlas;
  getPassport: () => Passport;
  getExemplars: () => ExemplarIndex;
  today: () => string;
  onPlay: (genre: Genre, exemplar: Exemplar) => void;
  onStampDare: () => void;
  onPickStarter: (genreId: number) => void;
  onSeeMap: () => void;
}

// The dare card: a compact top-center card (collapsible to a pill) that hands
// the user one new sound a day from the edge of their lit territory. It shows
// the starter prompt on an empty passport, today's dare, the completed state,
// or the rare no-frontier-left celebration. Every string is set with
// textContent so imported/genre names can never inject markup.
export class DareCard {
  private root: HTMLElement;
  private pill: HTMLButtonElement;
  private panel: HTMLElement;
  private content: HTMLElement;
  private byId: Map<number, Genre>;
  private expanded = true;

  constructor(root: HTMLElement, private deps: DareCardDeps) {
    this.root = root;
    this.byId = new Map(deps.atlas.genres.map((g) => [g.id, g]));
    this.pill = root.querySelector("#dare-pill")!;
    this.panel = root.querySelector("#dare-panel")!;
    this.content = root.querySelector("#dare-content")!;

    this.pill.addEventListener("click", () => this.expand(true));
    root.querySelector("#dare-collapse")!.addEventListener("click", () => this.collapse());
  }

  private exemplarFor(genre: Genre): Exemplar | undefined {
    return this.deps.getExemplars().get(genre.mbid);
  }

  private button(label: string, className: string, onClick: () => void, ariaLabel?: string) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = className;
    b.textContent = label;
    if (ariaLabel) b.setAttribute("aria-label", ariaLabel);
    b.addEventListener("click", onClick);
    return b;
  }

  private heading(text: string) {
    const h = document.createElement("h2");
    h.className = "dare-heading";
    h.textContent = text;
    return h;
  }

  private para(text: string, className: string) {
    const p = document.createElement("p");
    p.className = className;
    p.textContent = text;
    return p;
  }

  // Repaint the card from current passport state. Shows the card (or leaves it
  // as a pill if collapsed). Never steals focus on its own.
  render(): void {
    const p = this.deps.getPassport();
    this.content.replaceChildren();

    if (p.stamps.length === 0) this.renderStarter();
    else if (!p.dare) this.renderNoFrontier();
    else if (p.dare.done) this.renderDone();
    else this.renderDare();

    this.root.hidden = false;
  }

  private renderStarter(): void {
    this.content.append(
      this.heading("Where do you want to start?"),
      this.para("Pick a sound you love. We dare you one step past it.", "dare-body"),
    );
    const chips = document.createElement("div");
    chips.className = "dare-chips";
    for (const g of starterGenres(this.deps.atlas, this.deps.getExemplars())) {
      chips.append(
        this.button(g.name, "dare-chip", () => this.deps.onPickStarter(g.id), `Start with ${g.name}`),
      );
    }
    this.content.append(chips);
  }

  private renderDare(): void {
    const p = this.deps.getPassport();
    const genre = this.byId.get(p.dare!.genreId);
    if (!genre) return;
    const ex = this.exemplarFor(genre);
    const neighbor = oneLitNeighbor(this.deps.atlas, litSet(p), genre.id);

    this.content.append(
      this.para("Today's dare", "dare-label"),
      this.heading(genre.name),
    );
    if (neighbor) this.content.append(this.para(`Next to ${neighbor.name} on your map.`, "dare-hint"));
    this.content.append(
      this.para(
        ex ? `${ex.trackTitle} · ${ex.artist}` : "Silent for now. Stamp it to cross the frontier.",
        "dare-track",
      ),
    );

    const actions = document.createElement("div");
    actions.className = "dare-actions";
    if (ex) {
      actions.append(this.button("Play", "dare-play", () => this.deps.onPlay(genre, ex), "Play the dare"));
    }
    actions.append(this.button("Stamp it", "primary", () => this.deps.onStampDare()));
    this.content.append(actions);

    this.appendStreak();
  }

  private renderDone(): void {
    const p = this.deps.getPassport();
    const genre = this.byId.get(p.dare!.genreId);
    this.content.append(
      this.heading("Frontier moved."),
      this.para(`You crossed into ${genre ? genre.name : "a new sound"}.`, "dare-body"),
    );
    this.appendStreak();
    const actions = document.createElement("div");
    actions.className = "dare-actions";
    actions.append(this.button("See your map", "primary", () => this.deps.onSeeMap()));
    this.content.append(actions, this.para("New dare tomorrow.", "dare-note"));
  }

  private renderNoFrontier(): void {
    this.content.append(
      this.heading("You reached every neighbor."),
      this.para("Tap the map to leap somewhere new.", "dare-body"),
    );
    const actions = document.createElement("div");
    actions.className = "dare-actions";
    actions.append(this.button("See your map", "primary", () => this.deps.onSeeMap()));
    this.content.append(actions);
  }

  private appendStreak(): void {
    const n = currentStreak(this.deps.getPassport(), this.deps.today());
    if (n >= 1) this.content.append(this.para(`${n}-day streak`, "dare-streak"));
  }

  expand(focus = false): void {
    this.expanded = true;
    this.pill.hidden = true;
    this.panel.hidden = false;
    if (focus) {
      const first = this.content.querySelector<HTMLElement>("button");
      first?.focus();
    }
  }

  collapse(): void {
    this.expanded = false;
    this.panel.hidden = true;
    this.pill.hidden = false;
    this.pill.focus();
  }

  get isExpanded(): boolean {
    return this.expanded && !this.root.hidden;
  }
}
