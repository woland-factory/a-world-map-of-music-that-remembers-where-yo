// Designed states: the skeleton and the error surface.

export function hideSkeleton(): void {
  const el = document.getElementById("skeleton");
  if (el) {
    el.setAttribute("aria-hidden", "true");
    el.hidden = true;
  }
}

export function showError(onReload: () => void): void {
  hideSkeleton();
  const el = document.getElementById("error");
  if (!el) return;
  el.hidden = false;
  const btn = document.getElementById("reload");
  btn?.addEventListener("click", onReload, { once: true });
}
