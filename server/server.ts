import { Elysia } from "elysia";
import { eq, isNotNull } from "drizzle-orm";
import { join, resolve, sep } from "node:path";
import { realpath, stat } from "node:fs/promises";
import type { GoiStats } from "./types.js";
import { goiStatsSchema } from "./schema.js";
import { db, recordLeaderboard, runMigrations } from "./db/index.js";
import { lbChanges, lbDays } from "./db/schema.js";
import { currentDayWindow } from "./db/day.js";

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

class StardanceCookieError extends Error {
  readonly code: "stardance_cookie_expired" | "stardance_cookie_required";
  constructor(code: StardanceCookieError["code"]) {
    super(code);
    this.name = "StardanceCookieError";
    this.code = code;
  }
}

const sanitizeUpstreamBody = (body: string): string => {
  // Never leak the session cookie value into logs or API responses.
  const redacted =
    STARDANCE_COOKIE.length > 0
      ? body.split(STARDANCE_COOKIE).join("[REDACTED]")
      : body;
  return redacted.length > 200 ? `${redacted.slice(0, 200)}…` : redacted;
};

let stardanceCookieExpired = false;
let stardanceCookieExpiredAt: number | null = null;
let lastCookieFailureAt = 0;
const COOKIE_RETRY_MS = Number(process.env.COOKIE_RETRY_MS ?? 5 * 60_000);

const fetchGoiStats = async (): Promise<GoiStats> => {
  const res = await fetch(`${HCES_URL}/api/v1/stardance/goiStats`, {
    headers: {
      Authorization: `Bearer ${HCES_BEARER_TOKEN}`,
      "X-Stardance-Cookie": STARDANCE_COOKIE,
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    // HCES returns 401 { err: { status: 401, msg: "stardance_cookie_expired" } }
    // when the session cookie is expired/invalid, or "stardance_cookie_required".
    // Read the body once so a non-JSON 401 doesn't consume the stream twice.
    // Match robustly: any status, any shape — the codes are distinctive.
    const rawBody = await res.text().catch(() => "");
    const cookieCode = (
      rawBody.includes("stardance_cookie_expired")
        ? "stardance_cookie_expired"
        : rawBody.includes("stardance_cookie_required")
          ? "stardance_cookie_required"
          : null
    );
    if (cookieCode) {
      throw new StardanceCookieError(cookieCode);
    }
    throw new Error(
      `HCES API error ${res.status}: ${sanitizeUpstreamBody(rawBody)}`,
    );
  }

  const parsed = goiStatsSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error(`HCES API returned unexpected data shape: ${parsed.error.message}`);
  }

  return parsed.data;
};

const refreshCache = async (): Promise<CacheEntry> => {
  if (inflight) return inflight;

  inflight = (async () => {
    let data: GoiStats;
    try {
      data = await fetchGoiStats();
    } catch (err) {
      if (err instanceof StardanceCookieError) {
        stardanceCookieExpired = true;
        stardanceCookieExpiredAt ??= Date.now();
        lastCookieFailureAt = Date.now();
        throw err;
      }
      throw err;
    }
    const now = Date.now();
    cache = { data, fetchedAt: now, expiresAt: now + CACHE_TTL_MS };
    stardanceCookieExpired = false;
    stardanceCookieExpiredAt = null;
    recordLeaderboard(data.reviewerLb).catch((err) =>
      console.error("Failed to record leaderboard snapshot:", err),
    );
    return cache;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
};

const DIST = join(import.meta.dir, "../dist");
// Canonical (symlink-resolved) dist root, used for all containment checks.
const DIST_REAL = await realpath(DIST).catch(() => resolve(DIST));

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

const SERVER_NOTICE_STYLE =
  "max-width:900px;margin:1rem auto;padding:0.65rem 0.9rem;border-radius:10px;" +
  "font-family:system-ui,sans-serif;font-size:0.85rem;font-weight:600;text-align:center;";

// Plain-HTML notice inside #root so the state is visible on the page itself,
// not just via the JS-fetched API. The client removes it once it hydrates
// (see src/index.tsx) to avoid showing it twice.
const injectServerNotice = (
  html: string,
  text: string,
  kind: "expired" | "unavailable",
): string => {
  const style =
    kind === "expired"
      ? `${SERVER_NOTICE_STYLE}background:rgba(249,226,175,0.12);color:#f9e2af;border:1px solid rgba(249,226,175,0.35);`
      : `${SERVER_NOTICE_STYLE}background:rgba(243,139,168,0.1);color:#f38ba8;border:1px solid rgba(243,139,168,0.2);`;
  const banner =
    `<div id="server-notice" role="alert" style="${style}">${escapeHtmlAttr(text)}</div>`;
  const pattern = /<div\s+id="root"[^>]*>\s*<\/div>/;
  if (pattern.test(html)) return html.replace(pattern, `<div id="root">${banner}</div>`);
  return html.replace("</body>", `  ${banner}\n  </body>`);
};

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

  // Surface outage state in the HTML shell itself (visible without JS),
  // instead of only as JSON on /api/goistats for the client to render.
  if (stardanceCookieExpired) {
    html = injectServerNotice(
      html,
      "Stardance session expired — waiting for it to be fixed.",
      "expired",
    );
  } else if (!stats) {
    html = injectServerNotice(
      html,
      "Stats are temporarily unavailable — failed to fetch from upstream. Please try again shortly.",
      "unavailable",
    );
  }

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
};

/**
 * Maps a request path to a real file inside dist/, or null if it is not
 * safely servable. Rejects: bad encoding, null bytes, backslashes, empty or
 * dot-prefixed segments (covers `..`, dotfiles, `.env`), anything resolving
 * outside dist (lexically or via symlink), non-regular files, and index.html
 * (served separately with meta injection).
 */
const resolveDistFile = async (urlPath: string): Promise<string | null> => {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return null;

  const rel = decoded.replace(/^\/+/, "");
  if (rel === "" || rel === "index.html") return null;
  if (rel.split("/").some((seg) => seg === "" || seg.startsWith("."))) return null;

  const candidate = resolve(DIST_REAL, rel);
  if (!candidate.startsWith(DIST_REAL + sep)) return null;

  try {
    const real = await realpath(candidate); // follows symlinks
    if (!real.startsWith(DIST_REAL + sep)) return null;
    if (!(await stat(real)).isFile()) return null;
    return real;
  } catch {
    return null;
  }
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
        if (err instanceof StardanceCookieError) {
          console.error(
            `[goistats] stardance cookie expired (${err.code}), waiting for fix`,
          );
          if (!cache) {
            set.status = 503;
            return {
              error: "stardance_cookie_expired",
              cookieExpired: true,
              message:
                "Stardance session expired — waiting for it to be fixed.",
            };
          }
          // Fall through to stale-cache response below.
        } else {
          console.error("Failed to refresh goiStats:", err);
          if (!cache) {
            set.status = 500;
            return { error: "Failed to fetch stats from upstream" };
          }
        }
      }
    }

    if (!cache) {
      set.status = 500;
      return { error: "No cached stats available" };
    }

    if (stardanceCookieExpired) {
      return {
        data: cache.data,
        fetchedAt: new Date(cache.fetchedAt).toISOString(),
        nextRefresh: new Date(
          Math.max(Date.now() + COOKIE_RETRY_MS, lastCookieFailureAt + COOKIE_RETRY_MS),
        ).toISOString(),
        stale: true,
        cookieExpired: true,
      };
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
      where: isNotNull(lbDays.finalizedAt),
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
      const current =
        (await db.query.lbDays.findFirst({
          where: isNotNull(lbDays.finalizedAt),
          orderBy: (d, { desc: desc }) => [desc(d.startsAt)],
        })) ??
        (await db.query.lbDays.findFirst({
          orderBy: (d, { desc: desc }) => [desc(d.startsAt)],
        }));
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
    return { error: "Internal server error" };
  })
  .get("*", async ({ path, request }) => {
    const host = request.headers.get("host");
    const filePath = await resolveDistFile(path);
    if (!filePath) return serveIndexWithMeta(host);

    const file = Bun.file(filePath);
    if (filePath.startsWith(join(DIST_REAL, "assets") + sep)) {
      return new Response(file, {
        headers: { "Cache-Control": "public, max-age=31536000, immutable" },
      });
    }
    return file;
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

  // When the Stardance cookie is expired, wait for it to be fixed instead of
  // hammering upstream on every poll tick.
  if (
    stardanceCookieExpired &&
    Date.now() - lastCookieFailureAt < COOKIE_RETRY_MS
  ) {
    return;
  }

  try {
    await refreshCache();
    console.log(`[goistats] recorded leaderboard snapshot (${lastDayKey})`);
  } catch (err) {
    if (err instanceof StardanceCookieError) {
      console.error(
        `[goistats] background refresh paused: stardance cookie expired (${err.code}), waiting for fix`,
      );
      return;
    }
    console.error("[goistats] background refresh failed:", err);
  }
};

const pollTimer = setInterval(() => {
  poll().catch((err) => console.error("[goistats] poll failed:", err));
}, POLL_INTERVAL_MS);
pollTimer.unref();

poll().catch((err) => console.error("[goistats] initial poll failed:", err));