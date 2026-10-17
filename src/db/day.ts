const TIME_ZONE = "America/New_York";
const RESET_HOUR = 16; // 4pm
const RESET_MINUTE = 0;

export type DayWindow = {
  dayKey: string;
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
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
};

const utcOffsetMinutes = (instant: Date): number => {
  const w = wallClock(instant);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  return Math.round((asUtc - instant.getTime()) / 60_000);
};

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

const dayKeyOf = (year: number, month: number, day: number): string =>
  `${year}-${pad(month)}-${pad(day)}`;

export const currentDayWindow = (now: Date = new Date()): DayWindow => {
  const w = wallClock(now);

  const minutesIntoDay = w.hour * 60 + w.minute;
  const daysBack = minutesIntoDay < RESET_HOUR * 60 + RESET_MINUTE ? 1 : 0;

  const start = new Date(Date.UTC(w.year, w.month - 1, w.day - daysBack));
  const startYear = start.getUTCFullYear();
  const startMonth = start.getUTCMonth() + 1;
  const startDay = start.getUTCDate();

  const end = new Date(Date.UTC(startYear, startMonth - 1, startDay + 1));
  const endYear = end.getUTCFullYear();
  const endMonth = end.getUTCMonth() + 1;
  const endDay = end.getUTCDate();

  return {
    dayKey: dayKeyOf(startYear, startMonth, startDay),
    startsAt: wallToInstant(startYear, startMonth, startDay, RESET_HOUR, RESET_MINUTE),
    endsAt: wallToInstant(endYear, endMonth, endDay, RESET_HOUR, RESET_MINUTE),
  };
};
