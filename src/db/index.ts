import { and, eq, isNull, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import type { ReviewerEntry } from "../types.js";
import * as schema from "./schema.js";
import { lbChanges, lbEntries, lbDays, type LbEntry } from "./schema.js";
import { currentDayWindow, forceNextDay } from "./day.js";

const DATABASE_URL = process.env.DATABASE_URL;

export const db = DATABASE_URL
  ? drizzle(new Pool({ connectionString: DATABASE_URL, max: 4 }), { schema })
  : null;

const MIGRATIONS_FOLDER = new URL("../../drizzle/", import.meta.url).pathname;

export const runMigrations = async (retries = 10): Promise<void> => {
  if (!db) {
    console.warn("[db] DATABASE_URL not set, skipping migrations");
    return;
  }

  for (let attempt = 1; ; attempt++) {
    try {
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
      return;
    } catch (err) {
      if (attempt >= retries) throw err;
      console.error(
        `[db] migration attempt ${attempt}/${retries} failed (folder: ${MIGRATIONS_FOLDER}), retrying in 3s:`,
        err,
      );
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
};

type EntryValues = {
  rank: number;
  devlogsLastThreeDays: number;
  lockedInStatus: boolean;
  lockedInSoFarThisWeek: number;
  projectsReviewedToday: number;
  projectsReviewedLastThreeDays: number;
  stardustEarnt: number;
};

const FIELD_KEYS = [
  "rank",
  "devlogsLastThreeDays",
  "lockedInStatus",
  "lockedInSoFarThisWeek",
  "projectsReviewedToday",
  "projectsReviewedLastThreeDays",
  "stardustEarnt",
] as const satisfies ReadonlyArray<keyof EntryValues>;

const toValues = (entry: ReviewerEntry, rank: number): EntryValues => ({
  rank,
  devlogsLastThreeDays: entry.devlogsLastThreeDays,
  lockedInStatus: entry.lockedInStatus,
  lockedInSoFarThisWeek: entry.lockedInSoFarThisWeek,
  projectsReviewedToday: entry.projectsReviewedToday,
  projectsReviewedLastThreeDays: entry.projectsReviewedLastThreeDays,
  stardustEarnt: entry.stardustEarnt,
});

const looksLikeUpstreamReset = (
  prior: LbEntry[],
  leaderboard: ReviewerEntry[],
): boolean => {
  if (prior.length === 0 || leaderboard.length === 0) return false;
  const hadProgress = prior.some((e) => e.projectsReviewedToday > 0);
  if (!hadProgress) return false;
  // Every reviewer on the board at exactly 0 "today" while the previous
  // snapshot had progress means the upstream rolled over its day already.
  return leaderboard.every((e) => e.projectsReviewedToday === 0);
};

// The upstream counters roll over within seconds of 4pm ET, so a rollover
// seen this close to a window boundary is a boundary race, not a real
// early/late reset.
const RESET_GRACE_MS = 30 * 60_000;

export const recordLeaderboard = async (
  leaderboard: ReviewerEntry[],
  now: Date = new Date(),
): Promise<void> => {
  if (!db) return;

  let day = currentDayWindow(now);

  const prior = await db
    .select()
    .from(lbEntries)
    .where(eq(lbEntries.dayKey, day.dayKey));

  let closedEarly = false;
  let closedKey: string | null = null;

  if (looksLikeUpstreamReset(prior, leaderboard)) {
    const untilEnd = day.endsAt.getTime() - now.getTime();
    const sinceStart = now.getTime() - day.startsAt.getTime();

    if (untilEnd > RESET_GRACE_MS && sinceStart <= RESET_GRACE_MS) {
      // The upstream rolled over right after this window opened, so the values
      // captured so far still belong to the previous cycle. The regular update
      // below replaces them with the fresh post-reset ones.
      console.log(
        `[db] upstream rolled over at the start of ${day.dayKey}; dropping stale counters`,
      );
    } else {
      // The upstream cycle closed away from the 4pm ET boundary: keep the
      // finished board under its own key, close the window and carry on in
      // the next one.
      closedEarly = true;
      closedKey = day.dayKey;
      day = forceNextDay(now);
      console.log(
        `[db] upstream rolled over early; closing ${closedKey} and moving to ${day.dayKey}`,
      );
    }
  }

  await db.transaction(async (tx) => {
    if (closedEarly && closedKey) {
      await tx
        .update(lbDays)
        .set({ finalizedAt: now })
        .where(and(eq(lbDays.dayKey, closedKey), isNull(lbDays.finalizedAt)));
    }

    await tx
      .insert(lbDays)
      .values({
        dayKey: day.dayKey,
        startsAt: day.startsAt,
        endsAt: day.endsAt,
      })
      .onConflictDoNothing({ target: lbDays.dayKey });

    await tx
      .update(lbDays)
      .set({ finalizedAt: now })
      .where(and(isNull(lbDays.finalizedAt), lte(lbDays.endsAt, now)));

    const existing = await tx
      .select()
      .from(lbEntries)
      .where(eq(lbEntries.dayKey, day.dayKey));
    const byReviewer = new Map(existing.map((row) => [row.reviewer, row]));

    for (const [i, entry] of leaderboard.entries()) {
      const values = toValues(entry, i + 1);
      const prev = byReviewer.get(entry.reviewer);

      if (!prev) {
        await tx.insert(lbEntries).values({
          dayKey: day.dayKey,
          reviewer: entry.reviewer,
          ...values,
          firstSeenAt: now,
          updatedAt: now,
          changeCount: 0,
        });
        await tx.insert(lbChanges).values({
          dayKey: day.dayKey,
          reviewer: entry.reviewer,
          ...values,
          changedKeys: [],
          capturedAt: now,
        });
        continue;
      }

      const changedKeys: string[] = FIELD_KEYS.filter(
        (key) => prev[key] !== values[key],
      );
      if (changedKeys.length === 0) continue;

      await tx
        .update(lbEntries)
        .set({ ...values, updatedAt: now, changeCount: prev.changeCount + 1 })
        .where(
          and(
            eq(lbEntries.dayKey, day.dayKey),
            eq(lbEntries.reviewer, entry.reviewer),
          ),
        );

      await tx.insert(lbChanges).values({
        dayKey: day.dayKey,
        reviewer: entry.reviewer,
        ...values,
        changedKeys,
        capturedAt: now,
      });
    }
  });
};
