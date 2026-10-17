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

export const lbWeeks = pgTable(
  "lb_weeks",
  {
    weekKey: text("week_key").primaryKey(),
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
    weekKey: text("week_key")
      .notNull()
      .references(() => lbWeeks.weekKey, { onDelete: "cascade" }),
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
  (t) => [primaryKey({ name: "lb_entries_pkey", columns: [t.weekKey, t.reviewer] })],
);

export const lbChanges = pgTable(
  "lb_changes",
  {
    id: serial("id").primaryKey(),
    weekKey: text("week_key")
      .notNull()
      .references(() => lbWeeks.weekKey, { onDelete: "cascade" }),
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
  (t) => [index("lb_changes_lookup_idx").on(t.weekKey, t.reviewer, t.capturedAt)],
);

export const lbWeeksRelations = relations(lbWeeks, ({ many }) => ({
  entries: many(lbEntries),
  changes: many(lbChanges),
}));

export const lbEntriesRelations = relations(lbEntries, ({ one }) => ({
  week: one(lbWeeks, {
    fields: [lbEntries.weekKey],
    references: [lbWeeks.weekKey],
  }),
}));

export const lbChangesRelations = relations(lbChanges, ({ one }) => ({
  week: one(lbWeeks, {
    fields: [lbChanges.weekKey],
    references: [lbWeeks.weekKey],
  }),
}));

export type LbWeek = typeof lbWeeks.$inferSelect;
export type LbEntry = typeof lbEntries.$inferSelect;
export type LbChange = typeof lbChanges.$inferSelect;
