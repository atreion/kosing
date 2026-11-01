import assert from "node:assert/strict";
import { test } from "node:test";
import type { Results } from "../results/types.ts";
import { loadFixture } from "../test-fixtures.ts";
import { valuate } from "../valuate.ts";
import { buildReportModel, parseVerdict } from "./model.ts";
import { renderReport } from "./render.ts";

function acmeResults(caseName: string): Results {
  const r = valuate(loadFixture("acme.facts"), loadFixture(caseName));
  if (!r.success) throw new Error(JSON.stringify(r.error));
  return r.data;
}

test("the verdict and conviction come from the first bold verdict line", () => {
  assert.deepEqual(parseVerdict("# X\n\n**Verdict: `watching`, conviction medium. Entry**"), {
    label: "watching",
    conviction: "medium",
  });
  assert.deepEqual(parseVerdict("**Verdict: `pass`.** Conviction: high on the business"), {
    label: "pass",
    conviction: "high on the business",
  });
  assert.deepEqual(parseVerdict("**Verdict: accumulate. Conviction: medium-high. Entry price**"), {
    label: "accumulate",
    conviction: "medium-high",
  });
  assert.deepEqual(
    parseVerdict("**Verdict: watching.** Conviction in the base value: medium. Entry price SEK"),
    { label: "watching", conviction: "medium" },
  );
  assert.deepEqual(
    parseVerdict("**Verdict: watching (held: starter). Conviction: medium.** Entry"),
    { label: "watching", conviction: "medium" },
  );
  assert.deepEqual(
    parseVerdict("**Verdict: `watching`. Conviction: medium on the business, low on the value.**"),
    { label: "watching", conviction: "medium on the business, low on the value" },
  );
  assert.equal(parseVerdict("no verdict here"), null);
  assert.equal(parseVerdict("**Verdict: maybe.**"), null);
});

test("a dcf report carries the projection after the reported years with growth from the base", () => {
  const results = acmeResults("acme-dcf.case");
  const model = buildReportModel(results, null);
  const reported = model.history.filter((p) => p.kind === "reported");
  const projected = model.history.filter((p) => p.kind === "case");
  assert.ok(reported.length > 0);
  assert.equal(
    projected.length,
    results.valuation?.method === "dcf" ? results.valuation.projection.length : -1,
  );
  assert.deepEqual(
    model.history.map((p) => p.kind),
    [...reported.map(() => "reported"), ...projected.map(() => "case")],
  );
  assert.ok(projected.every((p) => p.growth !== null));
  assert.notEqual(model.composition, null);
});

test("a normalised-earnings report has its three scenarios and no projection", () => {
  const model = buildReportModel(acmeResults("acme-normalised.case"), null);
  assert.ok(model.values !== null && model.values.bear !== null && model.values.bull !== null);
  assert.ok(model.history.every((p) => p.kind === "reported"));
  assert.equal(model.composition, null);
});

test("the page renders the advice and escapes the company name", () => {
  const results = acmeResults("acme-dcf.case");
  const named: Results = {
    ...results,
    inputs: {
      ...results.inputs,
      company: {
        ...results.inputs.company,
        identity: { ...results.inputs.company.identity, name: "A&B <Corp>" },
      },
    },
  };
  const html = renderReport(buildReportModel(named, "**Verdict: `accumulate`**\n\n## Why\n\ntext"));
  assert.match(html, /A&amp;B &lt;Corp&gt;/);
  assert.match(html, /<span class="pill pill-verdict">accumulate<\/span>/);
  assert.match(html, /<h2>Why<\/h2>/);
  assert.doesNotMatch(html, /NaN|undefined/);
});

function resultsOf(factsName: string, caseName: string | null): Results {
  const r = valuate(loadFixture(factsName), caseName === null ? undefined : loadFixture(caseName));
  if (!r.success) throw new Error(JSON.stringify(r.error));
  return r.data;
}

test("revenue growth is null across a gap in the fiscal years", () => {
  const results = acmeResults("acme-dcf.case");
  const years = results.inputs.company.financials.fiscalYears;
  const gapped: Results = {
    ...results,
    inputs: {
      ...results.inputs,
      company: {
        ...results.inputs.company,
        financials: {
          ...results.inputs.company.financials,
          fiscalYears: [{ ...years[0], fy: years[0].fy - 5 }, ...years.slice(1)],
        },
      },
    },
  };
  const reported = buildReportModel(gapped, null).history.filter((p) => p.kind === "reported");
  assert.equal(reported[1]?.growth, null);
  assert.notEqual(reported[2]?.growth ?? null, null);
});

test("what the price implies follows the method", () => {
  assert.equal(buildReportModel(acmeResults("acme-dcf.case"), null).implied?.kind, "growth");
  assert.equal(
    buildReportModel(resultsOf("nordbank.facts", "nordbank-excess.case"), null).implied?.kind,
    "rote",
  );
  assert.equal(
    buildReportModel(resultsOf("holdco.facts", "holdco-nav.case"), null).implied?.kind,
    "priceToNav",
  );
  assert.equal(
    buildReportModel(resultsOf("miner.facts", "miner-mine-nav.case"), null).implied?.kind,
    "commodityPrice",
  );
});

test("each method renders its own working, and the checks section lists warnings", () => {
  const page = (facts: string, c: string) =>
    renderReport(buildReportModel(resultsOf(facts, c), null));
  assert.match(page("acme.facts", "acme-normalised.case"), /<h2>Normalised earnings<\/h2>/);
  assert.match(
    page("nordbank.facts", "nordbank-excess.case"),
    /<h2>Excess return on tangible book<\/h2>/,
  );
  const nav = page("holdco.facts", "holdco-parts-nav.case");
  assert.match(nav, /<h2>Sum of the parts<\/h2>/);
  assert.match(nav, /<code>scenariosNarrow<\/code>/);
  assert.doesNotMatch(nav, /\d{4,}%/, "no amount printed as a percentage");
  assert.match(page("miner.facts", "miner-mine-nav.case"), /Price the market implies/);
  assert.doesNotMatch(page("acme.facts", "acme-dcf.case"), /<h2>Checks<\/h2>/);
});
