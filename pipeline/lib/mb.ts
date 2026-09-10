// Minimal MusicBrainz WS/2 client: serialized, rate-limited to <=1 req/s,
// with a descriptive User-Agent built from an env contact.

const BASE = "https://musicbrainz.org/ws/2";
const MIN_INTERVAL_MS = 1500; // stay comfortably under 1 req/s

let lastRequest = 0;
let requestCount = 0;

function contact(): string {
  const c = process.env.MUSICBRAINZ_CONTACT?.trim();
  if (!c) {
    throw new Error(
      "MUSICBRAINZ_CONTACT is not set. MusicBrainz requires a contact in the " +
        "User-Agent. Set MUSICBRAINZ_CONTACT (an email or project URL) in .env " +
        "before running the fetch stages.",
    );
  }
  return c;
}

function userAgent(): string {
  return `WorldMapOfMusic/1.0 (${contact()})`;
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

async function getJson(path: string, retries = 5): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    await throttle();
    requestCount++;
    try {
      const res = await fetch(`${BASE}${path}`, {
        headers: { "User-Agent": userAgent(), Accept: "application/json" },
      });
      if (res.status === 503 || res.status === 429) {
        // Rate limited or busy: honor Retry-After, then back off and retry.
        if (attempt >= retries) throw new Error(`MusicBrainz ${res.status} after retries`);
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 3000 * (attempt + 1);
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`MusicBrainz ${res.status} for ${path}`);
      return await res.json();
    } catch (err) {
      if (attempt >= retries) throw err;
      await sleep(3000 * (attempt + 1));
    }
  }
}

export async function fetchGenrePage(offset: number): Promise<{ count: number; genres: { id: string; name: string }[] }> {
  const data = await getJson(`/genre/all?fmt=json&limit=100&offset=${offset}`);
  return { count: data["genre-count"] ?? 0, genres: data.genres ?? [] };
}

// Artists tagged with a genre, including their inline tag lists.
export async function fetchArtistsByTag(genre: string): Promise<{ tags: { name: string; count?: number }[] }[]> {
  const q = encodeURIComponent(`tag:"${genre}"`);
  const data = await getJson(`/artist?query=${q}&fmt=json&limit=100`);
  return (data.artists ?? []).map((a: any) => ({ tags: a.tags ?? [] }));
}

// Genre-genre relationships for a genre entity (best-effort boost).
export async function fetchGenreRelations(mbid: string): Promise<string[]> {
  const data = await getJson(`/genre/${mbid}?inc=genre-rels&fmt=json`);
  const rels = data.relations ?? [];
  const names: string[] = [];
  for (const r of rels) {
    const g = r.genre;
    if (g?.name) names.push(String(g.name).toLowerCase());
  }
  return names;
}
