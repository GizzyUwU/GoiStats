export type { ReviewerEntry, GraphReviewer, GraphDateEntry, Graph, PersonalStats, GoiStats, CategoryEntry } from "./schema.js";

export type LbHistoryEntry = {
  weekKey: string;
  reviewer: string;
  rank: number;
  devlogsLastThreeDays: number;
  lockedInStatus: boolean;
  lockedInSoFarThisWeek: number;
  projectsReviewedToday: number;
  projectsReviewedLastThreeDays: number;
  stardustEarnt: number;
  firstSeenAt: string;
  updatedAt: string;
  changeCount: number;
};

export type LbHistoryWeek = {
  weekKey: string;
  startsAt: string;
  endsAt: string;
  finalizedAt: string | null;
  entries: LbHistoryEntry[];
};

export type LbHistoryResponse = {
  weeks: LbHistoryWeek[];
};