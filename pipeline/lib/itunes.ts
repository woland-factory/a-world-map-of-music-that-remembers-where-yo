// Minimal iTunes Search client: serialized, single in-flight request,
// throttled to a polite ~20 req/min. No API key, no contact required.

const BASE = "https://itunes.apple.com/search";
const MIN_INTERVAL_MS = 3000; // <= ~20 req/min

let lastRequest = 0;
let requestCount = 0;
let chain: Promise<unknown> = Promise.resolve();

function userAgent(): string {
  return "WorldMapOfMusic/1.0 (a world map of music)";
}

export function requestsMade(): number {
  return requestCount;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = MIN_INTERVAL_MS - (now - lastRequest);
  if (wait > 0) await sleep(wait);
  lastRequest = Date.now();
}

async function getJson(term: string, retries = 5): Promise<any> {
  const url = `${BASE}?term=${encodeURIComponent(term)}&entity=song&limit=25`;
  for (let attempt = 0; ; attempt++) {
    await throttle();
    requestCount++;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": userAgent(), Accept: "application/json" },
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= retries) throw new Error(`iTunes ${res.status} after retries`);
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 3000 * (attempt + 1);
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`iTunes ${res.status} for "${term}"`);
      return await res.json();
    } catch (err) {
      if (attempt >= retries) throw err;
      await sleep(3000 * (attempt + 1));
    }
  }
}

export interface ItunesExemplar {
  trackTitle: string;
  artist: string;
  previewUrl: string;
  artworkUrl?: string;
}

// The first song result that carries a non-empty preview, or null when the
// genre has no previewable song. Requests are serialized so the throttle
// holds even when callers do not await in sequence.
export async function searchExemplar(genre: string): Promise<ItunesExemplar | null> {
  const run = chain.then(() => getJson(genre));
  chain = run.catch(() => undefined);
  const data = await run;
  const results: any[] = Array.isArray(data?.results) ? data.results : [];
  for (const r of results) {
    const previewUrl = typeof r?.previewUrl === "string" ? r.previewUrl.trim() : "";
    if (!previewUrl) continue;
    const exemplar: ItunesExemplar = {
      trackTitle: String(r.trackName ?? "").trim(),
      artist: String(r.artistName ?? "").trim(),
      previewUrl,
    };
    const artwork = typeof r?.artworkUrl100 === "string" ? r.artworkUrl100.trim() : "";
    if (artwork) exemplar.artworkUrl = artwork;
    if (exemplar.trackTitle && exemplar.artist) return exemplar;
  }
  return null;
}
