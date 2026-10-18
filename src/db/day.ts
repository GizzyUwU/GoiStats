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

const windowFromStart = (
  startYear: number,
  startMonth: number,
  startDay: number,
): DayWindow => {
  const end = new Date(Date.UTC(startYear, startMonth - 1, startDay + 1));
  return {
    dayKey: dayKeyOf(startYear, startMonth, startDay),
    startsAt: wallToInstant(startYear, startMonth, startDay, RESET_HOUR, RESET_MINUTE),
    endsAt: wallToInstant(
      end.getUTCFullYear(),
      end.getUTCMonth() + 1,
      end.getUTCDate(),
      RESET_HOUR,
      RESET_MINUTE,
    ),
  };
};

const naturalDayWindow = (now: Date): DayWindow => {
  const w = wallClock(now);

  const minutesIntoDay = w.hour * 60 + w.minute;
  const daysBack = minutesIntoDay < RESET_HOUR * 60 + RESET_MINUTE ? 1 : 0;

  const start = new Date(Date.UTC(w.year, w.month - 1, w.day - daysBack));
  return windowFromStart(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate());
};

let forcedDayKey: string | null = null;

export const forceNextDay = (now: Date = new Date()): DayWindow => {
  const base = naturalDayWindow(now);
  const nextStart = new Date(
    Date.UTC(
      base.startsAt.getUTCFullYear(),
      base.startsAt.getUTCMonth(),
      base.startsAt.getUTCDate() + 1,
    ),
  );
  const next = windowFromStart(
    nextStart.getUTCFullYear(),
    nextStart.getUTCMonth() + 1,
    nextStart.getUTCDate(),
  );
  forcedDayKey = next.dayKey;
  return next;
};

export const currentDayWindow = (now: Date = new Date()): DayWindow => {
  const natural = naturalDayWindow(now);
  if (!forcedDayKey) return natural;

  // Once the natural window catches up to (or passes) the forced day, drop the override.
  if (natural.dayKey >= forcedDayKey) {
    forcedDayKey = null;
    return natural;
  }

  const [y, m, d] = forcedDayKey.split("-").map(Number);
  return windowFromStart(y, m, d);
};
