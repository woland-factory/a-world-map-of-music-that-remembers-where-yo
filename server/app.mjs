// The request handler for the ListenBrainz proxy. All time and I/O are
// injected so tests never touch the network or the clock.
//
// Privacy, non-negotiable: the username appears in no log line and no
// error report. The only log format is "lb <status> <ms>ms cache=<...>";
// nothing here ever interpolates the URL or the name into logged text.

import {
  buildNameIndex,
  matchGenres,
  RateLimiter,
  TtlCache,
  validateUsername,
} from "./lb.mjs";

const UPSTREAM_BASE = "https://api.listenbrainz.org/1/stats/user/";
const USER_AGENT = "world-map-of-music/1.0";
const UPSTREAM_TIMEOUT_MS = 8000;

const TTL_SUCCESS = 6 * 60 * 60 * 1000;
const TTL_NOT_FOUND = 5 * 60 * 1000;
const TTL_PENDING = 10 * 60 * 1000;

const ERRORS = {
  badName:
    "That name has a character ListenBrainz skips. Check it, or tap any genre to stamp it yourself.",
  unknownUser:
    "ListenBrainz can't find that name. Check the spelling, or tap any genre to stamp it yourself.",
  rateLimited: "Lots of lookups right now. Wait a minute and try again.",
  upstreamDown: "ListenBrainz didn't answer. Try again in a moment.",
  broke: "The lookup broke on our side. Try again in a moment.",
  unknownPath: "Check the address and try again.",
};

export function createHandler({
  atlas,
  fetchImpl = fetch,
  now = Date.now,
  log = console.log,
  reportError = (_err, _name) => {},
}) {
  const nameIndex = buildNameIndex(atlas);
  const cache = new TtlCache(500);
  const limiter = new RateLimiter(10, 60_000);
  const inflight = new Map();

  function send(res, status, body, extra = {}) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      ...extra,
    });
    res.end(JSON.stringify(body));
    return status;
  }

  // One upstream call per name, N waiters. Returns {status, body, ttl?};
  // an unexpected exception (the 500 path) propagates to the caller.
  function lookup(key, name) {
    const running = inflight.get(key);
    if (running) return running;
    const p = (async () => {
      const url = UPSTREAM_BASE + encodeURIComponent(name) + "/genre-activity";
      let upstream;
      let parsed;
      try {
        upstream = await fetchImpl(url, {
          headers: { "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        });
        if (upstream.status === 200) parsed = await upstream.json();
      } catch {
        // Network error, timeout, or a non-JSON 200 body.
        return { status: 502, body: { error: ERRORS.upstreamDown } };
      }
      if (upstream.status === 204)
        return { status: 200, body: { stamps: [], pending: true }, ttl: TTL_PENDING };
      if (upstream.status === 404)
        return { status: 404, body: { error: ERRORS.unknownUser }, ttl: TTL_NOT_FOUND };
      if (upstream.status !== 200) return { status: 502, body: { error: ERRORS.upstreamDown } };
      const rows = parsed?.payload?.genre_activity ?? [];
      const stamps = matchGenres(rows, nameIndex);
      return { status: 200, body: { stamps, pending: false }, ttl: TTL_SUCCESS };
    })();
    inflight.set(key, p);
    void p.catch(() => {}).then(() => inflight.delete(key));
    return p;
  }

  return async function handler(req, res) {
    const t0 = now();
    let cacheState = "skip";
    let status = 0;
    let name = "";
    try {
      const pathname = new URL(req.url ?? "/", "http://internal").pathname;
      if (pathname === "/healthz") {
        // Compose healthcheck; deliberately unlogged so it never spams.
        send(res, 200, { ok: true });
        return;
      }
      const match = /^\/api\/listenbrainz\/([^/]+)$/.exec(pathname);
      if (!match) {
        status = send(res, 404, { error: ERRORS.unknownPath });
        return;
      }
      const ip = String(req.headers["x-real-ip"] ?? req.socket?.remoteAddress ?? "unknown");
      if (!limiter.allow(ip, now())) {
        status = send(res, 429, { error: ERRORS.rateLimited }, { "Retry-After": "60" });
        return;
      }
      const checked = validateUsername(match[1]);
      if (!checked.ok) {
        status = send(res, 400, { error: ERRORS.badName });
        return;
      }
      name = checked.name;
      const key = name.toLowerCase();
      const cached = cache.get(key, now());
      if (cached) {
        cacheState = "hit";
        status = send(res, cached.status, cached.body);
        return;
      }
      cacheState = "miss";
      const result = await lookup(key, name);
      if (result.ttl) cache.set(key, { status: result.status, body: result.body }, result.ttl, now());
      status = send(res, result.status, result.body);
    } catch (err) {
      reportError(err, name);
      status = 500;
      if (!res.headersSent) send(res, 500, { error: ERRORS.broke });
      else res.end();
    } finally {
      if (status) log(`lb ${status} ${now() - t0}ms cache=${cacheState}`);
    }
  };
}
