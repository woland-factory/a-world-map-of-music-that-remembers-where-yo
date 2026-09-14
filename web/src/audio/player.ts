// One reusable audio element. Previews are warmed on the pointer that may
// become a tap, so playback can start inside the tap gesture with no wait.

export interface AudioLike {
  src: string;
  currentTime: number;
  preload: string;
  play(): Promise<void>;
  pause(): void;
}

function createAudio(): AudioLike {
  const a = new Audio();
  a.preload = "auto";
  return a;
}

export class Player {
  private el: AudioLike;
  private currentUrl = "";

  constructor(el?: AudioLike) {
    this.el = el ?? createAudio();
    this.el.preload = "auto";
  }

  // Begin buffering a clip without playing it. Safe to call repeatedly.
  warm(url: string): void {
    if (!url || url === this.currentUrl) return;
    this.currentUrl = url;
    this.el.src = url;
  }

  // Start playback. MUST be called synchronously inside the tap gesture so
  // mobile autoplay policy is satisfied. Returns the play() promise.
  play(url: string): Promise<void> {
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
    this.el.pause();
    try {
      this.el.currentTime = 0;
    } catch {
      /* ignore */
    }
  }
}
