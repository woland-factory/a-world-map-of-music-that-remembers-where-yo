import type { Atlas } from "../types";
import { regionColor } from "./colors";

// Accessible DOM legend of regions, sorted by size so the biggest
// neighborhoods lead. Collapsible to stay out of the way on a phone.
export function renderLegend(atlas: Atlas, root: HTMLElement, list: HTMLUListElement): void {
  const counts = new Map<number, number>();
  for (const g of atlas.genres) counts.set(g.region, (counts.get(g.region) ?? 0) + 1);

  // Show only regions big enough to read as a neighborhood, largest first.
  const regions = [...atlas.regions]
    .filter((r) => (counts.get(r.id) ?? 0) >= 4)
    .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));

  list.replaceChildren();
  for (const r of regions.slice(0, 12)) {
    const li = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = regionColor(r.id);
    swatch.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = r.label;
    li.append(swatch, label);
    list.append(li);
  }

  const toggle = root.querySelector<HTMLButtonElement>("#legend-toggle");
  toggle?.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!open));
    list.hidden = open;
  });
}
