import { createMemo, createSignal, onCleanup, onMount, type Component, type JSX, For, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { ColorType, CrosshairMode, LineType, type IChartApi, type ISeriesApi, type LineData, type Time } from "lightweight-charts";
import { TimeChart } from "@dschz/solid-lightweight-charts";
import type { GoiStats, Graph, ReviewerEntry } from "./types";
import "./App.css";

const STARDUST_TIERS = [
  { min: 0, max: 900, label: "0–900", rate: 0.2 },
  { min: 900, max: 1500, label: "900–1500", rate: 0.3 },
  { min: 1500, max: 2100, label: "1500–2100", rate: 0.35 },
  { min: 2100, max: Infinity, label: "2100+", rate: 0.4 },
] as const;

const PALETTE = [
  "#89b4fa",
  "#f38ba8",
  "#a6e3a1",
  "#f9e2af",
  "#cba6f7",
  "#94e2d5",
  "#fab387",
  "#74c7ec",
  "#f5c2e7",
  "#eba0ac",
] as const;

const formatDateLabel = (date: string): string => {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const ReviewChart: Component<{ graph: Graph }> = (props) => {
  const [hovered, setHovered] = createSignal<number | null>(null);

  const totals = (): { reviewer: string; reviews: number }[] => {
    const map = new Map<string, number>();
    for (const day of props.graph.dates) {
      for (const entry of day.reviewers) {
        map.set(entry.reviewer, (map.get(entry.reviewer) ?? 0) + entry.reviews);
      }
    }
    return [...map.entries()].map(([reviewer, reviews]) => ({ reviewer, reviews })).sort((a, b) => b.reviews - a.reviews);
  };

  const maxReviews = (): number => Math.max(1, ...totals().map((r) => r.reviews));

  const dateRange = (): string => {
    if (props.graph.dates.length === 0) return "";
    const first = formatDateLabel(props.graph.dates[0].date);
    const last = formatDateLabel(props.graph.dates[props.graph.dates.length - 1].date);
    return `${first} – ${last}`;
  };

  return (
    <div class="review-chart">
      <div class="chart-subtitle">{dateRange()}</div>
      <For each={totals()}>
        {(entry, i) => (
          <div
            class="review-row"
            onMouseEnter={() => setHovered(i())}
            onMouseLeave={() => setHovered(null)}
          >
            <a href={"https://stardance.hackclub.com/@" + entry.reviewer} class="review-name">{entry.reviewer}</a>
            <div class="review-bar-track">
              <div
                class="review-bar"
                style={{ width: `${(entry.reviews / maxReviews()) * 100}%` }}
              />
            </div>
            <span class="review-count">{entry.reviews}</span>
            <Show when={hovered() === i()}>
              <div class="review-tooltip">
                <div class="tooltip-title">{entry.reviewer}</div>
                <div class="tooltip-row">
                  <span>Total devlog reviews</span>
                  <strong>{entry.reviews}</strong>
                </div>
                <div class="tooltip-row">
                  <span>Period</span>
                  <strong>{dateRange()}</strong>
                </div>
              </div>
            </Show>
          </div>
        )}
      </For>
    </div>
  );
};

const ReviewsByDateChart: Component<{ graph: Graph }> = (props) => {
  const seriesReviewers = new Map<ISeriesApi<"Line", Time>, string>();
  const chartRef: { current: IChartApi | null } = { current: null };
  let fitScheduled = false;
  const [hidden, setHidden] = createSignal(new Set<string>());

  const toggleReviewer = (name: string) => {
    const nowHidden = !hidden().has(name);
    setHidden((prev) => {
      const next = new Set(prev);
      if (nowHidden) next.add(name);
      else next.delete(name);
      return next;
    });
    for (const [series, reviewer] of seriesReviewers) {
      if (reviewer === name) series.applyOptions({ visible: !nowHidden });
    }
    scheduleFit();
  };

  const scheduleFit = () => {
    if (fitScheduled) return;
    fitScheduled = true;
    queueMicrotask(() => {
      fitScheduled = false;
      chartRef.current?.timeScale().fitContent();
    });
  };

  const dayNum = (t: Time): number => {
    const b = t as { year?: number; month?: number; day?: number };
    if (b.year && b.month && b.day) return b.year * 10000 + b.month * 100 + b.day;
    if (typeof t === "number") {
      const d = new Date(t * 1000);
      return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    }
    const s = String(t);
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return +iso[1] * 10000 + +iso[2] * 100 + +iso[3];
    const md = s.match(/^(\d{1,2})\/(\d{1,2})/);
    if (md) return new Date().getFullYear() * 10000 + +md[1] * 100 + +md[2];
    return 0;
  };

  const reviewerOrder = createMemo((): string[] => {
    const totals = new Map<string, number>();
    for (const day of props.graph.dates) {
      for (const entry of day.reviewers) {
        totals.set(entry.reviewer, (totals.get(entry.reviewer) ?? 0) + entry.reviews);
      }
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  });

  const colorFor = (reviewer: string): string => {
    const idx = reviewerOrder().indexOf(reviewer);
    return idx === -1 ? "#585b70" : PALETTE[idx % PALETTE.length];
  };

  const toTime = (date: string): Time => {
    const iso = date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return { year: +iso[1], month: +iso[2], day: +iso[3] } as Time;
    const md = date.match(/^(\d{1,2})\/(\d{1,2})/);
    if (md) return { year: new Date().getFullYear(), month: +md[1], day: +md[2] } as Time;
    const ts = Date.parse(date);
    if (!isNaN(ts)) return Math.round(ts / 1000) as Time;
    return date as Time;
  };

  const valuesByDay = new Map<number, Map<string, number>>();
  for (const day of props.graph.dates) {
    const key = dayNum(toTime(day.date));
    const map = valuesByDay.get(key) ?? new Map<string, number>();
    for (const r of day.reviewers) map.set(r.reviewer, (map.get(r.reviewer) ?? 0) + r.reviews);
    valuesByDay.set(key, map);
  }

  const allDays = createMemo((): Time[] => {
    let min: Time | null = null;
    let max: Time | null = null;
    for (const d of props.graph.dates) {
      const t = toTime(d.date);
      const n = dayNum(t);
      if (!min || n < dayNum(min)) min = t;
      if (!max || n > dayNum(max)) max = t;
    }
    if (!min || !max) return [];
    const startNum = dayNum(min);
    const endNum = dayNum(max);
    const start = new Date(Date.UTC(Math.floor(startNum / 10000), Math.floor(startNum / 100) % 100 - 1, startNum % 100));
    const end = new Date(Date.UTC(Math.floor(endNum / 10000), Math.floor(endNum / 100) % 100 - 1, endNum % 100));
    const days: Time[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      days.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1, day: cursor.getUTCDate() } as Time);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days;
  });

  const legendTotals = createMemo(() => {
    const totals = new Map<string, number>();
    for (const day of props.graph.dates) {
      for (const entry of day.reviewers) {
        totals.set(entry.reviewer, (totals.get(entry.reviewer) ?? 0) + entry.reviews);
      }
    }
    return totals;
  });

  const seriesData = (reviewer: string): LineData<Time>[] => {
    if (hidden().has(reviewer)) return [];
    return allDays().map((time) => ({
      time,
      value: valuesByDay.get(dayNum(time))?.get(reviewer) ?? 0,
    }));
  };

  const formatDayMonth = (time: Time): string => {
    const b = time as { year?: number; month?: number; day?: number };
    if (b.year && b.month && b.day) return `${b.day}/${b.month}`;
    if (typeof time === "number") {
      const d = new Date(time * 1000);
      return `${d.getDate()}/${d.getMonth() + 1}`;
    }
    if (typeof time === "string") {
      const iso = time.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (iso) return `${+iso[3]}/${+iso[2]}`;
      const md = time.match(/^(\d{1,2})\/(\d{1,2})/);
      if (md) return `${+md[1]}/${+md[2]}`;
    }
    if (Array.isArray(time)) return `${time[2]}/${time[1]}`;
    return String(time);
  };

  const formatTimeLabel = (time: Time): string => formatDayMonth(time);

  return (
    <div class="date-chart">
      <Show when={props.graph.dates.length === 0}>
        <div class="chart-empty">No activity data yet</div>
      </Show>
      <TimeChart
        onCreateChart={(chart) => {
          chartRef.current = chart;
          scheduleFit();
        }}
        autoSize
        class="dc-chart"
        style={{}}
        layout={{ background: { type: ColorType.Solid, color: "transparent" }, textColor: "#7f849c" }}
        grid={{
          vertLines: { color: "rgba(88, 91, 112, 0.18)" },
          horzLines: { color: "rgba(88, 91, 112, 0.18)" },
        }}
        rightPriceScale={{
          borderColor: "rgba(88, 91, 112, 0.5)",
          scaleMargins: { top: 0.08, bottom: 0.05 },
        }}
        timeScale={{
          borderColor: "rgba(88, 91, 112, 0.5)",
          shiftVisibleRangeOnNewBar: false,
          tickMarkFormatter: formatDayMonth,
          tickMarkMaxCharacterLength: 4,
        }}
        crosshair={{
          mode: CrosshairMode.Normal,
          vertLine: { color: "rgba(137, 180, 250, 0.5)", labelBackgroundColor: "#45475a" },
          horzLine: { color: "rgba(137, 180, 250, 0.5)", labelBackgroundColor: "#45475a" },
        }}
      >
        <For each={reviewerOrder()}>
          {(reviewer) => (
            <TimeChart.Series
              type="Line"
              data={seriesData(reviewer)}
              color={colorFor(reviewer)}
              lineWidth={2}
              lineType={LineType.Curved}
              priceScaleId="right"
              priceFormat={{ type: "price", precision: 0, minMove: 1 }}
              pointMarkersVisible
              pointMarkersRadius={3}
              lastValueVisible={false}
              onCreateSeries={(series) => seriesReviewers.set(series, reviewer)}
              onSetData={scheduleFit}
            />
          )}
        </For>
        <TimeChart.Tooltip offset={{ x: 12, y: 8 }} fixed>
          {({ time, seriesData: points }) => (
            <div class="lwc-tooltip">
              <div class="lwc-tooltip-date">{formatTimeLabel(time)}</div>
              {Array.from(points.entries())
                .filter(([, data]) => "value" in (data as object) && (data as LineData<Time>).value > 0)
                .map(([series, data]) => {
                  const reviewer = seriesReviewers.get(series as ISeriesApi<"Line", Time>);
                  const value = (data as LineData<Time>).value;
                  return (
                    <div class="lwc-tooltip-row">
                      <span class="dc-swatch" style={{ background: reviewer ? colorFor(reviewer) : undefined }} />
                      <span>{reviewer}</span>
                      <strong>{value}</strong>
                    </div>
                  );
                })}
            </div>
          )}
        </TimeChart.Tooltip>
      </TimeChart>
      <div class="dc-legend">
        <For each={reviewerOrder()}>
          {(name) => (
              <button
                class="dc-legend-item"
                classList={{ "dc-legend-hidden": hidden().has(name) }}
                onClick={() => toggleReviewer(name)}
                type="button"
              >
                <span class="dc-swatch" style={{ background: colorFor(name) }} />
                {name}
                <span class="dc-legend-total">{legendTotals().get(name) ?? 0}</span>
              </button>
          )}
        </For>
      </div>
    </div>
  );
};

type SortKey = "devlogsLastThreeDays" | "projectsReviewedLastThreeDays" | "projectsReviewedToday" | "lockedInSoFarThisWeek" | "stardustEarnt";

type SortDirection = "asc" | "desc";

type GoiStatsResponse = {
  data: GoiStats;
  fetchedAt: string;
  nextRefresh: string;
};

const fetchGoiStats = async (): Promise<GoiStatsResponse> => {
  const res = await fetch("/api/goistats");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as GoiStatsResponse;
};

const formatRounded = (n: number): string => Math.round(n).toString();

const formatHumanDate = (date: string): string => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const daysSince = (date: string): number => {
  const [y, m, d] = date.split("-").map(Number);
  const oldest = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - oldest.getTime()) / (24 * 60 * 60 * 1000));
};

const App = (): JSX.Element => {
  const [sortKey, setSortKey] = createSignal<SortKey>("stardustEarnt");
  const [sortDir, setSortDir] = createSignal<SortDirection>("desc");
  const [now, setNow] = createSignal(Date.now());
  const [isMobile, setIsMobile] = createSignal(false);

  onMount(() => {
    const check = () => setIsMobile(window.innerWidth < 600);
    check();
    window.addEventListener("resize", check);
    const interval = setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => {
      clearInterval(interval);
      window.removeEventListener("resize", check);
    });
  });

  const statsQuery = createQuery(() => ({
    queryKey: ["goistats"],
    queryFn: fetchGoiStats,
    refetchInterval: (query) => {
      const nextRefresh = query.state.data?.nextRefresh;
      if (!nextRefresh) return false;
      return Math.max(1000, new Date(nextRefresh).getTime() - Date.now());
    },
  }));

  const refreshInMs = (): number => {
    const nextRefresh = statsQuery.data?.nextRefresh;
    if (!nextRefresh) return 0;
    return Math.max(0, new Date(nextRefresh).getTime() - now());
  };

  const formatDuration = (ms: number): string => {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) return `${seconds}s`;
    if (seconds === 0) return `${minutes}m`;
    return `${minutes}m ${seconds}s`;
  };

  const reviewerLb = (): ReviewerEntry[] => statsQuery.data?.data.reviewerLb ?? [];

  const sorted = (): ReviewerEntry[] => {
    return [...reviewerLb()].sort((a, b) => {
      const dir = sortDir() === "desc" ? -1 : 1;
      return (a[sortKey()] - b[sortKey()]) * dir;
    });
  };

  const toggleSort = (key: SortKey): void => {
    if (sortKey() === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortIndicator = (key: SortKey): string => {
    if (sortKey() !== key) return "";
    return sortDir() === "desc" ? " \u25BC" : " \u25B2";
  };

  return (
    <div class="app">
      <header>
        <h1>Guardians of Integrity</h1>
        <Show when={statsQuery.data}>
          {(resp) => (
            <div class="header-meta">
              <span class="last-fetched">
                Updated {new Date(resp().fetchedAt).toLocaleTimeString()}
              </span>
              <span class="refresh-countdown">
                Refresh in {formatDuration(refreshInMs())}
              </span>
            </div>
          )}
        </Show>
      </header>

      <Show when={statsQuery.data}>
        {(resp) => (
          <>
          <div class="stat-cards">
            <div class="stat-card">
              <span class="stat-label">Pending Reviews</span>
              <span class="stat-value">{formatRounded(resp().data.queueCount)}</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">Pending Devlogs</span>
              <span class="stat-value">{formatRounded(resp().data.pendingDevlogs)}</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">Pending Hours</span>
              <span class="stat-value">{formatRounded(resp().data.pendingHours)}</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">Oldest In Queue</span>
              <span class="stat-value">{formatHumanDate(resp().data.oldestInQueue)}</span>
              <span class="stat-subtext">{daysSince(resp().data.oldestInQueue)} days old</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">Reviews Today</span>
              <span class="stat-value">{resp().data.reviewerLb.reduce((sum, r) => sum + r.projectsReviewedToday, 0)}</span>
              <span class="stat-subtext">projects reviewed today</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">Locked In</span>
              <span class="stat-value" style={{ color: resp().data.reviewerLb.some((r) => r.lockedInStatus) ? "var(--yellow)" : undefined }}>
                {resp().data.reviewerLb.filter((r) => r.lockedInStatus).length}
              </span>
              <span class="stat-subtext">
                {(() => {
                  const locked = resp().data.reviewerLb.filter((r) => r.lockedInStatus).length;
                  const total = resp().data.reviewerLb.length;
                  return `${locked} of ${total} reviewers`;
                })()}
              </span>
            </div>
          </div>
          <div class="tier-card">
            <div class="tier-card-head">
              <span class="stat-label">Stardust from pending devlogs</span>
              <span class="tier-subtext">{resp().data.pendingDevlogs} pending devlogs</span>
            </div>
            <div class="tier-list">
              <For each={STARDUST_TIERS}>
                {(tier) => (
                  <div class="tier-row">
                    <span class="tier-range">{tier.label}</span>
                    <span class="tier-rate">{tier.rate} / devlog</span>
                    <span class="tier-earn">
                      {Math.round(tier.rate * resp().data.pendingDevlogs)}
                    </span>
                  </div>
                )}
              </For>
            </div>
          </div>
          </>
        )}
      </Show>

      <Show when={statsQuery.isPending}>
        <div class="loading">Loading stats...</div>
      </Show>

      <Show when={!statsQuery.isPending && statsQuery.isError}>
        <div class="error">
          Error: {statsQuery.error?.message ?? "Failed to load stats"}
        </div>
      </Show>

      <Show when={statsQuery.data}>
        {(resp) => (
          <>
            <section class="leaderboard">
              <h2>
                Reviewer Leaderboard{" "}
                <span class="lb-subtitle">(past 3 days)</span>
              </h2>

              <Show when={!isMobile()}>
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Reviewer</th>
                        <th class="sortable" onClick={() => toggleSort("devlogsLastThreeDays")}>
                          Devlogs <span class="th-sub">(3 day)</span>{sortIndicator("devlogsLastThreeDays")}
                        </th>
                        <th class="sortable" onClick={() => toggleSort("projectsReviewedLastThreeDays")}>
                          Reviews <span class="th-sub">(3 days)</span>{sortIndicator("projectsReviewedLastThreeDays")}
                        </th>
                        <th class="sortable" onClick={() => toggleSort("projectsReviewedToday")}>
                          Reviews Today{sortIndicator("projectsReviewedToday")}
                        </th>
                        <th class="sortable" onClick={() => toggleSort("lockedInSoFarThisWeek")}>
                          Locked In{sortIndicator("lockedInSoFarThisWeek")}
                        </th>
                        <th class="sortable" onClick={() => toggleSort("stardustEarnt")}>
                          Stardust{sortIndicator("stardustEarnt")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={sorted()}>
                        {(entry, i) => (
                          <tr class={entry.lockedInStatus ? "locked-row" : ""}>
                            <td>{i() + 1}</td>
                            <td class="reviewer-name"><a class="a-tag" href={"https://stardance.hackclub.com/@" + entry.reviewer}>{entry.reviewer}</a></td>
                            <td>{entry.devlogsLastThreeDays}</td>
                            <td>{entry.projectsReviewedLastThreeDays}</td>
                            <td>{entry.projectsReviewedToday}</td>
                            <td>
                              <span class={`lock-badge ${entry.lockedInStatus ? "locked" : ""}`}>
                                {entry.lockedInSoFarThisWeek}
                              </span>
                            </td>
                            <td>{entry.stardustEarnt.toLocaleString()}</td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </Show>

              <Show when={isMobile()}>
                <div class="lb-sort-bar">
                  <span class="lb-sort-label">Sort by</span>
                  <button class={`lb-sort-btn ${sortKey() === "stardustEarnt" ? "active" : ""}`} onClick={() => toggleSort("stardustEarnt")}>Stardust</button>
                  <button class={`lb-sort-btn ${sortKey() === "devlogsLastThreeDays" ? "active" : ""}`} onClick={() => toggleSort("devlogsLastThreeDays")}>Devlogs</button>
                  <button class={`lb-sort-btn ${sortKey() === "projectsReviewedLastThreeDays" ? "active" : ""}`} onClick={() => toggleSort("projectsReviewedLastThreeDays")}>Reviews</button>
                  <button class={`lb-sort-btn ${sortKey() === "lockedInSoFarThisWeek" ? "active" : ""}`} onClick={() => toggleSort("lockedInSoFarThisWeek")}>Locked In</button>
                </div>
                <div class="lb-cards">
                  <For each={sorted()}>
                    {(entry, i) => (
                      <div class={`lb-card ${entry.lockedInStatus ? "lb-card-locked" : ""}`}>
                        <div class="lb-card-head">
                          <span class="lb-card-rank">{i() + 1}</span>
                          <a class="lb-card-name a-tag" href={"https://stardance.hackclub.com/@" + entry.reviewer}>{entry.reviewer}</a>
                          <span class="lb-card-stardust">{entry.stardustEarnt.toLocaleString()}<img class="lb-card-dust" src="/stardust-18e809ef.avif" alt="" /></span>
                        </div>
                        <div class="lb-card-stats">
                          <div class="lb-card-stat">
                            <span class="lb-card-stat-label">Devlogs</span>
                            <span class="lb-card-stat-val">{entry.devlogsLastThreeDays}</span>
                          </div>
                          <div class="lb-card-stat">
                            <span class="lb-card-stat-label">Reviews (3d)</span>
                            <span class="lb-card-stat-val">{entry.projectsReviewedLastThreeDays}</span>
                          </div>
                          <div class="lb-card-stat">
                            <span class="lb-card-stat-label">Today</span>
                            <span class="lb-card-stat-val">{entry.projectsReviewedToday}</span>
                          </div>
                          <div class="lb-card-stat">
                            <span class="lb-card-stat-label">Locked In</span>
                            <span class={`lb-card-stat-val ${entry.lockedInStatus ? "locked" : ""}`}>{entry.lockedInSoFarThisWeek}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </section>

            <section class="chart-section">
              <h2>Review Activity</h2>
              <ReviewChart graph={resp().data.graph} />
            </section>

            <section class="chart-section">
              <h2>Reviews by Date</h2>
              <ReviewsByDateChart graph={resp().data.graph} />
            </section>
          </>
        )}
      </Show>
    </div>
  );
};

export { App };
