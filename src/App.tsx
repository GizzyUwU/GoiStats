import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  type Component,
  type JSX,
  For,
  Show,
} from "solid-js";
import { Meta, Title } from "@solidjs/meta";
import { createQuery } from "@tanstack/solid-query";
import * as d3 from "d3";
import type { CategoryEntry, GoiStats, Graph, ReviewerEntry } from "./types";
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
  "#b4befe",
  "#f2cdcd",
  "#bac2de",
  "#a6adc8",
] as const;

const parseGraphDate = (str: string): Date | null => {
  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  const md = str.match(/^(\d{1,2})\/(\d{1,2})/);
  if (md) return new Date(new Date().getFullYear(), +md[1] - 1, +md[2]);
  const ts = Date.parse(str);
  if (!isNaN(ts)) return new Date(ts);
  return null;
};

const formatDayMonth = (d: Date): string =>
  `${d.getDate()}/${d.getMonth() + 1}`;
const ReviewChart: Component<{ graph: Graph }> = (props) => {
  const [hovered, setHovered] = createSignal<number | null>(null);
  const totals = (): { reviewer: string; reviews: number }[] => {
    const map = new Map<string, number>();
    for (const day of props.graph.dates) {
      for (const entry of day.reviewers) {
        map.set(entry.reviewer, (map.get(entry.reviewer) ?? 0) + entry.reviews);
      }
    }
    return [...map.entries()]
      .map(([reviewer, reviews]) => ({ reviewer, reviews }))
      .sort((a, b) => b.reviews - a.reviews);
  };

  const maxReviews = (): number =>
    Math.max(1, ...totals().map((r) => r.reviews));

  const dateRange = (): string => {
    if (props.graph.dates.length === 0) return "";
    const tryFormat = (s: string) => {
      const d = parseGraphDate(s);
      return d
        ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : s;
    };
    const f = tryFormat(props.graph.dates[0].date);
    const l = tryFormat(props.graph.dates[props.graph.dates.length - 1].date);
    return `${f} – ${l}`;
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
            <a
              href={"https://stardance.hackclub.com/@" + entry.reviewer}
              class="review-name"
            >
              {entry.reviewer}
            </a>
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

const CategoriesPieChart: Component<{ categories: CategoryEntry[] }> = (
  props,
) => {
  let containerRef!: HTMLDivElement;
  let svgRef!: SVGSVGElement;
  const [hovered, setHovered] = createSignal<{
    type: string;
    count: number;
    percent: number;
    x: number;
    y: number;
  } | null>(null);
  const [hidden, setHidden] = createSignal<Set<string>>(new Set());

  const filtered = createMemo(() => {
    const cats = props.categories.filter(
      (c) => c.type.toLowerCase() !== "all types",
    );
    const list = cats.length > 0 ? cats : props.categories;
    return [...list].sort((a, b) => b.count - a.count);
  });

  const visibleData = createMemo(() =>
    filtered().filter((c) => !hidden().has(c.type)),
  );
  const total = createMemo(() =>
    visibleData().reduce((s, c) => s + c.count, 0),
  );

  const colorScale = createMemo(() => {
    const cats = filtered();
    return d3
      .scaleOrdinal<string, string>()
      .domain(cats.map((c) => c.type))
      .range(PALETTE as unknown as string[]);
  });

  const toggle = (type: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const draw = () => {
    if (!containerRef || !svgRef) return;
    const data = visibleData();
    const width = containerRef.clientWidth || 400;
    const isMobile = width < 500;
    const height = isMobile ? 280 : 320;
    const radius = Math.min(width, height) * 0.38;
    const svg = d3.select(svgRef);
    svg.selectAll("*").remove();
    svg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", width)
      .attr("height", height);

    if (data.length === 0) {
      svg
        .append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "#a6adc8")
        .attr("font-size", "0.85rem")
        .text("No category data");
      return;
    }

    const g = svg
      .append("g")
      .attr("transform", `translate(${width / 2},${height / 2})`);

    const pie = d3
      .pie<CategoryEntry>()
      .value((d) => d.count)
      .sort(null)
      .padAngle(0.02);
    const arc = d3
      .arc<d3.PieArcDatum<CategoryEntry>>()
      .innerRadius(0)
      .outerRadius(radius);
    const arcHover = d3
      .arc<d3.PieArcDatum<CategoryEntry>>()
      .innerRadius(0)
      .outerRadius(radius + 8);
    const labelArc = d3
      .arc<d3.PieArcDatum<CategoryEntry>>()
      .innerRadius(radius * 0.62)
      .outerRadius(radius * 0.62);

    g.selectAll("path")
      .data(pie(data))
      .enter()
      .append("path")
      .attr("d", arc as any)
      .attr("fill", (d) => colorScale()(d.data.type))
      .attr("stroke", "#1e1e2e")
      .attr("stroke-width", 2)
      .style("cursor", "pointer")
      .style("transition", "opacity 0.15s, transform 0.15s")
      .on("mouseenter", function (event, d) {
        d3.select(this).attr("d", arcHover as any);
        const percent = total() ? (d.data.count / total()) * 100 : 0;
        const [mx, my] = d3.pointer(event, containerRef);
        setHovered({
          type: d.data.type,
          count: d.data.count,
          percent,
          x: mx,
          y: my,
        });
      })
      .on("mousemove", function (event, d) {
        const percent = total() ? (d.data.count / total()) * 100 : 0;
        const [mx, my] = d3.pointer(event, containerRef);
        setHovered({
          type: d.data.type,
          count: d.data.count,
          percent,
          x: mx,
          y: my,
        });
      })
      .on("mouseleave", function () {
        d3.select(this).attr("d", arc as any);
        setHovered(null);
      });

    g.selectAll("text.slice-label")
      .data(pie(data))
      .enter()
      .append("text")
      .attr("class", "slice-label")
      .attr("transform", (d) => `translate(${labelArc.centroid(d as any)})`)
      .attr("text-anchor", "middle")
      .attr("fill", "#1e1e2e")
      .attr("font-size", "0.68rem")
      .attr("font-weight", "700")
      .attr("pointer-events", "none")
      .text((d) => {
        const pct = total() ? (d.data.count / total()) * 100 : 0;
        return pct >= 5 ? `${pct.toFixed(0)}%` : "";
      })
      .style("text-shadow", "0 1px 2px rgba(255,255,255,0.6)");
  };

  onMount(() => {
    const ro = new ResizeObserver(() => draw());
    ro.observe(containerRef);
    onCleanup(() => ro.disconnect());
  });

  createEffect(() => {
    filtered();
    hidden();
    total();
    colorScale();
    draw();
  });

  return (
    <div class="categories-pie-wrap">
      <div
        class="pie-chart-container"
        ref={containerRef}
        style={{ position: "relative" }}
      >
        <svg ref={svgRef!} class="pie-svg" />
        <Show when={hovered()}>
          {(h) => (
            <div
              class="pie-tooltip"
              style={{
                left: `${h().x + 12}px`,
                top: `${h().y - 10}px`,
              }}
            >
              <div class="pie-tooltip-title">{h().type}</div>
              <div class="pie-tooltip-row">
                <span>Count</span>
                <strong>{h().count}</strong>
              </div>
              <div class="pie-tooltip-row">
                <span>Share</span>
                <strong>{h().percent.toFixed(1)}%</strong>
              </div>
            </div>
          )}
        </Show>
      </div>
      <div class="pie-legend">
        <For each={filtered()}>
          {(cat) => {
            const isHidden = () => hidden().has(cat.type);
            return (
              <button
                class="pie-legend-item"
                classList={{ "pie-legend-hidden": isHidden() }}
                onClick={() => toggle(cat.type)}
                type="button"
              >
                <span
                  class="dc-swatch"
                  style={{ background: colorScale()(cat.type) }}
                />
                <span class="pie-legend-label">{cat.type}</span>
                <span class="pie-legend-count">{cat.count}</span>
                <span class="pie-legend-pct">
                  {total()
                    ? (
                        (cat.count /
                          (props.categories
                            .filter((c) => c.type.toLowerCase() !== "all types")
                            .reduce((s, c) => s + c.count, 0) || 1)) *
                        100
                      ).toFixed(1)
                    : "0"}
                  %
                </span>
              </button>
            );
          }}
        </For>
      </div>
      <div class="pie-total">
        Total: {filtered().reduce((s, c) => s + c.count, 0)} projects (excl.
        "All types")
      </div>
    </div>
  );
};

const ReviewsByDateChart: Component<{ graph: Graph }> = (props) => {
  let containerRef!: HTMLDivElement;
  let svgRef!: SVGSVGElement;
  const [hidden, setHidden] = createSignal<Set<string>>(new Set());
  const [tooltip, setTooltip] = createSignal<{
    x: number;
    y: number;
    date: Date;
    values: { reviewer: string; value: number; color: string }[];
  } | null>(null);

  const reviewerOrder = createMemo((): string[] => {
    const totals = new Map<string, number>();
    for (const day of props.graph.dates) {
      for (const entry of day.reviewers) {
        totals.set(
          entry.reviewer,
          (totals.get(entry.reviewer) ?? 0) + entry.reviews,
        );
      }
    }
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  });

  const colorFor = (reviewer: string): string => {
    const idx = reviewerOrder().indexOf(reviewer);
    return idx === -1 ? "#585b70" : PALETTE[idx % PALETTE.length];
  };

  const legendTotals = createMemo(() => {
    const totals = new Map<string, number>();
    for (const day of props.graph.dates) {
      for (const entry of day.reviewers) {
        totals.set(
          entry.reviewer,
          (totals.get(entry.reviewer) ?? 0) + entry.reviews,
        );
      }
    }
    return totals;
  });

  const parsedDays = createMemo(() => {
    const map = new Map<number, { date: Date; map: Map<string, number> }>();
    for (const day of props.graph.dates) {
      const d = parseGraphDate(day.date);
      if (!d) continue;
      const key = d.getTime();
      const entry = map.get(key) ?? { date: d, map: new Map<string, number>() };
      for (const r of day.reviewers) {
        entry.map.set(r.reviewer, (entry.map.get(r.reviewer) ?? 0) + r.reviews);
      }
      map.set(key, entry);
    }

    const entries = [...map.values()].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
    if (entries.length === 0) return [];
    const start = new Date(entries[0].date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(entries[entries.length - 1].date);
    end.setHours(0, 0, 0, 0);
    const all: { date: Date; map: Map<string, number> }[] = [];
    const cursor = new Date(start);
    const lookup = new Map(entries.map((e) => [e.date.getTime(), e.map]));
    while (cursor <= end) {
      const key = new Date(cursor).setHours(0, 0, 0, 0);
      const m = lookup.get(key) ?? new Map<string, number>();
      all.push({ date: new Date(cursor), map: m });
      cursor.setDate(cursor.getDate() + 1);
    }
    return all;
  });

  const toggleReviewer = (name: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const draw = () => {
    if (!containerRef || !svgRef) return;
    const data = parsedDays();
    const width = containerRef.clientWidth || 600;
    const height = 320;
    const margin = { top: 16, right: 16, bottom: 28, left: 36 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef);
    svg.selectAll("*").remove();
    svg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", width)
      .attr("height", height);

    if (data.length === 0) {
      svg
        .append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "#a6adc8")
        .attr("font-size", "0.85rem")
        .text("No activity data yet");
      return;
    }

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleTime()
      .domain(d3.extent(data, (d) => d.date) as [Date, Date])
      .range([0, innerW]);

    const maxY =
      d3.max(data, (d) => {
        let m = 0;
        for (const [rev, val] of d.map)
          if (!hidden().has(rev)) m = Math.max(m, val);
        return m;
      }) ?? 0;

    const yDomainMax = Math.max(1, maxY);

    const y = d3
      .scaleLinear()
      .domain([0, yDomainMax * 1.1])
      .nice()
      .range([innerH, 0]);

    const tickValues: Date[] = [];
    {
      const end = new Date(data[data.length - 1].date);
      const start = new Date(data[0].date);
      end.setHours(0, 0, 0, 0);
      start.setHours(0, 0, 0, 0);
      for (let d = new Date(end); d >= start; d.setDate(d.getDate() - 2)) {
        tickValues.push(new Date(d));
      }
      tickValues.reverse();
    }

    const yTicks = y.ticks(5);
    g.append("g")
      .selectAll("line.grid")
      .data(yTicks)
      .enter()
      .append("line")
      .attr("x1", 0)
      .attr("x2", innerW)
      .attr("y1", (d) => y(d))
      .attr("y2", (d) => y(d))
      .attr("stroke", "rgba(88,91,112,0.18)")
      .attr("stroke-dasharray", "2,2");

    g.append("g")
      .selectAll("line.xgrid")
      .data(tickValues)
      .enter()
      .append("line")
      .attr("x1", (d) => x(d))
      .attr("x2", (d) => x(d))
      .attr("y1", 0)
      .attr("y2", innerH)
      .attr("stroke", "rgba(88,91,112,0.12)")
      .attr("stroke-dasharray", "2,2");

    const xAxis = d3
      .axisBottom<Date>(x)
      .tickValues(tickValues)
      .tickFormat((d) => formatDayMonth(d as Date))
      .tickSizeOuter(0);
    const yAxis = d3.axisLeft(y).ticks(5).tickSizeOuter(0);

    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(xAxis)
      .call((g) => g.select(".domain").attr("stroke", "rgba(88,91,112,0.5)"))
      .call((g) =>
        g.selectAll(".tick line").attr("stroke", "rgba(88,91,112,0.5)"),
      )
      .call((g) =>
        g
          .selectAll(".tick text")
          .attr("fill", "#7f849c")
          .attr("font-size", "0.68rem"),
      );

    g.append("g")
      .call(yAxis)
      .call((g) => g.select(".domain").attr("stroke", "rgba(88,91,112,0.5)"))
      .call((g) =>
        g.selectAll(".tick line").attr("stroke", "rgba(88,91,112,0.5)"),
      )
      .call((g) =>
        g
          .selectAll(".tick text")
          .attr("fill", "#7f849c")
          .attr("font-size", "0.68rem"),
      );

    const lineGen = d3
      .line<{ date: Date; value: number }>()
      .x((d) => x(d.date))
      .y((d) => y(d.value))
      .curve(d3.curveMonotoneX);

    for (const reviewer of reviewerOrder()) {
      if (hidden().has(reviewer)) continue;
      const series = data.map((d) => ({
        date: d.date,
        value: d.map.get(reviewer) ?? 0,
      }));
      g.append("path")
        .datum(series)
        .attr("fill", "none")
        .attr("stroke", colorFor(reviewer))
        .attr("stroke-width", 2)
        .attr("d", lineGen)
        .attr("opacity", 0.95);

      g.selectAll(`circle.dot-${reviewer.replace(/\W/g, "_")}`)
        .data(series)
        .enter()
        .append("circle")
        .attr("cx", (d) => x(d.date))
        .attr("cy", (d) => y(d.value))
        .attr("r", 2.8)
        .attr("fill", colorFor(reviewer))
        .attr("stroke", "#1e1e2e")
        .attr("stroke-width", 1)
        .attr("opacity", (d) => (d.value === 0 ? 0.25 : 0.95));
    }

    const overlay = g
      .append("rect")
      .attr("width", innerW)
      .attr("height", innerH)
      .attr("fill", "transparent")
      .style("cursor", "crosshair");

    const bisect = d3.bisector((d: (typeof data)[0]) => d.date).center;

    overlay
      .on("mousemove", (event: MouseEvent) => {
        const [mx, my] = d3.pointer(event);
        const xDate = x.invert(mx);
        const idx = bisect(data, xDate);
        const clamped = Math.max(0, Math.min(data.length - 1, idx));
        const d = data[clamped];
        const values = reviewerOrder()
          .filter((r) => !hidden().has(r))
          .map((r) => ({
            reviewer: r,
            value: d.map.get(r) ?? 0,
            color: colorFor(r),
          }))
          .filter((v) => v.value > 0)
          .sort((a, b) => b.value - a.value);

        const [px] = d3.pointer(event, containerRef);

        setTooltip({ x: px, y: my + margin.top, date: d.date, values });

        g.selectAll(".hover-line").remove();
        g.append("line")
          .attr("class", "hover-line")
          .attr("x1", x(d.date))
          .attr("x2", x(d.date))
          .attr("y1", 0)
          .attr("y2", innerH)
          .attr("stroke", "rgba(137,180,250,0.5)")
          .attr("stroke-dasharray", "4,4")
          .attr("pointer-events", "none");

        g.selectAll(".hover-dot").remove();
        for (const v of values) {
          g.append("circle")
            .attr("class", "hover-dot")
            .attr("cx", x(d.date))
            .attr("cy", y(v.value))
            .attr("r", 4)
            .attr("fill", v.color)
            .attr("stroke", "white")
            .attr("stroke-width", 1.2)
            .attr("pointer-events", "none");
        }
      })
      .on("mouseleave", () => {
        setTooltip(null);
        g.selectAll(".hover-line").remove();
        g.selectAll(".hover-dot").remove();
      });
  };

  onMount(() => {
    const ro = new ResizeObserver(() => draw());
    ro.observe(containerRef);
    onCleanup(() => ro.disconnect());
  });

  createEffect(() => {
    parsedDays();
    hidden();
    reviewerOrder();
    draw();
  });

  return (
    <div class="date-chart d3-date-chart">
      <Show when={parsedDays().length === 0}>
        <div class="chart-empty">No activity data yet</div>
      </Show>
      <div
        ref={containerRef}
        class="d3-chart-container"
        style={{ position: "relative", width: "100%" }}
      >
        <svg ref={svgRef!} class="d3-line-svg" />
        <Show when={tooltip()}>
          {(t) => (
            <div
              class="d3-tooltip"
              style={{
                left: `${Math.min(containerRef.clientWidth - 160, Math.max(8, t().x + 12))}px`,
                top: `${Math.min(280, t().y + 8)}px`,
              }}
            >
              <div class="d3-tooltip-date">
                {t().date.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </div>
              <For each={t().values}>
                {(v) => (
                  <div class="d3-tooltip-row">
                    <span class="dc-swatch" style={{ background: v.color }} />
                    <span>{v.reviewer}</span>
                    <strong>{v.value}</strong>
                  </div>
                )}
              </For>
              <Show when={t().values.length === 0}>
                <div
                  class="d3-tooltip-row"
                  style={{ color: "#a6adc8", "font-style": "italic" as any }}
                >
                  No reviews
                </div>
              </Show>
            </div>
          )}
        </Show>
      </div>
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
              <span class="dc-legend-total">
                {legendTotals().get(name) ?? 0}
              </span>
            </button>
          )}
        </For>
      </div>
    </div>
  );
};

type SortKey =
  | "devlogsLastThreeDays"
  | "projectsReviewedLastThreeDays"
  | "projectsReviewedToday"
  | "lockedInSoFarThisWeek"
  | "stardustEarnt";

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
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

const daysSince = (date: string): number => {
  const [y, m, d] = date.split("-").map(Number);
  const oldest = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round(
    (today.getTime() - oldest.getTime()) / (24 * 60 * 60 * 1000),
  );
};

const App = (): JSX.Element => {
  const [sortKey, setSortKey] = createSignal<SortKey>("stardustEarnt");
  const [sortDir, setSortDir] = createSignal<SortDirection>("desc");
  const [now, setNow] = createSignal(Date.now());
  const [isMobile, setIsMobile] = createSignal(false);
  const isGotg = (): boolean => window.location.hostname === "gotg.gizzy.gay";

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

  const reviewerLb = (): ReviewerEntry[] =>
    statsQuery.data?.data.reviewerLb ?? [];

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
      <Show when={isGotg()}>
        <>
          <Title>Guardians Of The Galaxy</Title>
          <Meta property="og:title" content="GOIStats" />
          <Meta
            property="og:description"
            content="Oooo! Finally stats on the Guardians of Integrity team!"
          />
          <Meta property="og:url" content="https://gotg.gizzy.gay" />
          <Meta property="og:image" content="https://gotg.gizzy.gay/oooo.jpg" />
          <Meta property="og:type" content="website" />
          <Meta property="og:site_name" content="GOIStats" />
          <Meta name="twitter:card" content="summary_large_image" />
          <Meta name="twitter:title" content="GOIStats" />
          <Meta
            name="twitter:description"
            content="Oooo! Finally stats on the Guardians of Integrity team!"
          />
          <Meta
            name="twitter:image"
            content="https://gotg.gizzy.gay/oooo.jpg"
          />
        </>
      </Show>
      <header>
        <h1>
          {isGotg() ? "Guardians Of The Galaxy" : "Guardians of Integrity"}
        </h1>
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
                <span class="stat-value">
                  {formatRounded(resp().data.queueCount)}
                </span>
              </div>
              <div class="stat-card">
                <span class="stat-label">Pending Devlogs</span>
                <span class="stat-value">
                  {formatRounded(resp().data.pendingDevlogs)}
                </span>
              </div>
              <div class="stat-card">
                <span class="stat-label">Pending Hours</span>
                <span class="stat-value">
                  {formatRounded(resp().data.pendingHours)}
                </span>
              </div>
              <div class="stat-card">
                <span class="stat-label">Oldest In Queue</span>
                <span class="stat-value">
                  {formatHumanDate(resp().data.oldestInQueue)}
                </span>
                <span class="stat-subtext">
                  {daysSince(resp().data.oldestInQueue)} days old
                </span>
              </div>
              <div class="stat-card">
                <span class="stat-label">Reviews Today</span>
                <span class="stat-value">
                  {resp().data.reviewerLb.reduce(
                    (sum, r) => sum + r.projectsReviewedToday,
                    0,
                  )}
                </span>
                <span class="stat-subtext">projects reviewed today</span>
              </div>
              <div class="stat-card">
                <span class="stat-label">Locked In</span>
                <span
                  class="stat-value"
                  style={{
                    color: resp().data.reviewerLb.some((r) => r.lockedInStatus)
                      ? "var(--yellow)"
                      : undefined,
                  }}
                >
                  {
                    resp().data.reviewerLb.filter((r) => r.lockedInStatus)
                      .length
                  }
                </span>
                <span class="stat-subtext">
                  {(() => {
                    const locked = resp().data.reviewerLb.filter(
                      (r) => r.lockedInStatus,
                    ).length;
                    const total = resp().data.reviewerLb.length;
                    return `${locked} of ${total} reviewers`;
                  })()}
                </span>
              </div>
            </div>
            <div class="tier-card">
              <div class="tier-card-head">
                <span class="stat-label">Stardust from pending devlogs</span>
                <span class="tier-subtext">
                  {resp().data.pendingDevlogs} pending devlogs
                </span>
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
                        <th
                          class="sortable"
                          onClick={() => toggleSort("devlogsLastThreeDays")}
                        >
                          Devlogs <span class="th-sub">(3 day)</span>
                          {sortIndicator("devlogsLastThreeDays")}
                        </th>
                        <th
                          class="sortable"
                          onClick={() =>
                            toggleSort("projectsReviewedLastThreeDays")
                          }
                        >
                          Reviews <span class="th-sub">(3 days)</span>
                          {sortIndicator("projectsReviewedLastThreeDays")}
                        </th>
                        <th
                          class="sortable"
                          onClick={() => toggleSort("projectsReviewedToday")}
                        >
                          Reviews Today{sortIndicator("projectsReviewedToday")}
                        </th>
                        <th
                          class="sortable"
                          onClick={() => toggleSort("lockedInSoFarThisWeek")}
                        >
                          Locked In{sortIndicator("lockedInSoFarThisWeek")}
                        </th>
                        <th
                          class="sortable"
                          onClick={() => toggleSort("stardustEarnt")}
                        >
                          Stardust{sortIndicator("stardustEarnt")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={sorted()}>
                        {(entry, i) => (
                          <tr class={entry.lockedInStatus ? "locked-row" : ""}>
                            <td>{i() + 1}</td>
                            <td class="reviewer-name">
                              <a
                                class="a-tag"
                                href={
                                  "https://stardance.hackclub.com/@" +
                                  entry.reviewer
                                }
                              >
                                {entry.reviewer}
                              </a>
                            </td>
                            <td>{entry.devlogsLastThreeDays}</td>
                            <td>{entry.projectsReviewedLastThreeDays}</td>
                            <td>{entry.projectsReviewedToday}</td>
                            <td>
                              <span
                                class={`lock-badge ${entry.lockedInStatus ? "locked" : ""}`}
                              >
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
                  <button
                    class={`lb-sort-btn ${sortKey() === "stardustEarnt" ? "active" : ""}`}
                    onClick={() => toggleSort("stardustEarnt")}
                  >
                    Stardust
                  </button>
                  <button
                    class={`lb-sort-btn ${sortKey() === "devlogsLastThreeDays" ? "active" : ""}`}
                    onClick={() => toggleSort("devlogsLastThreeDays")}
                  >
                    Devlogs
                  </button>
                  <button
                    class={`lb-sort-btn ${sortKey() === "projectsReviewedLastThreeDays" ? "active" : ""}`}
                    onClick={() => toggleSort("projectsReviewedLastThreeDays")}
                  >
                    Reviews
                  </button>
                  <button
                    class={`lb-sort-btn ${sortKey() === "lockedInSoFarThisWeek" ? "active" : ""}`}
                    onClick={() => toggleSort("lockedInSoFarThisWeek")}
                  >
                    Locked In
                  </button>
                </div>
                <div class="lb-cards">
                  <For each={sorted()}>
                    {(entry, i) => (
                      <div
                        class={`lb-card ${entry.lockedInStatus ? "lb-card-locked" : ""}`}
                      >
                        <div class="lb-card-head">
                          <span class="lb-card-rank">{i() + 1}</span>
                          <a
                            class="lb-card-name a-tag"
                            href={
                              "https://stardance.hackclub.com/@" +
                              entry.reviewer
                            }
                          >
                            {entry.reviewer}
                          </a>
                          <span class="lb-card-stardust">
                            {entry.stardustEarnt.toLocaleString()}
                            <img
                              class="lb-card-dust"
                              src="/stardust-18e809ef.avif"
                              alt=""
                            />
                          </span>
                        </div>
                        <div class="lb-card-stats">
                          <div class="lb-card-stat">
                            <span class="lb-card-stat-label">Devlogs</span>
                            <span class="lb-card-stat-val">
                              {entry.devlogsLastThreeDays}
                            </span>
                          </div>
                          <div class="lb-card-stat">
                            <span class="lb-card-stat-label">Reviews (3d)</span>
                            <span class="lb-card-stat-val">
                              {entry.projectsReviewedLastThreeDays}
                            </span>
                          </div>
                          <div class="lb-card-stat">
                            <span class="lb-card-stat-label">Today</span>
                            <span class="lb-card-stat-val">
                              {entry.projectsReviewedToday}
                            </span>
                          </div>
                          <div class="lb-card-stat">
                            <span class="lb-card-stat-label">Locked In</span>
                            <span
                              class={`lb-card-stat-val ${entry.lockedInStatus ? "locked" : ""}`}
                            >
                              {entry.lockedInSoFarThisWeek}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </section>

            <section class="chart-section">
              <h2>Categories</h2>
              <div class="categories-card">
                <CategoriesPieChart categories={resp().data.categories} />
              </div>
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
