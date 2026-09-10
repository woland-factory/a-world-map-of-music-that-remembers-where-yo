// Designed states: skeleton, error, and the one-time first-run orientation.

const ORIENTATION_KEY = "orientation-dismissed";

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

// Shown once, then never again (localStorage flag). Skippable via "Got it".
export function maybeShowOrientation(): void {
  let dismissed = false;
  try {
    dismissed = window.localStorage.getItem(ORIENTATION_KEY) === "1";
  } catch {
    dismissed = false;
  }
  const el = document.getElementById("orientation");
  if (!el) return;
  if (dismissed) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const dismiss = () => {
    el.hidden = true;
    try {
      window.localStorage.setItem(ORIENTATION_KEY, "1");
    } catch {
      /* storage unavailable: still hide for this session */
    }
  };
  document.getElementById("got-it")?.addEventListener("click", dismiss, { once: true });
}
