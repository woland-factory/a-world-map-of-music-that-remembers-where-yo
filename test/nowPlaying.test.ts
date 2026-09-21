import { describe, it, expect } from "vitest";
import { NowPlaying } from "../web/src/ui/nowPlaying";
import type { Exemplar, Genre } from "../web/src/types";

// A minimal element/DOM stand-in: enough of the surface NowPlaying touches
// (textContent, hidden, addEventListener, querySelector) to exercise it in
// the node test environment without a full DOM.
function elm() {
  return {
    textContent: "",
    hidden: false,
    addEventListener() {},
  };
}

function fakeRoot() {
  const nodes: Record<string, ReturnType<typeof elm>> = {
    "#np-title": elm(),
    "#np-track": elm(),
    "#np-stamp": elm(),
    "#np-stamped": elm(),
    "#np-remove": elm(),
    "#np-close": elm(),
  };
  const root = {
    hidden: true,
    querySelector: (sel: string) => nodes[sel],
  };
  return { root, nodes };
}

function build() {
  const { root, nodes } = fakeRoot();
  const np = new NowPlaying(root as unknown as HTMLElement, {
    onStamp() {},
    onRemove() {},
    onClose() {},
  });
  return { np, root, nodes };
}

const genre: Genre = { id: 1, mbid: "a", name: "jazz", x: 0, y: 0, region: 0, neighbors: [] };
const exemplar: Exemplar = {
  trackTitle: "So What",
  artist: "Miles Davis",
  previewUrl: "https://audio/so-what.m4a",
};

describe("NowPlaying designed states", () => {
  it("shows a real track when the exemplar is present", () => {
    const { np, nodes, root } = build();
    np.show(genre, exemplar, false);
    expect(nodes["#np-title"].textContent).toBe("jazz");
    expect(nodes["#np-track"].textContent).toBe("So What · Miles Davis");
    expect(root.hidden).toBe(false);
  });

  it("shows the resting line when no exemplar has resolved yet", () => {
    const { np, nodes } = build();
    np.show(genre, undefined, false);
    expect(nodes["#np-track"].textContent).toBe("Silent for now. Stamp it to remember.");
  });

  it("surfaces the designed error line when a preview fails to load", () => {
    const { np, nodes } = build();
    np.show(genre, exemplar, false);
    np.showPreviewError();
    expect(nodes["#np-track"].textContent).toBe(
      "That preview didn't load. Tap another genre to hear it.",
    );
  });

  it("refreshing a resting panel to a real track replaces the silent line", () => {
    const { np, nodes } = build();
    np.show(genre, undefined, false); // selected before exemplars resolved
    expect(nodes["#np-track"].textContent).toBe("Silent for now. Stamp it to remember.");
    np.show(genre, exemplar, false); // exemplars arrived: refresh to the track
    expect(nodes["#np-track"].textContent).toBe("So What · Miles Davis");
  });
});
