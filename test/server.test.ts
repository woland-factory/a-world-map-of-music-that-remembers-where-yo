import { describe, it, expect } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import {
  validateUsername,
  matchGenres,
  buildNameIndex,
  TtlCache,
  RateLimiter,
  reportError,
} from "../server/lb.mjs";
import { createHandler } from "../server/app.mjs";

const atlas = {
  genres: [
    { id: 0, mbid: "m-jazz", name: "Jazz" },
    { id: 1, mbid: "m-ambient", name: "ambient" },
    { id: 2, mbid: "m-house", name: "house" },
  ],
};

describe("validateUsername", () => {
  it("accepts plain names and names with inner spaces", () => {
    expect(validateUsername("rob")).toEqual({ ok: true, name: "rob" });
    expect(validateUsername("a%20b")).toEqual({ ok: true, name: "a b" });
    expect(validateUsername("listen brainz fan")).toEqual({ ok: true, name: "listen brainz fan" });
  });

  it("rejects empty, whitespace-only, and overlong names", () => {
    expect(validateUsername("")).toEqual({ ok: false });
    expect(validateUsername("%20%20")).toEqual({ ok: false });
    expect(validateUsername("x".repeat(65))).toEqual({ ok: false });
  });

  it("rejects slashes, backslashes, and control characters", () => {
    expect(validateUsername("a%2Fb")).toEqual({ ok: false });
    expect(validateUsername("a%5Cb")).toEqual({ ok: false });
    expect(validateUsername("a%00b")).toEqual({ ok: false });
    expect(validateUsername("a%0Ab")).toEqual({ ok: false });
    expect(validateUsername("a%7Fb")).toEqual({ ok: false });
  });

  it("rejects malformed percent-encoding", () => {
    expect(validateUsername("%zz")).toEqual({ ok: false });
    expect(validateUsername("%e0%")).toEqual({ ok: false });
  });
});

describe("matchGenres", () => {
  const index = buildNameIndex(atlas);

  it("sums hourly rows, matches case-insensitively, drops unmatched, sorts desc", () => {
    const rows = [
      { genre: "jazz", hour: 0, listen_count: 10 },
      { genre: "JAZZ", hour: 1, listen_count: 5 },
      { genre: "ambient", hour: 3, listen_count: 40 },
      { genre: "vaporwave-nope", hour: 4, listen_count: 999 },
      { genre: 12, hour: 4, listen_count: 3 },
      null,
    ];
    expect(matchGenres(rows, index)).toEqual([
      { mbid: "m-ambient", name: "ambient", listenCount: 40 },
      { mbid: "m-jazz", name: "Jazz", listenCount: 15 },
    ]);
  });

  it("breaks count ties by name asc and caps at 500", () => {
    const rows = [
      { genre: "house", listen_count: 7 },
      { genre: "jazz", listen_count: 7 },
    ];
    expect(matchGenres(rows, index).map((s) => s.name)).toEqual(["Jazz", "house"]);

    const big = { genres: [] as { id: number; mbid: string; name: string }[] };
    const bigRows: { genre: string; listen_count: number }[] = [];
    for (let i = 0; i < 600; i++) {
      big.genres.push({ id: i, mbid: `m${i}`, name: `g${i}` });
      bigRows.push({ genre: `g${i}`, listen_count: i });
    }
    expect(matchGenres(bigRows, buildNameIndex(big))).toHaveLength(500);
  });
});

describe("TtlCache", () => {
  it("expires entries and evicts the oldest past maxEntries", () => {
    const cache = new TtlCache(2);
    cache.set("a", 1, 100, 0);
    expect(cache.get("a", 50)).toBe(1);
    expect(cache.get("a", 100)).toBeUndefined();
    cache.set("a", 1, 100, 0);
    cache.set("b", 2, 100, 0);
    cache.set("c", 3, 100, 0);
    expect(cache.get("a", 10)).toBeUndefined();
    expect(cache.get("b", 10)).toBe(2);
    expect(cache.get("c", 10)).toBe(3);
  });
});

describe("RateLimiter", () => {
  it("allows up to the limit per sliding window and recovers after it", () => {
    const rl = new RateLimiter(3, 1000);
    expect(rl.allow("ip", 0)).toBe(true);
    expect(rl.allow("ip", 10)).toBe(true);
    expect(rl.allow("ip", 20)).toBe(true);
    expect(rl.allow("ip", 30)).toBe(false);
    expect(rl.allow("other", 30)).toBe(true);
    expect(rl.allow("ip", 1011)).toBe(true); // first hit slid out of the window
  });
});

describe("reportError", () => {
  it("posts a scrubbed minimal payload to the DSN's store endpoint", () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve({ ok: true });
    };
    const err = new Error("boom for cooluser99 upstream");
    reportError("https://abc123@glitch.example.org/42", err, "cooluser99", fakeFetch as never);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://glitch.example.org/api/42/store/");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["X-Sentry-Auth"]).toContain("sentry_key=abc123");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.message).toBe("Error: boom for [name] upstream");
    expect(body.message).not.toContain("cooluser99");
  });

  it("is a no-op without a DSN and never throws on a bad one", () => {
    const calls: unknown[] = [];
    const fakeFetch = (...a: unknown[]) => {
      calls.push(a);
      return Promise.resolve({});
    };
    reportError("", new Error("x"), "n", fakeFetch as never);
    reportError("not a url", new Error("x"), "n", fakeFetch as never);
    reportError("https://no-project@host", new Error("x"), "n", fakeFetch as never);
    expect(calls).toHaveLength(0);
  });
});

// Integration: a real http server on port 0 with injected fetch/clock/log.
type FakeUpstream = (url: string) => Promise<{ status: number; json?: () => Promise<unknown> }>;

interface Harness {
  base: string;
  server: Server;
  logs: string[];
  upstreamCalls: string[];
  close: () => Promise<void>;
  reported: unknown[];
}

async function startHarness(upstream: FakeUpstream): Promise<Harness> {
  const logs: string[] = [];
  const upstreamCalls: string[] = [];
  const reported: unknown[] = [];
  const handler = createHandler({
    atlas,
    fetchImpl: ((url: string) => {
      upstreamCalls.push(String(url));
      return upstream(String(url));
    }) as never,
    now: Date.now,
    log: (line: string) => logs.push(line),
    reportError: (err: unknown) => reported.push(err),
  });
  const server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    base: `http://127.0.0.1:${port}`,
    server,
    logs,
    upstreamCalls,
    reported,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

const ok200 = (rows: unknown): FakeUpstream => () =>
  Promise.resolve({ status: 200, json: () => Promise.resolve({ payload: { genre_activity: rows } }) });

describe("handler integration", () => {
  it("serves /healthz without logging", async () => {
    const h = await startHarness(ok200([]));
    const res = await fetch(`${h.base}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.logs).toHaveLength(0);
    await h.close();
  });

  it("maps upstream 200 to matched, sorted stamps with the right headers", async () => {
    const h = await startHarness(
      ok200([
        { genre: "jazz", hour: 1, listen_count: 3 },
        { genre: "jazz", hour: 2, listen_count: 4 },
        { genre: "ambient", hour: 0, listen_count: 100 },
        { genre: "not-on-the-map", hour: 0, listen_count: 5000 },
      ]),
    );
    const res = await fetch(`${h.base}/api/listenbrainz/somebody`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      stamps: [
        { mbid: "m-ambient", name: "ambient", listenCount: 100 },
        { mbid: "m-jazz", name: "Jazz", listenCount: 7 },
      ],
      pending: false,
    });
    expect(h.upstreamCalls).toEqual([
      "https://api.listenbrainz.org/1/stats/user/somebody/genre-activity",
    ]);
    await h.close();
  });

  it("maps upstream 204 to 200 pending", async () => {
    const h = await startHarness(() => Promise.resolve({ status: 204 }));
    const res = await fetch(`${h.base}/api/listenbrainz/freshuser`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stamps: [], pending: true });
    await h.close();
  });

  it("maps upstream 404 to the product-voice 404", async () => {
    const h = await startHarness(() => Promise.resolve({ status: 404 }));
    const res = await fetch(`${h.base}/api/listenbrainz/nosuchperson`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error:
        "ListenBrainz can't find that name. Check the spelling, or tap any genre to stamp it yourself.",
    });
    await h.close();
  });

  it("maps network errors, timeouts, and upstream 5xx/429 to 502", async () => {
    for (const upstream of [
      () => Promise.reject(new Error("network down")),
      () => Promise.reject(Object.assign(new Error("timeout"), { name: "TimeoutError" })),
      () => Promise.resolve({ status: 503 }),
      () => Promise.resolve({ status: 429 }),
      () => Promise.resolve({ status: 200, json: () => Promise.reject(new Error("bad json")) }),
    ] as FakeUpstream[]) {
      const h = await startHarness(upstream);
      const res = await fetch(`${h.base}/api/listenbrainz/anyuser`);
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({
        error: "ListenBrainz didn't answer. Try again in a moment.",
      });
      await h.close();
    }
  });

  it("returns 400 for an invalid name with zero upstream calls", async () => {
    const h = await startHarness(ok200([]));
    for (const bad of ["a%2Fb", "a%5Cb", "%20%20", "%zz", "x".repeat(65)]) {
      const res = await fetch(`${h.base}/api/listenbrainz/${bad}`);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error:
          "That name has a character ListenBrainz skips. Check it, or tap any genre to stamp it yourself.",
      });
    }
    expect(h.upstreamCalls).toHaveLength(0);
    await h.close();
  });

  it("returns the JSON 404 for unknown /api paths", async () => {
    const h = await startHarness(ok200([]));
    for (const path of ["/api/other", "/api/listenbrainz/a/b", "/api/listenbrainz/"]) {
      const res = await fetch(`${h.base}${path}`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Check the address and try again." });
    }
    expect(h.upstreamCalls).toHaveLength(0);
    await h.close();
  });

  it("rate limits the 11th request in a window before any upstream call", async () => {
    const h = await startHarness(ok200([]));
    for (let i = 0; i < 10; i++) {
      const res = await fetch(`${h.base}/api/listenbrainz/user${i}`, {
        headers: { "X-Real-IP": "203.0.113.9" },
      });
      expect(res.status).toBe(200);
    }
    const callsBefore = h.upstreamCalls.length;
    const res = await fetch(`${h.base}/api/listenbrainz/user10`, {
      headers: { "X-Real-IP": "203.0.113.9" },
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(await res.json()).toEqual({
      error: "Lots of lookups right now. Wait a minute and try again.",
    });
    expect(h.upstreamCalls).toHaveLength(callsBefore);
    // A different client is unaffected.
    const other = await fetch(`${h.base}/api/listenbrainz/user11`, {
      headers: { "X-Real-IP": "203.0.113.10" },
    });
    expect(other.status).toBe(200);
    await h.close();
  });

  it("serves a repeat lookup from cache with one upstream call", async () => {
    const h = await startHarness(ok200([{ genre: "jazz", listen_count: 2 }]));
    const first = await fetch(`${h.base}/api/listenbrainz/CachedUser`);
    expect(first.status).toBe(200);
    const second = await fetch(`${h.base}/api/listenbrainz/cacheduser`);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
    expect(h.upstreamCalls).toHaveLength(1);
    expect(h.logs.some((l) => l.includes("cache=hit"))).toBe(true);
    await h.close();
  });

  it("returns the 500 body and reports the error on an unexpected exception", async () => {
    // A truthy, non-iterable genre_activity slips past the defensive read
    // and makes matchGenres throw: the unexpected-exception path.
    const h = await startHarness(() =>
      Promise.resolve({
        status: 200,
        json: () => Promise.resolve({ payload: { genre_activity: 42 } }),
      }),
    );
    const res = await fetch(`${h.base}/api/listenbrainz/brokenpayload`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "The lookup broke on our side. Try again in a moment.",
    });
    expect(h.reported).toHaveLength(1);
    await h.close();
  });

  it("never logs the username on any code path", async () => {
    const names = ["logprobe200", "logprobe204", "logprobe404", "logprobe502", "logprobe500"];
    const upstreams: FakeUpstream[] = [
      ok200([{ genre: "jazz", listen_count: 1 }]),
      () => Promise.resolve({ status: 204 }),
      () => Promise.resolve({ status: 404 }),
      () => Promise.reject(new Error("net")),
      () =>
        Promise.resolve({
          status: 200,
          json: () => Promise.resolve({ payload: { genre_activity: 7 } }),
        }),
    ];
    const allLogs: string[] = [];
    for (let i = 0; i < names.length; i++) {
      const h = await startHarness(upstreams[i]);
      await fetch(`${h.base}/api/listenbrainz/${names[i]}`);
      await fetch(`${h.base}/api/listenbrainz/${names[i]}`); // cache path too
      await fetch(`${h.base}/api/listenbrainz/log%2Fprobe`); // 400 path
      allLogs.push(...h.logs);
      await h.close();
    }
    const joined = allLogs.join("\n");
    for (const n of names) expect(joined).not.toContain(n);
    expect(joined).not.toContain("logprobe");
    expect(joined).not.toContain("probe");
    for (const line of allLogs) expect(line).toMatch(/^lb \d{3} \d+ms cache=(hit|miss|skip)$/);
  });
});
