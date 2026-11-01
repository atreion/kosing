/**
 * The report's method sections: each valuation method's own working, so the
 * page shows how the value was reached and not only the result.
 */

import { assertNever } from "../exhaustive.ts";
import type {
  CommoditySection,
  ExcessReturnSection,
  NavSection,
  NormalisedEarningsSection,
} from "../results/types.ts";
import {
  escapeHtml,
  fixed,
  formatMillions,
  formatMultiple,
  formatPercent,
  formatPerShare,
  humanise,
} from "./format.ts";
import type { Check, DiscountRate, ReportModel } from "./model.ts";

const SCENARIOS = ["bear", "base", "bull"] as const;

function row(label: string, cells: readonly string[]): string {
  return `<tr><th>${escapeHtml(label)}</th>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
}

function scenarioTable(rows: readonly string[]): string {
  return `<table class="num"><thead><tr><th></th><th>Bear</th><th>Base</th><th>Bull</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function facts(items: readonly (readonly [string, string])[]): string {
  const cells = items.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${v}</dd></div>`);
  return `<dl class="facts">${cells.join("")}</dl>`;
}

export function checksBody(checks: readonly Check[]): string {
  if (checks.length === 0) return "";
  const items = checks.map(
    (c) => `<li><code>${escapeHtml(c.rule)}</code> ${escapeHtml(c.message)}</li>`,
  );
  return `<ul class="checks">${items.join("")}</ul>`;
}

export function discountRateBody(d: DiscountRate, currency: string): string {
  const items: [string, string][] = [
    ["Risk-free", formatPercent(d.riskFree, 2)],
    ["Beta", fixed(d.beta, 2)],
    ["Equity risk premium", formatPercent(d.erp, 2)],
    ["Country premium", formatPercent(d.countryPremium, 2)],
    ["Cost of equity", formatPercent(d.costOfEquity, 2)],
    ["WACC", formatPercent(d.wacc, 2)],
  ];
  const alt = d.alternativeBeta;
  const altLine =
    alt === null || alt.valuePerShare === null
      ? ""
      : `<p class="bridge">On the other credible beta (${fixed(alt.beta, 2)}) the base value is ${formatPerShare(currency, alt.valuePerShare)}.</p>`;
  return facts(items) + altLine;
}

function normalisedBody(v: NormalisedEarningsSection, currency: string): string {
  const base = v.revenueBase.value;
  const money = (x: number) => formatMillions(currency, x);
  const s = v.scenarios;
  const claims = s.base.ev - s.base.equity;
  const window = v.revenueBase.window === null ? "" : ` (FY${v.revenueBase.window.join(", FY")})`;
  return (
    facts([
      [
        "Revenue base",
        `${money(base)}, ${v.revenueBase.kind === "ltm" ? "last twelve months" : "average of fiscal years"}${escapeHtml(window)}`,
      ],
      [
        "Current EBIT margin",
        v.ltmEbitMargin === null ? "&ndash;" : formatPercent(v.ltmEbitMargin),
      ],
      ["Net debt, leases and minorities", money(claims)],
    ]) +
    scenarioTable([
      row(
        "EBIT margin",
        SCENARIOS.map((k) => formatPercent(base > 0 ? s[k].ebit / base : 0)),
      ),
      row(
        "EV/EBIT",
        SCENARIOS.map((k) => (s[k].ebit > 0 ? formatMultiple(s[k].ev / s[k].ebit) : "&ndash;")),
      ),
      row(
        "Normalised EBIT",
        SCENARIOS.map((k) => money(s[k].ebit)),
      ),
      row(
        "Enterprise value",
        SCENARIOS.map((k) => money(s[k].ev)),
      ),
      row(
        "Equity",
        SCENARIOS.map((k) => money(s[k].equity)),
      ),
      row(
        "Per share",
        SCENARIOS.map((k) => formatPerShare(currency, s[k].valuePerShare)),
      ),
    ])
  );
}

function excessReturnBody(v: ExcessReturnSection, currency: string): string {
  const money = (x: number) => formatMillions(currency, x);
  const years = v.projection
    .map(
      (y) =>
        `<tr><th>Year ${y.year}</th><td>${money(y.openingBook)}</td><td>${formatPercent(y.rote)}</td><td>${money(y.earnings)}</td><td>${money(y.excessReturn)}</td></tr>`,
    )
    .join("");
  const grid = v.sensitivity;
  const head = grid.axes.roteShift
    .map((r) => `<th>ROTE ${r >= 0 ? "+" : ""}${fixed(r * 100, 1)}pp</th>`)
    .join("");
  const body = grid.axes.costOfEquity
    .map(
      (ke, i) =>
        `<tr><th>Ke ${formatPercent(ke)}</th>${(grid.grid[i] ?? [])
          .map((x) => `<td>${x === null ? "n/a" : fixed(x, 2)}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  return (
    facts([
      ["Cost of equity", formatPercent(v.costOfEquity, 2)],
      ["Tangible book", money(v.tangibleBook)],
      [
        "Price to tangible book",
        v.priceToTangibleBook === null ? "&ndash;" : formatMultiple(v.priceToTangibleBook),
      ],
      ["Payout", formatPercent(v.payoutRatio, 0)],
      ["Terminal growth", formatPercent(v.terminalGrowth)],
      [
        "Terminal share of value",
        v.terminalPctOfValue === null ? "&ndash;" : formatPercent(v.terminalPctOfValue, 0),
      ],
    ]) +
    `<h3>Book and excess return, base case</h3><table class="num"><thead><tr><th></th><th>Opening book</th><th>ROTE</th><th>Earnings</th><th>Excess return</th></tr></thead><tbody>${years}</tbody></table>` +
    `<h3>Value per share by cost of equity and ROTE</h3><table class="num"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table>`
  );
}

function commodityBody(c: CommoditySection, currency: string): string {
  const usd = (x: number) => `USD ${fixed(x, 2)}/${escapeHtml(c.unit)}`;
  const ptn = (x: number | null) => (x === null ? "&ndash;" : formatMultiple(x));
  const sensitivity = c.realRateSensitivity
    .map((r) => `${formatPercent(r.realRate)}: ${formatPerShare(currency, r.valuePerShare)}`)
    .join("; ");
  return (
    `<h3>${escapeHtml(c.name)}</h3>` +
    scenarioTable([
      row(
        "Price deck",
        SCENARIOS.map((k) => usd(c.priceDeck[k])),
      ),
      row(
        "Price to NAV",
        SCENARIOS.map((k) => ptn(c.priceToNav[k])),
      ),
    ]) +
    facts([
      ["Price the market implies", c.impliedPrice === null ? "&ndash;" : usd(c.impliedPrice)],
      ["Real discount rate", formatPercent(c.realRate, 2)],
      ["At 8% real", formatPerShare(currency, c.valuePerShareAt8PctReal)],
      ["Real rate one point either side", sensitivity],
    ])
  );
}

function navBody(v: NavSection, currency: string): string {
  const money = (x: number) => formatMillions(currency, x);
  const parts = v.parts
    .map((p) =>
      row(
        `${p.name} (${humanise(p.kind)})`,
        SCENARIOS.map((k) => money(p.value[k])),
      ),
    )
    .join("");
  type Totals = { grossAssetValue: number; valuePerShare: number };
  const totals: readonly (Totals | null)[] = [
    v.scenarios?.bear ?? null,
    v,
    v.scenarios?.bull ?? null,
  ];
  const cells = (show: (t: Totals) => string) =>
    totals.map((t) => (t === null ? "&ndash;" : show(t)));
  return (
    scenarioTable([
      parts,
      row(
        "Gross asset value",
        cells((t) => money(t.grossAssetValue)),
      ),
      row(
        "Per share",
        cells((t) => formatPerShare(currency, t.valuePerShare)),
      ),
    ]) +
    facts([
      ["Parent net debt", money(v.parentNetDebt)],
      [
        "Warranted discount",
        `${money(v.discountApplied)}${v.nav > 0 ? ` (${formatPercent(v.discountApplied / v.nav, 0)} of NAV)` : ""}`,
      ],
      ["NAV, base", money(v.nav)],
      ["Look-through NAV", v.lookThroughNav === null ? "&ndash;" : money(v.lookThroughNav)],
    ]) +
    (v.commodity === null ? "" : commodityBody(v.commodity, currency))
  );
}

/** The method's working; the dcf's lives in the composition section and the grid. */
export function methodSection(model: ReportModel): { title: string; body: string } | null {
  const v = model.valuation;
  if (v === null) return null;
  switch (v.method) {
    case "dcf":
      return null;
    case "normalisedEarnings":
      return { title: "Normalised earnings", body: normalisedBody(v, model.currency) };
    case "excessReturn":
      return { title: "Excess return on tangible book", body: excessReturnBody(v, model.currency) };
    case "nav":
      return { title: "Sum of the parts", body: navBody(v, model.currency) };
    default:
      return assertNever(v);
  }
}
