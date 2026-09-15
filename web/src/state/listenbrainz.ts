// The "Fill from ListenBrainz" flow, DOM-free with injected fetch and
// passport ops so every status-to-message mapping is unit-testable.
// The typed name goes into one request URL and nowhere else: never into
// storage, never into the address bar.

export interface FillDeps {
  fetchImpl: typeof fetch;
  addStamps: (mbids: string[]) => number;
}

export interface FillResult {
  ok: boolean;
  added: number;
  message: string;
}

export const FILL_MESSAGES = {
  emptyName: "Type a ListenBrainz name first, or tap any genre to stamp it yourself.",
  busy: "Looking up your genres.",
  noAnswer: "ListenBrainz didn't answer. Try again in a moment.",
  pending:
    "ListenBrainz is still adding up your stats. Try again later, or tap any genre to stamp it yourself.",
  noMatches: "Your stats use tags this map skips. Tap any genre to stamp it yourself.",
  alreadyLit: "Your map already shows those genres.",
} as const;

export function litMessage(added: number): string {
  return added === 1
    ? "Lit 1 new genre from your travels."
    : `Lit ${added} new genres from your travels.`;
}

export async function fillFromListenBrainz(name: string, deps: FillDeps): Promise<FillResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, added: 0, message: FILL_MESSAGES.emptyName };

  let status: number;
  let body: unknown;
  try {
    const res = await deps.fetchImpl("/api/listenbrainz/" + encodeURIComponent(trimmed));
    status = res.status;
    body = await res.json();
  } catch {
    // Network failure or a non-JSON body (nginx 502 while the api restarts).
    return { ok: false, added: 0, message: FILL_MESSAGES.noAnswer };
  }

  const r = (body ?? {}) as Record<string, unknown>;
  if (status < 200 || status >= 300) {
    const message =
      typeof r.error === "string" && r.error ? r.error : FILL_MESSAGES.noAnswer;
    return { ok: false, added: 0, message };
  }
  if (r.pending === true) return { ok: false, added: 0, message: FILL_MESSAGES.pending };

  const stamps = Array.isArray(r.stamps) ? r.stamps : [];
  const mbids = stamps
    .map((s) => (s && typeof s === "object" ? (s as { mbid?: unknown }).mbid : undefined))
    .filter((m): m is string => typeof m === "string");
  if (mbids.length === 0) return { ok: true, added: 0, message: FILL_MESSAGES.noMatches };

  const added = deps.addStamps(mbids);
  if (added === 0) return { ok: true, added: 0, message: FILL_MESSAGES.alreadyLit };
  return { ok: true, added, message: litMessage(added) };
}
