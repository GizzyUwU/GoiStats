import { Elysia } from "elysia";
import { join } from "node:path";
import type { GoiStats } from "./src/types.js";
import { goiStatsSchema } from "./src/schema.js";

const STARDANCE_COOKIE = process.env.STARDANCE_COOKIE;
const HCES_BEARER_TOKEN = process.env.HCES_BEARER_TOKEN;
const HCES_URL = process.env.HCES_URL ?? "https://hces.gizzy.gay";

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
  const res = await fetch(`${HCES_URL}/api/v1/stardance/goiStats`, {
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

  console.log(parsed)

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
  .get("/api/goistats", async ({ set }) => {
    const now = Date.now();

    if (!cache || cache.expiresAt <= now) {
      try {
        await refreshCache();
      } catch (err) {
        console.error("Failed to refresh goiStats:", err);
        if (!cache) {
          set.status = 500;
          return { error: "Failed to fetch stats from upstream", details: err instanceof Error ? err.message : String(err) };
        }
      }
    }

    if (!cache) {
      set.status = 500;
      return { error: "No cached stats available" };
    }

    return {
      data: cache.data,
      fetchedAt: new Date(cache.fetchedAt).toISOString(),
      nextRefresh: new Date(cache.expiresAt).toISOString(),
    };
  })
  .onError(({ code, error, set }) => {
    console.error(`[goistats] ${code}:`, error);
    set.status = 500;
    return { error: "Internal server error", details: error instanceof Error ? error.message : String(error) };
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
