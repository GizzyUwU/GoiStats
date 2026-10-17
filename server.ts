import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { join } from "node:path";
import type { GoiStats } from "./src/types.js";
import { goiStatsSchema } from "./src/schema.js";
import { db, recordLeaderboard, runMigrations } from "./src/db/index.js";
import { lbChanges, lbDays } from "./src/db/schema.js";
import { currentDayWindow } from "./src/db/day.js";

const STARDANCE_COOKIE = process.env.STARDANCE_COOKIE;
const HCES_BEARER_TOKEN = process.env.HCES_BEARER_TOKEN;
const HCES_URL = process.env.HCES_URL ?? "https://hces.gizzy.gay";

const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS ?? 60_000);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 60_000);

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
    cache = { data, fetchedAt: now, expiresAt: now + CACHE_TTL_MS };
    recordLeaderboard(data.reviewerLb).catch((err) =>
      console.error("Failed to record leaderboard snapshot:", err),
    );
    return cache;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

const DIST = join(import.meta.dir, "dist");

const SHART_TITLE = "S.H.A.R.T Stardance Hardware Awesome Review Team";
const SHART_SHORT = "ShartStats";
const SHART_FALLBACK_DESCRIPTION =
  "Oooo! Finally stats on the S.H.A.R.T Stardance Hardware Awesome Review Team! Stardance Hardware Awesome Review Team (S.H.A.R.T) hardware-only stats!";

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

const buildOgDescription = (stats: GoiStats, shart = false): string => {
  const cats = (stats.categories ?? []).filter(
    (c) => c.type.toLowerCase() !== "all types",
  );
  const isHidden = (type: string) =>
    shart
      ? !type.toLowerCase().includes("hardware")
      : type.toLowerCase().includes("hardware");
  const hiddenCount = cats
    .filter((c) => isHidden(c.type))
    .reduce((s, c) => s + c.count, 0);
  const hiddenDevlogs = cats
    .filter((c) => isHidden(c.type))
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
  const prefix = shart ? "S.H.A.R.T" : "GOI";
  return `${prefix} Stats yum! ${projects} ${projectWord} (${devlogs} ${devlogWord}) left to review!`;
};

const serveIndexWithMeta = async (host: string | null): Promise<Response> => {
  const raw = await Bun.file(join(DIST, "index.html")).text();
  const stats = await getStatsForMeta();

  const isGotg = host?.split(":")[0] === "gotg.gizzy.gay";
  const hostname = host?.split(":")[0];
  const isShart = hostname === "shart.gizzy.gay";
  const siteUrl = isGotg
    ? "https://gotg.gizzy.gay"
    : isShart
      ? "https://shart.gizzy.gay"
      : "https://goi.gizzy.gay";
  const imageUrl = `${siteUrl}/oooo.jpg`;
  const description = stats
    ? buildOgDescription(stats, isShart)
    : isShart
      ? SHART_FALLBACK_DESCRIPTION
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
  if (isShart) {
    const escapedTitle = escapeHtmlAttr(SHART_TITLE);
    const escapedShort = escapeHtmlAttr(SHART_SHORT);
    html = html.replace(
      /<title>[^<]*<\/title>/,
      `<title>${escapedTitle}</title>`,
    );
    html = html
      .replace(
        /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
        `<meta property="og:title" content="${escapedShort}" />`,
      )
      .replace(
        /<meta\s+property="og:site_name"\s+content="[^"]*"\s*\/?>/,
        `<meta property="og:site_name" content="${escapedShort}" />`,
      )
      .replace(
        /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/,
        `<meta name="twitter:title" content="${escapedShort}" />`,
      );
  }
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

try {
  await runMigrations();
  console.log("Database migrations up to date");
} catch (err) {
  console.error("Fatal: database migrations failed:", err);
  process.exit(1);
}

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
  .get("/api/lb/history", async ({ set }) => {
    if (!db) {
      set.status = 503;
      return { error: "DATABASE_URL is not configured" };
    }

    const days = await db.query.lbDays.findMany({
      with: { entries: true },
      orderBy: (d, { desc: desc }) => [desc(d.startsAt)],
      limit: 90,
    });

    return {
      days: days.map((d) => ({
        dayKey: d.dayKey,
        startsAt: d.startsAt.toISOString(),
        endsAt: d.endsAt.toISOString(),
        finalizedAt: d.finalizedAt?.toISOString() ?? null,
        entries: [...d.entries].sort((a, b) => a.rank - b.rank),
      })),
    };
  })
  .get("/api/lb/changes", async ({ query, set }) => {
    if (!db) {
      set.status = 503;
      return { error: "DATABASE_URL is not configured" };
    }

    let dayKey: string | null = query.day ?? null;

    if (dayKey) {
      const day = await db.query.lbDays.findFirst({
        where: eq(lbDays.dayKey, dayKey),
      });
      if (!day) {
        set.status = 404;
        return { error: `No leaderboard day recorded for ${dayKey}` };
      }
    } else {
      const current = await db.query.lbDays.findFirst({
        orderBy: (d, { desc: desc }) => [desc(d.startsAt)],
      });
      dayKey = current?.dayKey ?? null;
      if (!dayKey) return { dayKey: null, changes: [] };
    }

    const changes = await db
      .select()
      .from(lbChanges)
      .where(eq(lbChanges.dayKey, dayKey))
      .orderBy(lbChanges.capturedAt);

    return { dayKey, changes };
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

let lastDayKey = currentDayWindow().dayKey;

const poll = async (): Promise<void> => {
  const day = currentDayWindow();
  if (day.dayKey !== lastDayKey) {
    console.log(
      `[goistats] leaderboard day rolled over: ${lastDayKey} -> ${day.dayKey}`,
    );
    lastDayKey = day.dayKey;
    if (cache) cache.expiresAt = 0;
  }

  if (cache && cache.expiresAt > Date.now()) return;

  try {
    await refreshCache();
    console.log(`[goistats] recorded leaderboard snapshot (${lastDayKey})`);
  } catch (err) {
    console.error("[goistats] background refresh failed:", err);
  }
};

const pollTimer = setInterval(() => {
  poll().catch((err) => console.error("[goistats] poll failed:", err));
}, POLL_INTERVAL_MS);
pollTimer.unref();

poll().catch((err) => console.error("[goistats] initial poll failed:", err));
