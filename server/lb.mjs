// Pure, dependency-free logic for the ListenBrainz proxy. Everything here
// is deterministic given its inputs so tests never touch the network or
// the clock.

// Control characters (U+0000..U+001F, U+007F), slash, and backslash can
// never appear in a ListenBrainz name we forward upstream.
const REJECT_RE = /[\u0000-\u001f\u007f/\\]/;

export function validateUsername(raw) {
  if (typeof raw !== "string") return { ok: false };
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return { ok: false }; // malformed percent-encoding
  }
  const name = decoded.trim();
  if (name.length < 1 || name.length > 64) return { ok: false };
  if (REJECT_RE.test(name)) return { ok: false };
  return { ok: true, name };
}

// Lowercased-name index over the atlas, keeping the canonical casing.
export function buildNameIndex(atlas) {
  const index = new Map();
  for (const g of atlas.genres) {
    index.set(g.name.toLowerCase(), { mbid: g.mbid, name: g.name });
  }
  return index;
}

// Aggregate hourly listen counts per genre tag, join against the atlas by
// lowercased name, drop non-matches, sort by count desc then name asc,
// cap at 500. Malformed rows are skipped; a non-array input throws so the
// caller's unexpected-exception path handles it.
export function matchGenres(genreActivity, atlasNameIndex) {
  const counts = new Map();
  for (const row of genreActivity) {
    if (!row || typeof row !== "object") continue;
    const genre = typeof row.genre === "string" ? row.genre.toLowerCase() : "";
    if (!genre) continue;
    const n =
      typeof row.listen_count === "number" && Number.isFinite(row.listen_count)
        ? row.listen_count
        : 0;
    counts.set(genre, (counts.get(genre) ?? 0) + n);
  }
  const out = [];
  for (const [genre, listenCount] of counts) {
    const hit = atlasNameIndex.get(genre);
    if (hit) out.push({ mbid: hit.mbid, name: hit.name, listenCount });
  }
  out.sort(
    (a, b) => b.listenCount - a.listenCount || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
  return out.slice(0, 500);
}

// In-memory TTL cache with insertion-order eviction past maxEntries.
// Nothing here ever touches disk.
export class TtlCache {
  constructor(maxEntries) {
    this.maxEntries = maxEntries;
    this.map = new Map();
  }

  get(key, now) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expires <= now) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value, ttlMs, now) {
    this.map.delete(key);
    this.map.set(key, { value, expires: now + ttlMs });
    while (this.map.size > this.maxEntries) {
      this.map.delete(this.map.keys().next().value);
    }
  }
}

// Sliding-window rate limiter per key. Keys are client IPs, so the key
// space is swept when it grows to keep memory bounded.
export class RateLimiter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  allow(key, now) {
    const cutoff = now - this.windowMs;
    if (this.hits.size > 1000) this.sweep(cutoff);
    const fresh = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (fresh.length >= this.limit) {
      this.hits.set(key, fresh);
      return false;
    }
    fresh.push(now);
    this.hits.set(key, fresh);
    return true;
  }

  sweep(cutoff) {
    for (const [key, list] of this.hits) {
      if (!list.some((t) => t > cutoff)) this.hits.delete(key);
    }
  }
}

// Minimal hand-rolled Sentry store report, fire-and-forget. The username
// is scrubbed from the message so it never reaches the error tracker.
// A no-op when no DSN is configured. Never throws.
export function reportError(dsn, err, name = "", fetchImpl = fetch) {
  if (!dsn) return;
  try {
    const u = new URL(dsn);
    const key = u.username;
    const projectId = u.pathname.replace(/^\/+/, "");
    if (!key || !projectId) return;
    let message = `${err?.name ?? "Error"}: ${err?.message ?? "unknown"}`;
    if (name) message = message.split(name).join("[name]");
    const endpoint = `${u.protocol}//${u.host}/api/${projectId}/store/`;
    fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=world-map-of-music/1.0, sentry_key=${key}`,
      },
      body: JSON.stringify({ message }),
    }).catch(() => {});
  } catch {
    /* error reporting must never break the request path */
  }
}
