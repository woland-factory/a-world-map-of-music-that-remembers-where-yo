// First-run guided walkthrough: a non-modal coach mark that points at one
// real, on-screen control at a time with a one-sentence caption and a Skip
// control, and advances as the user performs the real action. It never dims
// the map, never blocks a tap, and disappears the instant the user crosses
// their first frontier. Shown only on a genuine first visit, then never again.

export type StepEvent = "audio" | "lit" | "dareDone";
export type AnchorKey = "starter" | "darePlay" | "dareStamp";

export interface Step {
  text: string; // one short imperative sentence
  anchor: AnchorKey; // which live control to point at
  advance: StepEvent; // the real event that completes this step
}

// The dark script starts from an empty passport (starter chips showing); the
// lit script starts from a seeded/staging map (today's dare showing).
export function walkScript(startedLit: boolean): Step[] {
  if (startedLit) {
    return [
      { text: "Play today's dare to hear it.", anchor: "darePlay", advance: "audio" },
      { text: "Stamp it to cross the frontier.", anchor: "dareStamp", advance: "dareDone" },
    ];
  }
  return [
    { text: "Pick a sound you love to start.", anchor: "starter", advance: "lit" },
    { text: "Play your dare to hear it.", anchor: "darePlay", advance: "audio" },
    { text: "Stamp it to cross the frontier.", anchor: "dareStamp", advance: "dareDone" },
  ];
}

// The path shows if and only if this is a first visit and it is not yet done.
export function shouldShowWalkthrough(firstVisit: boolean, done: boolean): boolean {
  return firstVisit && !done;
}

const DONE_KEY = "walkthrough-done";

function walkthroughDone(): boolean {
  try {
    return window.localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return false;
  }
}

function markDone(): void {
  try {
    window.localStorage.setItem(DONE_KEY, "1");
  } catch {
    /* storage unavailable: still dismiss for this session */
  }
}

export interface WalkthroughDeps {
  root: HTMLElement; // #walkthrough container
  firstVisit: boolean;
  startedLit: boolean;
  baselineLit: number; // lit count at load; "lit" advances when it rises
  anchors: {
    starter: () => HTMLElement | null; // first .dare-chip
    darePlay: () => HTMLElement | null; // .dare-play
    dareStamp: () => HTMLElement | null; // the dare's "Stamp it" button
  };
  expandDare: () => void; // ensure the dare card is expanded before anchoring
}

export class Walkthrough {
  private steps: Step[] = [];
  private index = 0;
  private isActive = false;
  private ring: HTMLElement | null = null;
  private caption: HTMLElement | null = null;
  private textEl: HTMLElement | null = null;
  private readonly onResize = (): void => this.reposition();

  constructor(private deps: WalkthroughDeps) {}

  get active(): boolean {
    return this.isActive;
  }

  // No-op unless the gate passes. Otherwise pick the script by startedLit and
  // render the first resolvable step.
  start(): void {
    if (!shouldShowWalkthrough(this.deps.firstVisit, walkthroughDone())) return;
    this.steps = walkScript(this.deps.startedLit);
    this.index = 0;
    this.isActive = true;
    this.buildDom();
    window.addEventListener("resize", this.onResize);
    this.renderStep();
  }

  noteAudio(): void {
    if (this.isActive && this.current()?.advance === "audio") this.advance();
  }

  noteLit(litCount: number, dareDone: boolean): void {
    if (!this.isActive) return;
    const step = this.current();
    if (!step) return;
    if (step.advance === "lit" && litCount > this.deps.baselineLit) this.advance();
    else if (step.advance === "dareDone" && dareDone) this.advance();
  }

  skip(): void {
    if (this.isActive) this.finish();
  }

  private current(): Step | undefined {
    return this.steps[this.index];
  }

  private anchorFor(key: AnchorKey): HTMLElement | null {
    return this.deps.anchors[key]();
  }

  private advance(): void {
    this.index += 1;
    this.renderStep();
  }

  // Render the current step, or advance past an unresolvable anchor so the
  // path never draws a ring pointing at nothing and never stalls.
  private renderStep(): void {
    const step = this.current();
    if (!step) {
      this.finish();
      return;
    }
    this.deps.expandDare();
    const anchor = this.anchorFor(step.anchor);
    if (!anchor) {
      this.index += 1;
      this.renderStep();
      return;
    }
    if (this.textEl) this.textEl.textContent = step.text;
    this.positionRing(anchor);
    anchor.focus();
    // The dare card can change height between the starter and dare views;
    // reposition once the new layout has settled.
    requestAnimationFrame(() => {
      const a = this.anchorFor(step.anchor);
      if (a && this.isActive) this.positionRing(a);
    });
  }

  private reposition(): void {
    if (!this.isActive) return;
    const step = this.current();
    if (!step) return;
    const anchor = this.anchorFor(step.anchor);
    if (anchor) this.positionRing(anchor);
  }

  private positionRing(anchor: HTMLElement): void {
    if (!this.ring || !this.caption) return;
    const r = anchor.getBoundingClientRect();
    const pad = 6;
    this.ring.style.left = `${r.left - pad}px`;
    this.ring.style.top = `${r.top - pad}px`;
    this.ring.style.width = `${r.width + pad * 2}px`;
    this.ring.style.height = `${r.height + pad * 2}px`;
    // Caption below the anchor when it sits in the upper half, above it when
    // in the lower half, so it never covers the control it points at.
    if (r.top < window.innerHeight / 2) {
      this.caption.style.top = `${r.bottom + 12}px`;
      this.caption.style.bottom = "";
    } else {
      this.caption.style.bottom = `${window.innerHeight - r.top + 12}px`;
      this.caption.style.top = "";
    }
  }

  private buildDom(): void {
    const root = this.deps.root;
    root.replaceChildren();
    root.hidden = false;

    const ring = document.createElement("div");
    ring.className = "wt-ring";
    ring.setAttribute("aria-hidden", "true");

    const caption = document.createElement("div");
    caption.className = "wt-caption";

    const text = document.createElement("p");
    text.className = "wt-text";

    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "wt-skip";
    skip.textContent = "Skip";
    skip.setAttribute("aria-label", "Skip the walkthrough");
    skip.addEventListener("click", () => this.skip());

    caption.append(text, skip);
    root.append(ring, caption);

    this.ring = ring;
    this.caption = caption;
    this.textEl = text;
  }

  private finish(): void {
    this.isActive = false;
    window.removeEventListener("resize", this.onResize);
    const root = this.deps.root;
    root.replaceChildren();
    root.hidden = true;
    this.ring = null;
    this.caption = null;
    this.textEl = null;
    markDone();
  }
}
