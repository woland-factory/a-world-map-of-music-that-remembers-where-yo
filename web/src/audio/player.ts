// One reusable audio element. Previews are warmed on the pointer that may
// become a tap, so playback can start inside the tap gesture with no wait.

export interface AudioLike {
  src: string;
  currentTime: number;
  preload: string;
  play(): Promise<void>;
  pause(): void;
  addEventListener?(type: string, listener: () => void): void;
}

export interface PlayerDeps {
  // Fires when a clip the user asked to hear fails to load. Autoplay blocks
  // (a rejected play()) are not errors and never reach here.
  onError?: () => void;
}

function createAudio(): AudioLike {
  const a = new Audio();
  a.preload = "auto";
  return a;
}

export class Player {
  private el: AudioLike;
  private currentUrl = "";
  private wantsPlay = false;

  constructor(el?: AudioLike, private deps: PlayerDeps = {}) {
    this.el = el ?? createAudio();
    this.el.preload = "auto";
    // A load/decode failure surfaces through the element's error event, but
    // only counts when the user actually asked to hear the clip.
    this.el.addEventListener?.("error", () => {
      if (this.wantsPlay) this.deps.onError?.();
    });
  }

  // Begin buffering a clip without playing it. Safe to call repeatedly.
  warm(url: string): void {
    if (!url || url === this.currentUrl) return;
    this.wantsPlay = false; // a warm is not a request to hear it
    this.currentUrl = url;
    this.el.src = url;
  }

  // Start playback. MUST be called synchronously inside the tap gesture so
  // mobile autoplay policy is satisfied. Returns the play() promise.
  play(url: string): Promise<void> {
    this.wantsPlay = true;
    if (url && url !== this.currentUrl) {
      this.currentUrl = url;
      this.el.src = url;
    }
    try {
      this.el.currentTime = 0;
    } catch {
      // Some elements reject currentTime before metadata; ignore.
    }
    const p = this.el.play();
    // Autoplay may be blocked; never let a rejection surface as an error.
    return Promise.resolve(p).catch(() => undefined);
  }

  stop(): void {
    this.wantsPlay = false;
    this.el.pause();
    try {
      this.el.currentTime = 0;
    } catch {
      /* ignore */
    }
  }
}
