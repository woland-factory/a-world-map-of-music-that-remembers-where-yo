import { describe, it, expect } from "vitest";
import { Player, type AudioLike } from "../web/src/audio/player";

function fakeAudio() {
  return {
    src: "",
    currentTime: 5,
    preload: "",
    plays: [] as string[],
    pauses: 0,
    listeners: {} as Record<string, () => void>,
    addEventListener(type: string, fn: () => void) {
      this.listeners[type] = fn;
    },
    fireError() {
      this.listeners.error?.();
    },
    play() {
      this.plays.push(this.src);
      return Promise.resolve();
    },
    pause() {
      this.pauses++;
    },
  };
}

describe("audio player", () => {
  it("play sets the src and starts playback from the top", async () => {
    const el = fakeAudio();
    const p = new Player(el as unknown as AudioLike);
    await p.play("https://audio/one.m4a");
    expect(el.src).toBe("https://audio/one.m4a");
    expect(el.currentTime).toBe(0);
    expect(el.plays).toEqual(["https://audio/one.m4a"]);
  });

  it("selecting a new clip switches src away from the previous one", async () => {
    const el = fakeAudio();
    const p = new Player(el as unknown as AudioLike);
    await p.play("https://audio/one.m4a");
    await p.play("https://audio/two.m4a");
    expect(el.src).toBe("https://audio/two.m4a");
    expect(el.plays).toEqual(["https://audio/one.m4a", "https://audio/two.m4a"]);
  });

  it("warm buffers a clip without playing it", () => {
    const el = fakeAudio();
    const p = new Player(el as unknown as AudioLike);
    p.warm("https://audio/warm.m4a");
    expect(el.src).toBe("https://audio/warm.m4a");
    expect(el.plays).toHaveLength(0);
  });

  it("a warmed clip plays without re-setting src", async () => {
    const el = fakeAudio();
    const p = new Player(el as unknown as AudioLike);
    p.warm("https://audio/warm.m4a");
    await p.play("https://audio/warm.m4a");
    expect(el.plays).toEqual(["https://audio/warm.m4a"]);
  });

  it("stop pauses playback", () => {
    const el = fakeAudio();
    const p = new Player(el as unknown as AudioLike);
    p.stop();
    expect(el.pauses).toBe(1);
  });

  it("reports a load failure only for a clip the user asked to hear", async () => {
    const el = fakeAudio();
    let errors = 0;
    const p = new Player(el as unknown as AudioLike, { onError: () => errors++ });

    // A warm that fails to load is not a request to hear it: stay silent.
    p.warm("https://audio/warm.m4a");
    el.fireError();
    expect(errors).toBe(0);

    // A play that fails surfaces the error once.
    await p.play("https://audio/bad.m4a");
    el.fireError();
    expect(errors).toBe(1);
  });

  it("stops treating a clip as playing after stop, so a late error stays silent", async () => {
    const el = fakeAudio();
    let errors = 0;
    const p = new Player(el as unknown as AudioLike, { onError: () => errors++ });
    await p.play("https://audio/one.m4a");
    p.stop();
    el.fireError();
    expect(errors).toBe(0);
  });
});
