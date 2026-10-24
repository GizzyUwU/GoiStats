import { relations, sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const lbDays = pgTable(
  "lb_days",
  {
    dayKey: text("day_key").primaryKey(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  () => ({}),
);

export const lbEntries = pgTable(
  "lb_entries",
  {
    dayKey: text("day_key")
      .notNull()
      .references(() => lbDays.dayKey, { onDelete: "cascade", onUpdate: "cascade" }),
    reviewer: text("reviewer").notNull(),
    rank: integer("rank").notNull(),
    devlogsLastThreeDays: doublePrecision("devlogs_last_three_days").notNull(),
    lockedInStatus: boolean("locked_in_status").notNull(),
    lockedInSoFarThisWeek: doublePrecision(
      "locked_in_so_far_this_week",
    ).notNull(),
    projectsReviewedToday: doublePrecision("projects_reviewed_today").notNull(),
    projectsReviewedLastThreeDays: doublePrecision(
      "projects_reviewed_last_three_days",
    ).notNull(),
    stardustEarnt: doublePrecision("stardust_earnt").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    changeCount: integer("change_count").notNull().default(0),
  },
  (t) => [primaryKey({ name: "lb_entries_pkey", columns: [t.dayKey, t.reviewer] })],
);

export const lbChanges = pgTable(
  "lb_changes",
  {
    id: serial("id").primaryKey(),
    dayKey: text("day_key")
      .notNull()
      .references(() => lbDays.dayKey, { onDelete: "cascade", onUpdate: "cascade" }),
    reviewer: text("reviewer").notNull(),
    rank: integer("rank").notNull(),
    devlogsLastThreeDays: doublePrecision("devlogs_last_three_days").notNull(),
    lockedInStatus: boolean("locked_in_status").notNull(),
    lockedInSoFarThisWeek: doublePrecision(
      "locked_in_so_far_this_week",
    ).notNull(),
    projectsReviewedToday: doublePrecision("projects_reviewed_today").notNull(),
    projectsReviewedLastThreeDays: doublePrecision(
      "projects_reviewed_last_three_days",
    ).notNull(),
    stardustEarnt: doublePrecision("stardust_earnt").notNull(),
    changedKeys: text("changed_keys").array().notNull().default(sql`'{}'`),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("lb_changes_lookup_idx").on(t.dayKey, t.reviewer, t.capturedAt)],
);

export const lbDaysRelations = relations(lbDays, ({ many }) => ({
  entries: many(lbEntries),
  changes: many(lbChanges),
}));

export const lbEntriesRelations = relations(lbEntries, ({ one }) => ({
  day: one(lbDays, {
    fields: [lbEntries.dayKey],
    references: [lbDays.dayKey],
  }),
}));

export const lbChangesRelations = relations(lbChanges, ({ one }) => ({
  day: one(lbDays, {
    fields: [lbChanges.dayKey],
    references: [lbDays.dayKey],
  }),
}));

export type LbDay = typeof lbDays.$inferSelect;
export type LbEntry = typeof lbEntries.$inferSelect;
export type LbChange = typeof lbChanges.$inferSelect;
