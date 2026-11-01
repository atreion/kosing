/** ReportModel to one self-contained HTML page: inline CSS, inline SVG, no scripts. */

import { assertNever } from "../exhaustive.ts";
import type { SensitivityResult } from "../math/sensitivity.ts";
import {
  compositionChart,
  growthChart,
  marginChart,
  revenueChart,
  valueRangeChart,
} from "./charts.ts";
import {
  escapeHtml,
  fixed,
  formatMillions,
  formatMultiple,
  formatPercent,
  formatPerShare,
  formatSignedPercent,
  humanise,
} from "./format.ts";
import { renderMarkdown } from "./markdown.ts";
import type { Implied, MultipleView, ReportModel } from "./model.ts";
import { checksBody, discountRateBody, methodSection } from "./sections.ts";

const METRIC_LABELS: Readonly<Record<MultipleView["metric"], string>> = {
  peTrailing: "P/E, trailing",
  evEbit: "EV/EBIT",
  evEbitda: "EV/EBITDA",
  evRevenue: "EV/revenue",
  priceBook: "P/B",
  priceTangibleBook: "P/TB",
  dividendYield: "Dividend yield",
};

function formatMetric(metric: MultipleView["metric"], value: number): string {
  return metric === "dividendYield" ? formatPercent(value) : formatMultiple(value);
}

function tile(label: string, value: string, note: string | null): string {
  return `<div class="tile"><div class="tile-label">${escapeHtml(label)}</div><div class="tile-value">${escapeHtml(value)}</div>${note === null ? "" : `<div class="tile-note">${escapeHtml(note)}</div>`}</div>`;
}

function impliedTile(implied: Implied | null): string | null {
  if (implied === null) return null;
  switch (implied.kind) {
    case "growth":
      return tile("Price implies", `${formatPercent(implied.value)} growth`, "a year for 10 years");
    case "growthBeyondRange":
      return tile("Price implies", "Beyond range", "more growth than the reverse DCF searches");
    case "rote":
      return tile(
        "Price implies",
        `${formatPercent(implied.value)} ROTE`,
        "steady state, on tangible book",
      );
    case "priceToNav":
      return tile("Price to NAV", formatMultiple(implied.value), "price over base NAV per share");
    case "commodityPrice":
      return tile(
        "Price implies",
        `USD ${fixed(implied.value, 2)}/${implied.unit}`,
        "flat, for base NAV to equal the price",
      );
    default:
      return assertNever(implied);
  }
}

/** In the quote currency when it differs: that is the price an order is placed at. */
function priceTiles(model: ReportModel): readonly (string | null)[] {
  const money = (v: number) => formatPerShare(model.currency, v);
  const h = model.hurdle;
  const t = model.trading;
  const gap =
    h === null ? "" : `price is ${formatSignedPercent(model.price / h.entryPrice - 1)} from it`;
  if (t === null) {
    return [
      tile("Price", money(model.price), `as of ${model.priceAsOf}`),
      h === null ? null : tile("Entry price", money(h.entryPrice), gap),
    ];
  }
  const quoted = (v: number) => formatPerShare(t.currency, v);
  return [
    tile("Price", quoted(t.price), `${money(model.price)}, as of ${model.priceAsOf}`),
    tile("Entry price", quoted(t.entry), `${h === null ? "" : `${money(h.entryPrice)}; `}${gap}`),
  ];
}

function tiles(model: ReportModel): string {
  const money = (v: number) => formatPerShare(model.currency, v);
  const h = model.hurdle;
  const items = [
    ...priceTiles(model),
    model.values === null
      ? null
      : tile(
          "Base value",
          money(model.values.base),
          `${formatSignedPercent(model.values.base / model.price - 1)} vs price`,
        ),
    h === null
      ? null
      : tile(
          "Required discount",
          formatPercent(h.requiredDiscount, 0),
          `${formatPercent(h.classificationDiscount, 0)} class + ${formatPercent(h.aiExposureAddOn, 0)} AI`,
        ),
    impliedTile(model.implied),
  ];
  return `<div class="tiles">${items.filter((t) => t !== null).join("")}</div>`;
}

/** A price that clears but a verdict that does not buy is explained in the advice, so say where. */
function hurdleLabel(clears: boolean, verdict: ReportModel["verdict"]): string {
  if (!clears) return "Above the entry price";
  return verdict !== null && verdict.label !== "accumulate"
    ? "Clears the hurdle; the advice says why it is not a buy"
    : "Clears the hurdle";
}

function verdictBadge(model: ReportModel): string {
  const clears = model.hurdle?.clears;
  const hurdle =
    clears === undefined
      ? ""
      : `<span class="pill ${clears ? "pill-good" : "pill-muted"}">${hurdleLabel(clears, model.verdict)}</span>`;
  const verdict =
    model.verdict === null
      ? ""
      : `<span class="pill pill-verdict">${escapeHtml(model.verdict.label)}</span>${model.verdict.conviction === null ? "" : `<span class="pill pill-muted">conviction ${escapeHtml(model.verdict.conviction)}</span>`}`;
  return `<div class="pills">${verdict}${hurdle}</div>`;
}

function meta(model: ReportModel): string {
  const parts = [
    model.classification === null ? null : humanise(model.classification),
    model.aiExposure === null ? null : `AI: ${humanise(model.aiExposure)}`,
    model.method === null ? null : `method: ${humanise(model.method)}`,
    `facts ${model.factsAsOf}`,
    model.valuedOn === null ? null : `valued ${model.valuedOn}`,
  ];
  return parts
    .filter((p) => p !== null)
    .map(escapeHtml)
    .join(" &middot; ");
}

/** Blue above the price, red below, gray at it; the strength saturates at 50% either way. */
function cellColour(value: number, price: number): string {
  const gap = Math.max(-0.5, Math.min(0.5, value / price - 1));
  const pole = gap >= 0 ? "var(--div-pos)" : "var(--div-neg)";
  return `color-mix(in oklab, ${pole} ${Math.round((Math.abs(gap) / 0.5) * 55)}%, var(--div-mid))`;
}

function sensitivityTable(model: ReportModel, s: SensitivityResult): string {
  const growth = s.axes.terminalGrowth;
  const discount = model.hurdle?.requiredDiscount ?? null;
  const head = (growth ?? [null])
    .map((g) => `<th>${g === null ? "Exit multiple" : `g ${formatPercent(g)}`}</th>`)
    .join("");
  const rows = s.axes.wacc
    .map((w, i) => {
      const cells = (s.grid[i] ?? [])
        .map((v, j) => {
          if (v === null) return "<td>n/a</td>";
          const isBase = i === s.base[0] && j === s.base[1];
          const clears = discount !== null && v * (1 - discount) >= model.price;
          const cls = [isBase ? "base" : "", clears ? "clears" : ""].join(" ").trim();
          return `<td class="${cls}" style="background:${cellColour(v, model.price)}" title="WACC ${formatPercent(w, 2)}: ${formatPerShare(model.currency, v)}">${fixed(v, 0)}</td>`;
        })
        .join("");
      return `<tr><th>WACC ${formatPercent(w)}</th>${cells}</tr>`;
    })
    .join("");
  return `<table class="heat"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function band(b: MultipleView["band5y"], metric: MultipleView["metric"]): string {
  return b.low === null || b.high === null
    ? "&ndash;"
    : `${formatMetric(metric, b.low)} to ${formatMetric(metric, b.high)}`;
}

/** A column with nothing in any row is left out rather than shown as dashes. */
function multiplesTable(rows: readonly MultipleView[]): string {
  const showPeers = rows.some((r) => r.peerMedian !== null);
  const showBands = rows.some((r) => r.band5y.low !== null && r.band5y.high !== null);
  const peer = (r: MultipleView) =>
    r.peerMedian === null ? "&ndash;" : formatMetric(r.metric, r.peerMedian);
  const body = rows
    .map(
      (r) =>
        `<tr><th>${METRIC_LABELS[r.metric]}</th><td>${formatMetric(r.metric, r.current)}</td>${showPeers ? `<td>${peer(r)}</td>` : ""}${showBands ? `<td>${band(r.band5y, r.metric)}</td>` : ""}</tr>`,
    )
    .join("");
  const head = `<th></th><th>Now</th>${showPeers ? "<th>Peer median</th>" : ""}${showBands ? "<th>5-year range</th>" : ""}`;
  return `<table class="num"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function section(title: string, subtitle: string | null, body: string): string {
  if (body === "") return "";
  return `<section><h2>${escapeHtml(title)}</h2>${subtitle === null ? "" : `<p class="sub">${subtitle}</p>`}${body}</section>`;
}

const LEGEND_HISTORY = `<div class="legend"><span><i class="key key-reported"></i>Reported</span><span><i class="key key-case"></i>Case</span></div>`;

function basisChangesNote(model: ReportModel): string {
  if (model.basisChanges.length === 0) return "";
  const items = model.basisChanges.map(
    (b) => `<li>From ${escapeHtml(b.asOf)}: ${escapeHtml(b.description)}</li>`,
  );
  return `<h3>Breaks in the reporting basis</h3><ul class="checks">${items.join("")}</ul>`;
}

function compositionBlock(model: ReportModel): string {
  const c = model.composition;
  if (c === null) return "";
  const claims = c.enterpriseValue - c.equityValue;
  const adjustment = claims >= 0 ? "&minus; net debt and other claims" : "+ net cash";
  const bridge = `<p class="bridge">Enterprise value ${formatMillions(model.currency, c.enterpriseValue)} ${adjustment} ${formatMillions(model.currency, Math.abs(claims))} = equity ${formatMillions(model.currency, c.equityValue)}</p>`;
  return compositionChart(model.currency, c) + bridge;
}

const STYLE = `
:root {
  color-scheme: light;
  --page: #f9f9f7; --surface: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --muted: #898781;
  --grid: #e1e0d9; --axis: #c3c2b7; --border: rgba(11,11,11,0.10);
  --s1: #2a78d6; --s1-light: #9ec5f4; --s2: #eb6834;
  --div-pos: #2a78d6; --div-neg: #e34948; --div-mid: #f0efec;
  --good: #006300; --good-bg: rgba(12,163,12,0.12);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --page: #0d0d0d; --surface: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7; --muted: #898781;
    --grid: #2c2c2a; --axis: #383835; --border: rgba(255,255,255,0.10);
    --s1: #3987e5; --s1-light: #1c5cab; --s2: #d95926;
    --div-pos: #3987e5; --div-neg: #e66767; --div-mid: #383835;
    --good: #0ca30c; --good-bg: rgba(12,163,12,0.18);
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--page); color: var(--ink);
  font: 15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 800px; margin: 0 auto; padding: 32px 16px 64px; }
header h1 { font-size: 28px; line-height: 1.2; margin: 0 0 4px; font-weight: 650; }
header .id { color: var(--ink-2); font-weight: 400; }
.meta { color: var(--muted); font-size: 13px; margin: 0 0 14px; }
.pills { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
.pill { font-size: 13px; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--border); }
.pill-verdict { background: var(--ink); color: var(--page); font-weight: 600; border-color: transparent; }
.pill-good { color: var(--good); background: var(--good-bg); border-color: transparent; }
.pill-muted { color: var(--ink-2); }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
.tile { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; }
.tile-label { font-size: 12px; color: var(--ink-2); }
.tile-value { font-size: 20px; font-weight: 600; margin: 2px 0; }
.tile-note { font-size: 12px; color: var(--muted); }
section { background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
  padding: 18px 20px; margin-top: 16px; }
h2 { font-size: 17px; margin: 0 0 2px; font-weight: 600; }
.sub { color: var(--ink-2); font-size: 13px; margin: 0 0 12px; }
h3 { font-size: 14px; margin: 18px 0 6px; font-weight: 600; color: var(--ink-2); }
.chart { width: 100%; height: auto; display: block; overflow: visible; }
.chart text { font-size: 11px; fill: var(--muted); font-variant-numeric: tabular-nums; }
.chart .row-label { fill: var(--ink-2); font-size: 12px; }
.chart .marker-label { fill: var(--ink); font-size: 12px; font-weight: 600; }
.chart .dot-label { fill: var(--ink-2); font-size: 12px; }
.chart .dot-value { fill: var(--ink); font-size: 12px; font-weight: 600; }
.chart .seg-label { fill: #fff; font-size: 12px; font-weight: 600; }
.grid { stroke: var(--grid); stroke-width: 1; }
.axis { stroke: var(--axis); stroke-width: 1; }
.band { fill: var(--s1); opacity: 0.14; }
.dot { fill: var(--s1); stroke: var(--surface); stroke-width: 2; }
.range { stroke: var(--ink-2); stroke-width: 2; stroke-linecap: round; }
.price-line { stroke: var(--ink); stroke-width: 2; }
.entry-line { stroke: var(--s2); stroke-width: 2; }
.implied-line { stroke: var(--s2); stroke-width: 2; }
.col-reported { fill: var(--s1); }
.col-case { fill: var(--s1-light); }
.line-reported, .line-case { fill: none; stroke: var(--s1); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.line-case { stroke-dasharray: 5 4; }
.pt-reported, .pt-case { stroke: var(--surface); stroke-width: 2; }
.pt-reported { fill: var(--s1); }
.pt-case { fill: var(--s1-light); }
.seg-explicit { fill: var(--s1); }
.seg-terminal { fill: var(--s2); }
.hit:hover path, .hit:hover rect[class], .hit:hover circle[class] { filter: brightness(1.12); }
.legend { display: flex; gap: 16px; font-size: 12px; color: var(--ink-2); margin: 4px 0 6px; }
.key { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
.key-reported { background: var(--s1); }
.key-case { background: var(--s1-light); }
.key-entry { background: var(--s2); }
.key-price { background: var(--ink); }
.bridge { font-size: 13px; color: var(--ink-2); margin: 8px 0 0; }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 6px 16px; margin: 0 0 12px; }
.facts dt { font-size: 12px; color: var(--ink-2); }
.facts dd { margin: 0; font-variant-numeric: tabular-nums; }
.checks { margin: 0; padding-left: 18px; font-size: 14px; }
.checks li { margin: 4px 0; }
.checks code { font-size: 12px; background: var(--div-mid); padding: 1px 5px; border-radius: 4px; margin-right: 4px; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { padding: 6px 10px; border-bottom: 1px solid var(--grid); text-align: left; vertical-align: top; }
thead th { color: var(--ink-2); font-weight: 500; font-size: 12px; }
table.num td, table.heat td { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.method { overflow-x: auto; }
table.heat th { white-space: nowrap; }
table.heat td { border: 2px solid var(--surface); border-radius: 4px; }
table.heat td.base { font-weight: 700; }
table.heat td.clears { outline: 2px solid var(--good); outline-offset: -3px; }
.advice h1 { display: none; }
.advice h2 { font-size: 16px; margin: 22px 0 6px; }
.advice table { margin: 8px 0 12px; }
.advice code { font-size: 13px; background: var(--div-mid); padding: 1px 5px; border-radius: 4px; }
.advice li { margin: 3px 0; }
@media (max-width: 560px) { main { padding: 20px 12px 48px; } section { padding: 14px; }
  .heat, .num { font-size: 12px; } th, td { padding: 4px 6px; } }
`;

export function renderReport(model: ReportModel): string {
  const valueLegend = `<div class="legend"><span><i class="key key-reported"></i>Bear, base, bull</span><span><i class="key key-entry"></i>Entry price</span><span><i class="key key-price"></i>Price</span></div>`;
  const s = model.sensitivity;
  const sensitivity =
    s === null
      ? ""
      : section(
          "Discount rate and terminal growth",
          "Base value per share. Blue is above the price, red below it. Outlined cells clear the hurdle; bold is the case.",
          sensitivityTable(model, s),
        );
  const hasCase = model.history.some((p) => p.kind === "case");
  const history =
    model.history.length === 0
      ? ""
      : section(
          hasCase ? "Track record and the case" : "Track record",
          hasCase ? "Reported years, then the case's projection." : "Reported years.",
          `${hasCase ? LEGEND_HISTORY : ""}<h3>Revenue</h3>${revenueChart(model)}<h3>Revenue growth</h3>${growthChart(model)}<h3>EBIT margin</h3>${marginChart(model)}${basisChangesNote(model)}`,
        );
  const method = methodSection(model);
  const body = [
    `<header><h1>${escapeHtml(model.name)} <span class="id">${escapeHtml(model.id)}</span></h1><p class="meta">${meta(model)}</p>${verdictBadge(model)}${tiles(model)}</header>`,
    section(
      "Checks",
      "Warnings and notes from the valuator. Each is advisory; the advice says what it means here.",
      checksBody(model.checks),
    ),
    section(
      "Value against price",
      `Per share, ${escapeHtml(model.currency)}.`,
      valueLegend + valueRangeChart(model),
    ),
    method === null
      ? ""
      : section(
          method.title,
          `${escapeHtml(model.currency)}, millions unless per share.`,
          method.body,
        ),
    history,
    section(
      "Where the value comes from",
      "Present value of the forecast years against the terminal value.",
      compositionBlock(model),
    ),
    sensitivity,
    section("Cost of capital", null, discountRateBody(model.discountRate, model.currency)),
    model.multiples.length === 0 ? "" : section("Multiples", null, multiplesTable(model.multiples)),
    model.adviceMarkdown === null
      ? ""
      : section(
          "Advice",
          null,
          `<div class="advice">${renderMarkdown(model.adviceMarkdown)}</div>`,
        ),
  ].join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(model.id)} investment case</title>
<style>${STYLE}</style>
</head>
<body><main>
${body}
</main></body>
</html>
`;
}
