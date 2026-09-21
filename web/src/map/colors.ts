// Fixed palette of distinct hues with good contrast on near-black.
// Ordering aims for separation between adjacent regions.
const PALETTE = [
  "#4fc3f7", // sky
  "#ff8a65", // coral
  "#aed581", // lime
  "#ba68c8", // orchid
  "#ffd54f", // amber
  "#4db6ac", // teal
  "#f06292", // pink
  "#9575cd", // violet
  "#dce775", // citron
  "#7986cb", // indigo
  "#4dd0e1", // cyan
  "#ff8f00", // orange
  "#81c784", // green
  "#e57373", // red
  "#64b5f6", // blue
  "#fff176", // yellow
];

export function regionColor(region: number): string {
  return PALETTE[((region % PALETTE.length) + PALETTE.length) % PALETTE.length];
}

// Dim base color for unlit dots on the dark field.
export const UNLIT_COLOR = "#3a3f4b";
export const BACKGROUND = "#0a0c10";
// The interface accent, shared with --accent in style.css.
export const ACCENT = "#4fc3f7";
