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

const escapeHtmlAttr = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const getStatsForMeta = async (): Promise<GoiStats | null> => {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.data;
  if (cache) {
    refreshCache().catch((err) =>
      console.error("Background refresh for meta failed:", err),
    );
    return cache.data;
  }
  try {
    const entry = await refreshCache();
    return entry.data;
  } catch (err) {
    console.error("Failed to fetch stats for meta:", err);
    return null;
  }
};

const buildOgDescription = (stats: GoiStats): string => {
  const hiddenCount = (stats.categories ?? [])
    .filter((c) => c.type.toLowerCase().includes("hardware"))
    .reduce((s, c) => s + c.count, 0);
  const hiddenDevlogs = (stats.categories ?? [])
    .filter((c) => c.type.toLowerCase().includes("hardware"))
    .reduce((s, c) => s + c.pendingDevlogs, 0);
  const projects = Math.max(
    0,
    stats.queueCount - hiddenCount - (stats.brokenLinks ?? 0),
  );
  const devlogs = Math.max(
    0,
    stats.pendingDevlogs - hiddenDevlogs - (stats.brokenDevlogs ?? 0),
  );
  const projectWord = projects === 1 ? "project" : "projects";
  const devlogWord = devlogs === 1 ? "devlog" : "devlogs";
  return `${projects} ${projectWord} (${devlogs} ${devlogWord}) left to review! Oooo! Finally stats on the Guardians of Integrity team!`;
};

const serveIndexWithMeta = async (host: string | null): Promise<Response> => {
  const raw = await Bun.file(join(DIST, "index.html")).text();
  const stats = await getStatsForMeta();

  const isGotg = host?.split(":")[0] === "gotg.gizzy.gay";
  const siteUrl = isGotg ? "https://gotg.gizzy.gay" : "https://goi.gizzy.gay";
  const imageUrl = `${siteUrl}/oooo.jpg`;
  const description = stats
    ? buildOgDescription(stats)
    : "Oooo! Finally stats on the Guardians of Integrity team!";
  const escaped = escapeHtmlAttr(description);

  const withReplaced = (html: string, regex: RegExp, replacement: string) =>
    regex.test(html)
      ? html.replace(regex, replacement)
      : html.replace("</title>", `</title>\n    ${replacement}`);

  let html = raw;
  html = withReplaced(
    html,
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${escaped}" />`,
  );
  html = withReplaced(
    html,
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/,
    `<meta name="twitter:description" content="${escaped}" />`,
  );
  html = withReplaced(
    html,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${escaped}" />`,
  );
  // Keep url/image in sync for gotg vs goi hosts (mirrors App.tsx override).
  html = html
    .replace(
      /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:url" content="${siteUrl}" />`,
    )
    .replace(
      /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:image" content="${imageUrl}" />`,
    )
    .replace(
      /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/,
      `<meta name="twitter:image" content="${imageUrl}" />`,
    );

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
};

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
  .get("*", async ({ path, request }) => {
    const filePath = join(DIST, path === "/" ? "index.html" : path);
    const hasExtension = /\.[a-zA-Z0-9]+$/.test(path);
    if (hasExtension) {
      const file = Bun.file(filePath);
      if (await file.exists()) return file;
    } else if (path !== "/") {
      const file = Bun.file(filePath);
      if (await file.exists()) {
        const text = await file.text();
        if (!text.trimStart().startsWith("<")) return file;
      }
    }

    return serveIndexWithMeta(request.headers.get("host"));
  })
  .listen(process.env.PORT ?? 3001);

console.log(`Server running on http://localhost:${app.server?.port}`);
