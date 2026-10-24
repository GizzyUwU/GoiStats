export type { ReviewerEntry, GraphReviewer, GraphDateEntry, Graph, PersonalStats, GoiStats, CategoryEntry } from "./schema.js";

export type LbHistoryEntry = {
  dayKey: string;
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

export type LbHistoryDay = {
  dayKey: string;
  startsAt: string;
  endsAt: string;
  finalizedAt: string | null;
  entries: LbHistoryEntry[];
};

export type LbHistoryResponse = {
  days: LbHistoryDay[];
};
