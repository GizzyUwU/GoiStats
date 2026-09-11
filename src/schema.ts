import { z } from "zod";

export const reviewerEntrySchema = z.object({
  reviewer: z.string(),
  devlogsLastThreeDays: z.number(),
  lockedInStatus: z.boolean(),
  lockedInSoFarThisWeek: z.number(),
  projectsReviewedToday: z.number(),
  projectsReviewedLastThreeDays: z.number(),
  stardustEarnt: z.number(),
});

export const graphReviewerSchema = z.object({
  reviewer: z.string(),
  reviews: z.number(),
});

export const graphDateEntrySchema = z.object({
  date: z.string(),
  reviewers: z.array(graphReviewerSchema),
});

export const graphSchema = z.object({
  dates: z.array(graphDateEntrySchema),
});

export const personalStatsSchema = z.object({
  devlogsPerDayThisWeek: z.number(),
  projectsPerDayThisWeek: z.number(),
  numberNeededToTodaysGoal: z.number().nullable(),
  shareThisWeek: z.number(),
  rankThisWeek: z.object({ rank: z.number(), totalPpl: z.number() }),
  projectsToday: z.number(),
  bestDay: z.object({ devlogCount: z.number(), date: z.string() }),
  allTimeDevlogs: z.number(),
  devlogsTillMorePay: z.number().nullable(),
  currentPay: z.number(),
  certifiedHours: z.number(),
  diffPplProjectsReviewed: z.number(),
});

export const categoryEntrySchema = z.object({
  type: z.string(),
  count: z.number().min(0),
  pendingHours: z.number().min(0),
  pendingDevlogs: z.number().min(0),
  oldestInQueue: z.iso.date(),
});

export const goiStatsSchema = z.object({
  myUsername: z.string(),
  queueCount: z.number().min(0),
  pendingHours: z.number().min(0),
  pendingDevlogs: z.number().min(0),
  oldestInQueue: z.iso.date(),
  categories: z.array(categoryEntrySchema).optional().default([]),
  reviewerLb: z.array(reviewerEntrySchema),
  graph: graphSchema,
  personalStats: personalStatsSchema,
});

export type ReviewerEntry = z.infer<typeof reviewerEntrySchema>;
export type GraphReviewer = z.infer<typeof graphReviewerSchema>;
export type GraphDateEntry = z.infer<typeof graphDateEntrySchema>;
export type Graph = z.infer<typeof graphSchema>;
export type PersonalStats = z.infer<typeof personalStatsSchema>;
export type GoiStats = z.infer<typeof goiStatsSchema>;
export type CategoryEntry = z.infer<typeof categoryEntrySchema>;