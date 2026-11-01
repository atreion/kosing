/** The report's charts, each a pure function from part of the model to an SVG string. */

import {
  fixed,
  formatMillions,
  formatMillionsTick,
  formatPercent,
  formatPerShare,
} from "./format.ts";
import type { HistoryPoint, ReportModel, ValueComposition } from "./model.ts";
import {
  columnPath,
  line,
  linearScale,
  niceTicks,
  polyline,
  type Scale,
  svg,
  text,
  tooltip,
} from "./svg.ts";

const WIDTH = 720;

function definedNumbers(values: readonly (number | null)[]): readonly number[] {
  return values.filter((v): v is number => v !== null && Number.isFinite(v));
}

/** Two vertical markers whose labels sit on their outer sides so they never overlap. */
function markerLabels(
  left: { readonly x: number; readonly label: string; readonly cls: string },
  right: { readonly x: number; readonly label: string; readonly cls: string },
  y: number,
): string {
  return (
    text(left.x - 4, y, left.label, { anchor: "end", cls: left.cls }) +
    text(right.x + 4, y, right.label, { anchor: "start", cls: right.cls })
  );
}

/** Bear to bull against the price, the entry price and the 52-week range, on one per-share axis. */
export function valueRangeChart(model: ReportModel): string {
  const values = model.values;
  if (values === null) return "";
  const entry = model.hurdle?.entryPrice ?? null;
  const all = definedNumbers([
    values.bear,
    values.base,
    values.bull,
    entry,
    model.price,
    model.week52.low,
    model.week52.high,
  ]);
  const ticks = niceTicks(Math.min(...all) * 0.95, Math.max(...all) * 1.03, 6);
  const left = 100;
  const right = WIDTH - 20;
  const x = linearScale([ticks[0] ?? 0, ticks[ticks.length - 1] ?? 1], [left, right]);
  const top = 34;
  const bandY = 70;
  const rangeY = 128;
  const axisY = 152;
  const money = (v: number) => formatPerShare(model.currency, v);

  const grid = ticks
    .map(
      (t) =>
        line(x(t), top, x(t), axisY, "grid") +
        text(x(t), axisY + 16, t.toLocaleString("en-US"), { anchor: "middle" }),
    )
    .join("");

  const lo = values.bear ?? values.base;
  const hi = values.bull ?? values.base;
  const band =
    `<rect x="${x(lo).toFixed(1)}" y="${bandY - 8}" width="${(x(hi) - x(lo)).toFixed(1)}" height="16" rx="4" class="band"/>` +
    text(left - 12, bandY + 4, "Bear to bull", { anchor: "end", cls: "row-label" });

  const scenarioDots = (
    [
      ["Bear", values.bear, 5],
      ["Base", values.base, 7],
      ["Bull", values.bull, 5],
    ] as const
  )
    .flatMap(([name, v, r]) =>
      v === null
        ? []
        : [
            `<g class="hit"><circle cx="${x(v).toFixed(1)}" cy="${bandY}" r="${r}" class="dot"/>${tooltip(`${name} ${money(v)}`)}</g>` +
              text(x(v), bandY + 30, name, { anchor: "middle", cls: "dot-label" }) +
              text(x(v), bandY + 44, fixed(v, 0), { anchor: "middle", cls: "dot-value" }),
          ],
    )
    .join("");

  const range =
    model.week52.low !== null && model.week52.high !== null
      ? line(x(model.week52.low), rangeY, x(model.week52.high), rangeY, "range") +
        line(x(model.week52.low), rangeY - 5, x(model.week52.low), rangeY + 5, "range") +
        line(x(model.week52.high), rangeY - 5, x(model.week52.high), rangeY + 5, "range") +
        text(left - 12, rangeY + 4, "52 weeks", { anchor: "end", cls: "row-label" }) +
        `<rect x="${x(model.week52.low)}" y="${rangeY - 8}" width="${x(model.week52.high) - x(model.week52.low)}" height="16" fill="transparent">${tooltip(`52-week range ${money(model.week52.low)} to ${money(model.week52.high)}`)}</rect>`
      : "";

  const priceMarker = {
    x: x(model.price),
    label: `Price ${fixed(model.price, 2)}`,
    cls: "marker-label",
  };
  const markers =
    line(priceMarker.x, top - 6, priceMarker.x, axisY, "price-line") +
    (entry === null
      ? text(priceMarker.x, top - 12, priceMarker.label, { anchor: "middle", cls: "marker-label" })
      : line(x(entry), top - 6, x(entry), axisY, "entry-line") +
        (entry <= model.price
          ? markerLabels(
              { x: x(entry), label: `Entry ${fixed(entry, 2)}`, cls: "marker-label" },
              priceMarker,
              top - 10,
            )
          : markerLabels(
              priceMarker,
              { x: x(entry), label: `Entry ${fixed(entry, 2)}`, cls: "marker-label" },
              top - 10,
            )));

  return svg(
    WIDTH,
    axisY + 26,
    "Value range per share",
    grid + line(left, axisY, right, axisY, "axis") + band + range + markers + scenarioDots,
  );
}

type Band = { readonly x: (i: number) => number; readonly width: number };

function bandScale(count: number, left: number, right: number): Band {
  const step = (right - left) / Math.max(1, count);
  return { x: (i) => left + step * i + step / 2, width: step };
}

function xLabels(points: readonly HistoryPoint[], band: Band, y: number): string {
  return points.map((p, i) => text(band.x(i), y, p.label, { anchor: "middle" })).join("");
}

function yGrid(
  ticks: readonly number[],
  y: Scale,
  left: number,
  right: number,
  format: (v: number) => string,
): string {
  return ticks
    .map(
      (t) =>
        line(left, y(t), right, y(t), t === 0 ? "axis" : "grid") +
        text(left - 8, y(t) + 4, format(t), { anchor: "end" }),
    )
    .join("");
}

const PLOT = { left: 56, right: WIDTH - 12, top: 14 } as const;

/** Reported revenue and the case's projection as columns on one axis. */
export function revenueChart(model: ReportModel): string {
  const points = model.history;
  if (points.length === 0) return "";
  const height = 220;
  const bottom = height - 28;
  const ticks = niceTicks(0, Math.max(...points.map((p) => p.revenue)), 4);
  const y = linearScale([0, ticks[ticks.length - 1] ?? 1], [bottom, PLOT.top]);
  const band = bandScale(points.length, PLOT.left, PLOT.right);
  const barWidth = Math.min(24, band.width * 0.6);
  const columns = points
    .map((p, i) => {
      const x0 = band.x(i) - barWidth / 2;
      const tip = `${p.label}: ${formatMillions(model.currency, p.revenue)}${p.growth === null ? "" : `, ${p.growth >= 0 ? "+" : ""}${formatPercent(p.growth)}`}`;
      return `<g class="hit"><rect x="${band.x(i) - band.width / 2}" y="${PLOT.top}" width="${band.width}" height="${bottom - PLOT.top}" fill="transparent"/><path d="${columnPath(x0, barWidth, bottom, y(p.revenue))}" class="${p.kind === "case" ? "col-case" : "col-reported"}"/>${tooltip(tip)}</g>`;
    })
    .join("");
  return svg(
    WIDTH,
    height,
    "Revenue, reported and case",
    yGrid(ticks, y, PLOT.left, PLOT.right, formatMillionsTick) +
      columns +
      xLabels(points, band, bottom + 18),
  );
}

type Reference = { readonly value: number; readonly from: number; readonly label: string };

/**
 * A percentage per point, reported solid and case dashed, on the same x
 * positions as the revenue columns so the charts line up.
 */
function percentLineChart(
  points: readonly HistoryPoint[],
  value: (p: HistoryPoint) => number | null,
  label: string,
  reference: Reference | null,
): string {
  const height = 190;
  const bottom = height - 28;
  const values = definedNumbers(points.map(value));
  if (values.length === 0) return "";
  const extent = reference === null ? values : [...values, reference.value];
  const ticks = niceTicks(Math.min(0, ...extent), Math.max(0, ...extent), 4);
  const y = linearScale([ticks[0] ?? 0, ticks[ticks.length - 1] ?? 1], [bottom, PLOT.top]);
  const band = bandScale(points.length, PLOT.left, PLOT.right);
  const coords = points.flatMap((p, i) => {
    const v = value(p);
    return v === null ? [] : [{ p, i, v, at: [band.x(i), y(v)] as const }];
  });
  const reported = coords.filter((c) => c.p.kind === "reported");
  const caseCoords = coords.filter((c) => c.p.kind === "case");
  const lastReported = reported[reported.length - 1];
  const caseLine = lastReported === undefined ? caseCoords : [lastReported, ...caseCoords];
  const dots = coords
    .map(
      (c) =>
        `<g class="hit"><circle cx="${c.at[0].toFixed(1)}" cy="${c.at[1].toFixed(1)}" r="4" class="${c.p.kind === "case" ? "pt-case" : "pt-reported"}"/><circle cx="${c.at[0].toFixed(1)}" cy="${c.at[1].toFixed(1)}" r="12" fill="transparent"/>${tooltip(`${c.p.label}: ${formatPercent(c.v)}`)}</g>`,
    )
    .join("");
  const ref =
    reference === null
      ? ""
      : line(
          band.x(reference.from) - band.width / 2,
          y(reference.value),
          PLOT.right,
          y(reference.value),
          "implied-line",
        ) +
        text(PLOT.right, y(reference.value) - 6, reference.label, {
          anchor: "end",
          cls: "marker-label",
        });
  return svg(
    WIDTH,
    height,
    label,
    yGrid(ticks, y, PLOT.left, PLOT.right, (t) => formatPercent(t, 0)) +
      ref +
      polyline(
        reported.map((c) => c.at),
        "line-reported",
      ) +
      polyline(
        caseLine.map((c) => c.at),
        "line-case",
      ) +
      dots +
      xLabels(points, band, bottom + 18),
  );
}

export function marginChart(model: ReportModel): string {
  return percentLineChart(model.history, (p) => p.ebitMargin, "EBIT margin", null);
}

export function growthChart(model: ReportModel): string {
  const firstCase = model.history.findIndex((p) => p.kind === "case");
  const reference =
    model.implied?.kind !== "growth" || firstCase < 0
      ? null
      : {
          value: model.implied.value,
          from: firstCase,
          label: `Price implies ${formatPercent(model.implied.value)} a year`,
        };
  return percentLineChart(model.history, (p) => p.growth, "Revenue growth", reference);
}

/** Present value of the forecast years against the terminal value, as one split bar. */
export function compositionChart(currency: string, c: ValueComposition): string {
  const height = 64;
  const total = c.pvExplicitPeriod + c.pvTerminalValue;
  if (total <= 0) return "";
  const x = linearScale([0, total], [0, WIDTH]);
  const split = x(c.pvExplicitPeriod);
  const gap = 2;
  const segment = (x0: number, width: number, cls: string, name: string, value: number) => {
    const share = formatPercent(value / total, 0);
    const label = `${name} ${share}`;
    const fits = width > label.length * 7 + 16;
    return (
      `<g class="hit"><rect x="${x0.toFixed(1)}" y="8" width="${Math.max(0, width).toFixed(1)}" height="28" rx="4" class="${cls}"/>${tooltip(`${name}: ${formatMillions(currency, value)} (${share})`)}</g>` +
      (fits ? text(x0 + 10, 27, label, { cls: "seg-label" }) : "")
    );
  };
  return svg(
    WIDTH,
    height,
    "Where the enterprise value comes from",
    segment(0, split - gap / 2, "seg-explicit", `Years 1-${c.horizonYears}`, c.pvExplicitPeriod) +
      segment(
        split + gap / 2,
        WIDTH - split - gap / 2,
        "seg-terminal",
        "Terminal value",
        c.pvTerminalValue,
      ) +
      text(
        0,
        56,
        `PV of years 1-${c.horizonYears}: ${formatMillions(currency, c.pvExplicitPeriod)}`,
        { cls: "tick" },
      ) +
      text(WIDTH, 56, `PV of terminal value: ${formatMillions(currency, c.pvTerminalValue)}`, {
        anchor: "end",
        cls: "tick",
      }),
  );
}
