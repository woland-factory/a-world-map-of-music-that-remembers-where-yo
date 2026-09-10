import { getEnv } from "./state/env";

// Analytics (Umami) and error tracking (Sentry / GlitchTip) are env-gated
// and fully inert when their env is absent. Both load lazily from a CDN
// script so they never block the first render and add nothing to the
// bundle when unused.
export function initTelemetry(): void {
  const env = getEnv();

  if (env.UMAMI_URL && env.UMAMI_WEBSITE_ID) {
    const s = document.createElement("script");
    s.defer = true;
    s.src = env.UMAMI_URL;
    s.setAttribute("data-website-id", env.UMAMI_WEBSITE_ID);
    document.head.appendChild(s);
  }

  if (env.SENTRY_DSN) {
    const dsn = env.SENTRY_DSN;
    const s = document.createElement("script");
    s.src = "https://browser.sentry-cdn.com/7.120.0/bundle.min.js";
    s.crossOrigin = "anonymous";
    s.onload = () => {
      const S = (window as unknown as { Sentry?: { init: (o: unknown) => void } }).Sentry;
      try {
        S?.init({ dsn });
      } catch {
        /* error tracking is optional; never let it break the app */
      }
    };
    document.head.appendChild(s);
  }
}
