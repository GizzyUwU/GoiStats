const TIME_ZONE = "America/New_York";
const RESET_WEEKDAY = 3; // Wednesday (0 = Sunday)
const RESET_HOUR = 16; // 4pm
const RESET_MINUTE = 0;

export type WeekWindow = {
  weekKey: string;
  startsAt: Date;
  endsAt: Date;
};

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const wallClock = (instant: Date): WallClock => {
  const parts: Record<string, string> = {};
  for (const p of partsFormatter.formatToParts(instant)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Intl can render midnight as "24" with hour12: false.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
};

// Minutes the New York wall clock is ahead of UTC at a given instant.
const utcOffsetMinutes = (instant: Date): number => {
  const w = wallClock(instant);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  return Math.round((asUtc - instant.getTime()) / 60_000);
};

// Convert a New York wall-clock time into the real UTC instant it happened at.
// Two passes converge across DST transitions.
const wallToInstant = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date => {
  const wallUtc = Date.UTC(year, month - 1, day, hour, minute);
  let ts = wallUtc;
  for (let i = 0; i < 3; i++) {
    const next = wallUtc - utcOffsetMinutes(new Date(ts)) * 60_000;
    if (next === ts) break;
    ts = next;
  }
  return new Date(ts);
};

const pad = (n: number): string => String(n).padStart(2, "0");

const weekKeyOf = (year: number, month: number, day: number): string =>
  `${year}-${pad(month)}-${pad(day)}`;

// The leaderboard runs Wednesday 4pm EDT/New York time to the next Wednesday
// 4pm. Returns the window `now` falls into.
export const currentWeekWindow = (now: Date = new Date()): WeekWindow => {
  const w = wallClock(now);
  const weekday = new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();

  let daysBack = (weekday - RESET_WEEKDAY + 7) % 7;
  const minutesIntoDay = w.hour * 60 + w.minute;
  if (daysBack === 0 && minutesIntoDay < RESET_HOUR * 60 + RESET_MINUTE) {
    daysBack = 7; // still in the previous week (reset happens later today)
  }

  const start = new Date(Date.UTC(w.year, w.month - 1, w.day - daysBack));
  const startYear = start.getUTCFullYear();
  const startMonth = start.getUTCMonth() + 1;
  const startDay = start.getUTCDate();

  const end = new Date(Date.UTC(startYear, startMonth - 1, startDay + 7));
  const endYear = end.getUTCFullYear();
  const endMonth = end.getUTCMonth() + 1;
  const endDay = end.getUTCDate();

  return {
    weekKey: weekKeyOf(startYear, startMonth, startDay),
    startsAt: wallToInstant(startYear, startMonth, startDay, RESET_HOUR, RESET_MINUTE),
    endsAt: wallToInstant(endYear, endMonth, endDay, RESET_HOUR, RESET_MINUTE),
  };
};
