// Contain Tab / Shift+Tab within an open dialog so keyboard focus never
// lands on the map, controls, or dare behind it. Attach the returned handler
// to the dialog element's keydown; it cycles the dialog's own focusables.
// Stacking is respected for free: focus lives in the topmost open dialog, so
// only that dialog's listener sees the key.
export function trapTab(container: HTMLElement, e: KeyboardEvent): void {
  if (e.key !== "Tab") return;
  const items = focusables(container);
  if (items.length === 0) {
    e.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement as HTMLElement | null;
  if (e.shiftKey) {
    if (active === first || !container.contains(active)) {
      last.focus();
      e.preventDefault();
    }
  } else if (active === last || !container.contains(active)) {
    first.focus();
    e.preventDefault();
  }
}

function focusables(root: HTMLElement): HTMLElement[] {
  const selector =
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  return [...root.querySelectorAll<HTMLElement>(selector)].filter(
    (el) => el.getClientRects().length > 0 && !el.hasAttribute("disabled"),
  );
}
