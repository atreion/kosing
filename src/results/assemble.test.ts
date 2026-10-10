import assert from "node:assert/strict";
import { test } from "node:test";
import { type Decoded, decode } from "../input/decode.ts";
import { loadFixture, mutate, VALID_FIXTURES } from "../test-fixtures.ts";
import { assertAllFinite, assertClose } from "../test-utils.ts";
import { assemble } from "./assemble.ts";

function decoded(facts: unknown, c?: unknown): Decoded {
  const r = decode(facts, c);
  assert.ok(r.success, JSON.stringify(r.error));
  return r.data;
}

const acme = () => loadFixture("acme.facts");
const dcfCase = () => loadFixture("acme-dcf.case");

const SECTIONS = [
  "schemaVersion",
  "inputs",
  "derived",
  "pricedIn",
  "valuation",
  "sensitivity",
  "fx",
  "resolutions",
  "warnings",
];

for (const f of VALID_FIXTURES.facts) {
  test(`${f} alone: every section present, valuation null, every number finite`, () => {
    const r = assemble(decoded(loadFixture(f)));
    assert.deepEqual(Object.keys(r), SECTIONS);
    assert.equal(r.valuation, null);
    assert.equal(r.sensitivity, null);
    assert.equal(r.inputs.classification, null);
    assert.deepEqual(r.inputs.theses, []);
    assert.equal(r.inputs.caseFactsAsOf, null);
    assert.equal(r.pricedIn.multiples.length, 5);
    assertAllFinite(r);
  });
}

test("inputs echo the case and the decoded company", () => {
  const d = decoded(acme(), dcfCase());
  const r = assemble(d);
  assert.equal(r.inputs.ticker, "ACME");
  assert.equal(r.inputs.factsAsOf, "2026-10-01");
  assert.equal(r.inputs.caseFactsAsOf, "2026-10-01");
  assert.equal(r.inputs.classification, "garp");
  assert.deepEqual(r.inputs.theses, ["ai-disruption-overreaction", "eu-digital-sovereignty"]);
  assert.equal(r.inputs.company, d.company);
  assert.equal(r.warnings, d.warnings);
});

test("derived carries market cap, EV, net debt, other claims, multiples and the facts' wacc", () => {
  const r = assemble(decoded(acme()));
  assert.equal(r.derived.marketCap, 24380);
  assert.equal(r.derived.enterpriseValue, 26380);
  assert.equal(r.derived.netDebt, 2000);
  assertClose(r.derived.multiples.peTrailing ?? 0, 24380 / 1020, 1e-9);
  assertClose(r.derived.multiples.priceBook ?? 0, 24380 / 6200, 1e-9);
  assertClose(r.derived.wacc.costOfEquity, 0.025 + 1.1 * 0.055, 1e-12);
});

test("priced-in multiples: position against the 5y band, peer median, nulls where facts are silent", () => {
  const r = assemble(decoded(acme()));
  const byMetric = new Map(r.pricedIn.multiples.map((m) => [m.metric, m]));
  const pe = byMetric.get("peTrailing");
  assert.equal(pe?.position, "within");
  assert.equal(pe?.peerMedian, 20.5);
  assert.deepEqual(pe?.band10y, { low: 11, high: 28 });
  const evRevenue = byMetric.get("evRevenue");
  assert.equal(evRevenue?.position, null);
  assertClose(evRevenue?.peerMedian ?? 0, 1.95, 1e-12);
  assert.equal(byMetric.get("priceBook")?.peerMedian, null);
  assert.equal(byMetric.get("evEbitda")?.position, null, "band is all null");
});

test("the reverse dcf prices the current share price and names its base period", () => {
  const r = assemble(decoded(acme()));
  assert.notEqual(r.pricedIn.reverseDcf, null);
  assert.deepEqual(r.pricedIn.reverseDcf?.basePeriod, {
    kind: "ltm",
    fy: null,
    endDate: "2026-06-30",
  });
  assert.equal(r.pricedIn.reverseDcf?.horizonYears, 10);
  assert.equal(r.pricedIn.reverseDcf?.terminalGrowth, 0.02);
  assert.ok(Number.isFinite(r.pricedIn.reverseDcf?.impliedGrowth));
});

test("a company with no usable base period has no reverse dcf and a resolution saying why", () => {
  const r = assemble(decoded(loadFixture("holdco.facts")));
  assert.equal(r.pricedIn.reverseDcf, null);
  assert.ok(
    r.resolutions.some(
      (x) => x.kind === "reverseDcfUnavailable" && x.reason === "noUsableBasePeriod",
    ),
  );
  assert.notEqual(r.derived.multiples.peTrailing, null, "net income is reported");
  assert.equal(r.derived.multiples.evEbit, null, "ebit is not");
});

test("a dcf case fills valuation and sensitivity; fx is null when facts carry none", () => {
  const r = assemble(decoded(acme(), dcfCase()));
  assert.equal(r.valuation?.method, "dcf");
  if (r.valuation?.method !== "dcf") return;
  assert.equal(r.valuation.wacc.overridden, false);
  assert.equal(r.valuation.projection.length, 10);
  assertClose(
    r.valuation.pvExplicitPeriod + r.valuation.pvTerminalValue,
    r.valuation.enterpriseValue,
    1e-9,
  );
  assert.deepEqual(r.valuation.terminal, { kind: "perpetuityGrowth", growth: 0.02 });
  assert.deepEqual(r.sensitivity?.base, [2, 2]);
  assert.equal(r.sensitivity?.grid.length, 5);
  assert.equal(r.fx, null);
  assert.ok(!r.resolutions.some((x) => x.kind === "fxUnavailable"));
  assertAllFinite(r);
});

test("terminal growth at or above wacc: valuation and sensitivity null, dcfUnavailable recorded", () => {
  const r = assemble(decoded(acme(), mutate(dcfCase(), "method.terminal.growth", 0.5)));
  assert.equal(r.valuation, null);
  assert.equal(r.sensitivity, null);
  assert.deepEqual(
    r.resolutions.filter((x) => x.kind === "dcfUnavailable"),
    [{ kind: "dcfUnavailable", reason: "terminalGrowthNotBelowWacc" }],
  );
  assertAllFinite(r);
});

test("fx runs off the dcf when facts carry exposures, and is unavailable without a dcf", () => {
  const dual = loadFixture("dual.facts");
  const withDcf = assemble(decoded(dual, mutate(dcfCase(), "ticker", "DUAL")));
  assert.equal(withDcf.fx?.length, 1);
  assert.equal(withDcf.fx?.[0]?.pair, "USDEUR");
  assert.deepEqual(
    withDcf.fx?.[0]?.moves.map((m) => m.pct),
    [-0.1, -0.05, 0.05, 0.1],
  );
  assertAllFinite(withDcf);

  const alone = assemble(decoded(dual));
  assert.equal(alone.fx, null);
  assert.ok(
    alone.resolutions.some((x) => x.kind === "fxUnavailable" && x.reason === "noDcfValuation"),
  );
});

test("a normalised earnings case fills its section and nothing dcf-specific", () => {
  const r = assemble(decoded(acme(), loadFixture("acme-normalised.case")));
  assert.equal(r.valuation?.method, "normalisedEarnings");
  if (r.valuation?.method !== "normalisedEarnings") return;
  assert.deepEqual(r.valuation.revenueBase.window, [2023, 2024, 2025]);
  assert.ok(r.valuation.scenarios.bear.valuePerShare <= r.valuation.scenarios.bull.valuePerShare);
  assert.equal(r.sensitivity, null);
  assert.equal(r.fx, null);
  assertAllFinite(r);
});

test("a nav case fills its section with the holdings and look-through NAV beside it", () => {
  const r = assemble(decoded(loadFixture("holdco.facts"), loadFixture("holdco-nav.case")));
  assert.equal(r.valuation?.method, "nav");
  if (r.valuation?.method !== "nav") return;
  assert.equal(r.valuation.grossAssetValue, 31700);
  assert.equal(r.valuation.nav, 31400);
  assert.equal(r.valuation.lookThroughNav, 31400);
  assert.equal(r.valuation.holdings.length, 3);
  assertClose(r.valuation.valuePerShare, (31400 * 0.8) / 280, 1e-9);
  assertAllFinite(r);
});

test("resolutions are decode's first, then the assembler's, in order", () => {
  const r = assemble(decoded(mutate(acme(), "financials.ltm", null), dcfCase()));
  const kinds = r.resolutions.map((x) => x.kind);
  assert.deepEqual(kinds.slice(0, 2), ["betaFromSector", "netDebtDerived"]);
  assert.ok(kinds.includes("dcfBasePeriodFromFiscalYear"));
});

const paths = (g: number, m: number, rationale: string) => ({
  revenueGrowthPath: Array.from({ length: 10 }, () => g),
  ebitMarginPath: Array.from({ length: 10 }, () => m),
  rationale,
});

test("bear and bull scenarios are valued with the base case's other assumptions", () => {
  const c = mutate(dcfCase(), "method.scenarios", {
    bear: paths(0.0, 0.1, "down"),
    bull: paths(0.08, 0.14, "up"),
  });
  const r = assemble(decoded(acme(), c));
  if (r.valuation?.method !== "dcf") throw new Error("unreachable");
  const s = r.valuation.scenarios;
  assert.ok(s?.bear && s.bull);
  assert.ok(s.bear.valuePerShare < r.valuation.valuePerShare);
  assert.ok(r.valuation.valuePerShare < s.bull.valuePerShare);
  assertAllFinite(r);
  const plain = assemble(decoded(acme(), dcfCase()));
  if (plain.valuation?.method !== "dcf") throw new Error("unreachable");
  assert.equal(plain.valuation.scenarios, null);
});

test("the dcf is also valued on the beta that was not used, unless the wacc is overridden", () => {
  const measured = mutate(acme(), "costOfCapital.betaCompany", 0.76);
  const r = assemble(decoded(measured, dcfCase()));
  if (r.valuation?.method !== "dcf") throw new Error("unreachable");
  const alt = r.valuation.alternativeBeta;
  assert.equal(alt?.beta, 1.1);
  assert.ok(alt && alt.wacc > r.valuation.wacc.wacc);
  assert.ok(alt && alt.valuePerShare !== null && alt.valuePerShare < r.valuation.valuePerShare);
  const overridden = mutate(mutate(dcfCase(), "overrides.wacc", 0.07), "overrides.rationale", "x");
  const o = assemble(decoded(measured, overridden));
  if (o.valuation?.method !== "dcf") throw new Error("unreachable");
  assert.equal(o.valuation.alternativeBeta, null);
  const sector = assemble(decoded(acme(), dcfCase()));
  if (sector.valuation?.method !== "dcf") throw new Error("unreachable");
  assert.equal(sector.valuation.alternativeBeta, null);
});
