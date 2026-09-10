import { Elysia } from "elysia";
import { join } from "node:path";
import type { GoiStats } from "./src/types.js";
import { goiStatsSchema } from "./src/schema.js";

const STARDANCE_COOKIE = process.env.STARDANCE_COOKIE;
const HCES_BEARER_TOKEN = process.env.HCES_BEARER_TOKEN;

if (!STARDANCE_COOKIE || !HCES_BEARER_TOKEN) {
  throw new Error("STARDANCE_COOKIE and HCES_BEARER_TOKEN environment variables are required");
}

type CacheEntry = {
  data: GoiStats;
  fetchedAt: number;
  expiresAt: number;
};

let cache: CacheEntry | null = null;
let inflight: Promise<CacheEntry> | null = null;

const fetchGoiStats = async (): Promise<GoiStats> => {
  const res = await fetch("https://hces.gizzy.gay/api/v1/stardance/goiStats", {
    headers: {
      Authorization: `Bearer ${HCES_BEARER_TOKEN}`,
      "X-Stardance-Cookie": STARDANCE_COOKIE,
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HCES API error ${res.status}: ${body}`);
  }

  const parsed = goiStatsSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error(`HCES API returned unexpected data shape: ${parsed.error.message}`);
  }

  return parsed.data;
}

const refreshCache = async (): Promise<CacheEntry> => {
  if (inflight) return inflight;

  inflight = (async () => {
    const data = await fetchGoiStats();
    const now = Date.now();
    cache = { data, fetchedAt: now, expiresAt: now + 5 * 60 * 1000 };
    return cache;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

const DIST = join(import.meta.dir, "dist");

const app = new Elysia()
  .get("/health", () => ({ ok: true }))
  .get("/api/goistats", async () => {
    const now = Date.now();

    if (!cache || cache.expiresAt <= now) {
      try {
        await refreshCache();
      } catch {
        if (!cache) throw new Error("No cached stats available");
      }
    }

    if (!cache) throw new Error("No cached stats available");

    return {
      data: cache.data,
      fetchedAt: new Date(cache.fetchedAt).toISOString(),
      nextRefresh: new Date(cache.expiresAt).toISOString(),
    };
  })
  .onError(({ code, error }) => {
    if (code === "INTERNAL_SERVER_ERROR") {
      console.error("Failed to fetch goiStats:", error);
      return { error: "Failed to fetch stats from upstream" };
    }
  })
  .get("*", async ({ path }) => {
    const filePath = join(DIST, path === "/" ? "index.html" : path);
    const file = Bun.file(filePath);
    if (await file.exists()) return file;

    return new Response(Bun.file(join(DIST, "index.html")), {
      headers: { "Content-Type": "text/html" },
    });
  })
  .listen(process.env.PORT ?? 3001);

console.log(`Server running on http://localhost:${app.server?.port}`);
