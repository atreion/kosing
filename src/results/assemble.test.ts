import assert from "node:assert/strict";
import { test } from "node:test";
import { type Decoded, decode } from "../input/decode.ts";
import { loadFixture, mutate, VALID_FIXTURES } from "../test-fixtures.ts";
import { assertAllFinite, assertClose } from "../test-utils.ts";
import { assemble } from "./assemble.ts";
import { DEFAULT_VALUATOR_OPTIONS } from "./types.ts";

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
  "hurdle",
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
    assert.equal(r.hurdle, null);
    assert.equal(r.sensitivity, null);
    assert.equal(r.inputs.classification, null);
    assert.equal(r.inputs.aiExposure, null);
    assert.equal(r.inputs.valuedOn, null);
    assert.equal(r.inputs.caseFactsAsOf, null);
    assert.equal(r.pricedIn.multiples.length, 7);
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
  assert.equal(r.inputs.aiExposure, "disruption");
  assert.equal(r.inputs.company, d.company);
  assert.deepEqual(
    r.warnings,
    d.warnings,
    "no scenarios, so nothing is added to decode's warnings",
  );
});

test("derived carries market cap, EV, net debt, other claims, multiples and the facts' wacc", () => {
  const r = assemble(decoded(acme()));
  assert.equal(r.derived.marketCap, 24380);
  assert.equal(r.derived.enterpriseValue, 24380 + 2000 + 700, "EV includes lease liabilities");
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
  assert.equal(r.pricedIn.reverseDcf?.depreciationCappedAtCapex, false);
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
  assert.equal(r.valuation.parts.length, 3);
  assert.equal(r.valuation.scenarios, null);
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

test("scenarios that value in the wrong order raise a warning, not a silent swap", () => {
  const inverted = mutate(dcfCase(), "method.scenarios", {
    bear: paths(0.2, 0.3, "labelled bear"),
    bull: paths(0.0, 0.05, "labelled bull"),
  });
  const r = assemble(decoded(acme(), inverted));
  assert.deepEqual(
    r.warnings.filter((w) => w.rule === "scenarioOrderInverted").map((w) => w.path),
    ["method.scenarios"],
  );
  const ordered = mutate(dcfCase(), "method.scenarios", {
    bear: paths(0.0, 0.1, "down"),
    bull: paths(0.08, 0.14, "up"),
  });
  assert.ok(
    !assemble(decoded(acme(), ordered)).warnings.some((w) => w.rule === "scenarioOrderInverted"),
  );
});

test("the hurdle applies the required discount to the dcf base value and compares the price", () => {
  const r = assemble(decoded(acme(), dcfCase()));
  if (r.valuation?.method !== "dcf" || r.hurdle === null) throw new Error("unreachable");
  const h = r.hurdle;
  assertClose(h.classificationDiscount, 0.3, 1e-12, "garp");
  assertClose(h.aiExposureAddOn, 0.05, 1e-12, "disruption");
  assertClose(h.requiredDiscount, 0.35, 1e-12);
  assert.equal(h.baseValue, r.valuation.valuePerShare);
  assertClose(h.entryPrice, r.valuation.valuePerShare * 0.65, 1e-9);
  assert.equal(h.price, r.inputs.company.market.price);
  assert.equal(h.clears, h.price <= h.entryPrice);
  assert.equal(h.trading, null, "price and reporting currency are the same");
  assert.equal(h.alternativeBeta, null);
});

test("normalised earnings and nav take their own base value", () => {
  const ne = assemble(decoded(acme(), loadFixture("acme-normalised.case")));
  if (ne.valuation?.method !== "normalisedEarnings") throw new Error("unreachable");
  assert.equal(ne.hurdle?.baseValue, ne.valuation.scenarios.base.valuePerShare);
  assertClose(ne.hurdle?.requiredDiscount ?? -1, 0.5, 1e-12, "valueCyclical + picksAndShovels");
  const nav = assemble(decoded(loadFixture("holdco.facts"), loadFixture("holdco-nav.case")));
  if (nav.valuation?.method !== "nav") throw new Error("unreachable");
  assert.equal(nav.hurdle?.baseValue, nav.valuation.valuePerShare);
  assertClose(nav.hurdle?.requiredDiscount ?? -1, 0.3, 1e-12, "holdingCompany + secondOrderOnly");
});

test("a classification with no required discount has no hurdle", () => {
  const r = assemble(decoded(acme(), mutate(dcfCase(), "classification", "reitUtility")));
  assert.notEqual(r.valuation, null);
  assert.equal(r.hurdle, null);
});

test("the hurdle is also stated on the alternative beta", () => {
  const measured = mutate(acme(), "costOfCapital.betaCompany", 0.76);
  const r = assemble(decoded(measured, dcfCase()));
  if (r.valuation?.method !== "dcf") throw new Error("unreachable");
  const altValue = r.valuation.alternativeBeta?.valuePerShare;
  const alt = r.hurdle?.alternativeBeta;
  assert.ok(alt && typeof altValue === "number");
  assert.equal(alt.baseValue, altValue);
  assertClose(alt.entryPrice, altValue * 0.65, 1e-9);
  assert.equal(alt.clears, r.inputs.company.market.price <= alt.entryPrice);
});

test("a price quoted outside the reporting currency gets the entry price in that currency too", () => {
  const c = mutate(dcfCase(), "ticker", "DUAL");
  const r = assemble(decoded(loadFixture("dual.facts"), c));
  const t = r.hurdle?.trading;
  assert.ok(r.hurdle && t);
  assert.equal(t.currency, "SEK");
  assertClose(t.price, 150, 1e-9, "the quoted price comes back unchanged");
  assertClose(t.entryPrice, r.hurdle.entryPrice / 0.088, 1e-9);
});

test("a price more than 30 days old on the valuation date is a warning", () => {
  const on = (valuedOn: string) =>
    assemble(decoded(acme()), {
      ...DEFAULT_VALUATOR_OPTIONS,
      valuedOn: valuedOn as typeof DEFAULT_VALUATOR_OPTIONS.valuedOn,
    });
  const stale = on("2026-11-01");
  assert.equal(stale.inputs.valuedOn, "2026-11-01");
  assert.deepEqual(
    stale.warnings.filter((w) => w.rule === "priceStale").map((w) => [w.path, w.message]),
    [["market.asOf", "price is from 2026-10-01, 31 days before 2026-11-01"]],
  );
  assert.ok(!on("2026-10-31").warnings.some((w) => w.rule === "priceStale"), "30 days is fresh");
  assert.ok(
    !assemble(decoded(acme())).warnings.some((w) => w.rule === "priceStale"),
    "no valuation date, no check",
  );
});

const bank = () => loadFixture("nordbank.facts");
const bankCase = () => loadFixture("nordbank-excess.case");

test("an excess-return case values the bank and fills its section", () => {
  const r = assemble(decoded(bank(), bankCase()));
  assert.equal(r.valuation?.method, "excessReturn");
  if (r.valuation?.method !== "excessReturn") return;
  assert.equal(r.valuation.tangibleBook, 9000);
  assertClose(r.valuation.costOfEquity, r.derived.wacc.costOfEquity, 1e-12);
  assert.equal(r.valuation.projection.length, 10);
  assert.ok(r.valuation.scenarios?.bear && r.valuation.scenarios.bull);
  assert.ok(r.valuation.scenarios.bear.valuePerShare < r.valuation.valuePerShare);
  assert.equal(r.valuation.sensitivity.grid.length, 5);
  assert.equal(r.sensitivity, null, "the dcf grid stays null");
  assert.equal(r.fx, null);
  assertAllFinite(r);
});

test("a bank's hurdle takes the 25% bankInsurer discount on the excess-return value", () => {
  const r = assemble(decoded(bank(), bankCase()));
  if (r.valuation?.method !== "excessReturn" || r.hurdle === null) throw new Error("unreachable");
  assertClose(r.hurdle.requiredDiscount, 0.25, 1e-12);
  assert.equal(r.hurdle.baseValue, r.valuation.valuePerShare);
});

test("a bank's priced-in section is the implied ROTE, not the reverse dcf", () => {
  const r = assemble(decoded(bank()));
  assert.equal(r.pricedIn.reverseDcf, null);
  assert.ok(
    r.resolutions.some(
      (x) => x.kind === "reverseDcfUnavailable" && x.reason === "financialInstitution",
    ),
  );
  const ir = r.pricedIn.impliedRote;
  assert.ok(ir);
  assertClose(ir.priceToTangibleBook, r.derived.marketCap / 9000, 1e-9);
  assertClose(ir.impliedRote, 0.02 + ir.priceToTangibleBook * (ir.costOfEquity - 0.02), 1e-12);
  assert.equal(assemble(decoded(acme())).pricedIn.impliedRote, null);
  const noBook = mutate(bank(), "financialInstitution.tangibleBookEquity", 0);
  assert.equal(assemble(decoded(noBook)).pricedIn.impliedRote, null, "no ratio on zero book");
});

test("a bank has no enterprise value; its multiples are P/E, P/TBV and dividend yield", () => {
  const r = assemble(decoded(bank()));
  assert.equal(r.derived.enterpriseValue, null);
  const m = new Map(r.pricedIn.multiples.map((x) => [x.metric, x.current]));
  assert.equal(m.get("evEbit"), null);
  assert.equal(m.get("evRevenue"), null);
  assertClose(m.get("priceTangibleBook") ?? 0, r.derived.marketCap / 9000, 1e-9);
  assert.notEqual(m.get("peTrailing"), null);
  assert.equal(assemble(decoded(acme())).pricedIn.multiples.length, 7);
});

test("a capital ratio inside the company's buffer is a warning", () => {
  const thin = mutate(bank(), "financialInstitution.capitalRatio", 0.145);
  const w = assemble(decoded(thin)).warnings.filter((x) => x.rule === "capitalNearRequirement");
  assert.deepEqual(
    w.map((x) => x.path),
    ["financialInstitution.capitalRatio"],
  );
  assert.ok(!assemble(decoded(bank())).warnings.some((x) => x.rule === "capitalNearRequirement"));
  const noTarget = mutate(
    mutate(bank(), "financialInstitution.capitalTarget", null),
    "financialInstitution.capitalRatio",
    0.14,
  );
  assert.ok(
    assemble(decoded(noTarget)).warnings.some((x) => x.rule === "capitalNearRequirement"),
    "without a stated buffer, 1pp applies",
  );
});

test("an undefined excess-return value is a resolution, with no valuation and no hurdle", () => {
  const c = mutate(bankCase(), "method.terminal.growth", 0.5);
  const r = assemble(decoded(bank(), c));
  assert.equal(r.valuation, null);
  assert.equal(r.hurdle, null);
  assert.ok(
    r.resolutions.some(
      (x) => x.kind === "excessReturnUnavailable" && x.reason === "costOfEquityNotAboveGrowth",
    ),
  );
});

test("excess-return scenarios that value in the wrong order raise the warning", () => {
  const inverted = mutate(bankCase(), "method.scenarios", {
    bear: { rotePath: Array(10).fill(0.2), rationale: "labelled bear" },
    bull: { rotePath: Array(10).fill(0.05), rationale: "labelled bull" },
  });
  assert.ok(
    assemble(decoded(bank(), inverted)).warnings.some((w) => w.rule === "scenarioOrderInverted"),
  );
});

test("a bank has no net debt: derived.netDebt is null and no netDebtDerived resolution", () => {
  const r = assemble(decoded(bank(), bankCase()));
  assert.equal(r.derived.netDebt, null);
  assert.ok(!r.resolutions.some((x) => x.kind === "netDebtDerived"));
  assert.equal(assemble(decoded(acme())).derived.netDebt, 2000);
});

test("implied ROTE is withheld when the cost of equity is at or below growth", () => {
  const high = {
    ...DEFAULT_VALUATOR_OPTIONS,
    reverseDcf: { ...DEFAULT_VALUATOR_OPTIONS.reverseDcf, terminalGrowth: 0.5 },
  };
  assert.equal(assemble(decoded(bank()), high).pricedIn.impliedRote, null);
  assert.notEqual(assemble(decoded(bank())).pricedIn.impliedRote, null);
});

test("a bank's P/E uses earnings after AT1 coupons", () => {
  const r = assemble(decoded(bank()));
  const pe = r.pricedIn.multiples.find((x) => x.metric === "peTrailing")?.current;
  const netIncome =
    r.inputs.company.financials.ltm?.netIncome ??
    r.inputs.company.financials.fiscalYears.at(-1)?.netIncome;
  assert.ok(typeof netIncome === "number");
  assertClose(pe ?? 0, r.derived.marketCap / (netIncome - 80), 1e-9);
  const insurer = assemble(decoded(loadFixture("safeins.facts")));
  const ipe = insurer.pricedIn.multiples.find((x) => x.metric === "peTrailing")?.current;
  const inc =
    insurer.inputs.company.financials.ltm?.netIncome ??
    insurer.inputs.company.financials.fiscalYears.at(-1)?.netIncome;
  assertClose(ipe ?? 0, insurer.derived.marketCap / (inc ?? 1), 1e-9);
});

test("the capital warning names the buffer used", () => {
  const thin = mutate(bank(), "financialInstitution.capitalRatio", 0.145);
  const w = assemble(decoded(thin)).warnings.find((x) => x.rule === "capitalNearRequirement");
  assert.ok(w);
  assert.match(w.message, /requirement [\d.]+ plus buffer [\d.]+/);
});

test("tangible book above reported equity is an advisory warning", () => {
  const over = mutate(bank(), "balanceSheet.totalEquity", 8000);
  const w = assemble(decoded(over)).warnings.filter((x) => x.rule === "tangibleBookAboveEquity");
  assert.deepEqual(
    w.map((x) => x.path),
    ["financialInstitution.tangibleBookEquity"],
  );
  for (const facts of [bank(), loadFixture("safeins.facts")]) {
    assert.ok(!assemble(decoded(facts)).warnings.some((x) => x.rule === "tangibleBookAboveEquity"));
  }
  const unknown = mutate(bank(), "balanceSheet.totalEquity", null);
  assert.ok(!assemble(decoded(unknown)).warnings.some((x) => x.rule === "tangibleBookAboveEquity"));
});

test("a nav case with parts values bear, base and bull, and the hurdle takes the base", () => {
  const r = assemble(decoded(loadFixture("holdco.facts"), loadFixture("holdco-parts-nav.case")));
  if (r.valuation?.method !== "nav") return assert.fail();
  assert.equal(r.valuation.grossAssetValue, 32400);
  assert.equal(r.valuation.nav, 32100);
  assertClose(r.valuation.valuePerShare, 25680 / 280, 1e-9);
  assertClose(r.valuation.scenarios?.bear.valuePerShare ?? -1, 22880 / 280, 1e-9);
  assertClose(r.valuation.scenarios?.bull.valuePerShare ?? -1, 28560 / 280, 1e-9);
  assert.equal(r.valuation.scenarios?.bear.grossAssetValue, 28900);
  assert.equal(r.valuation.parts.length, 4);
  assert.equal(r.hurdle?.baseValue, r.valuation.valuePerShare);
  assert.deepEqual(
    r.warnings.map((w) => w.rule),
    ["scenariosNarrow"],
    "the fixture's bear is 11% below base",
  );
});

test("nav scenarios out of order are warned about, like the other methods", () => {
  const inverted = mutate(loadFixture("holdco-parts-nav.case"), "method.parts.3", {
    kind: "segment",
    name: "Parent operations",
    metric: "EBITDA FY2025",
    metricValue: -4000,
    multiple: { bear: 6, base: 8, bull: 10 },
    rationale: "a loss-making parent on a positive multiple",
  });
  const r = assemble(decoded(loadFixture("holdco.facts"), inverted));
  assert.deepEqual(
    r.warnings.map((w) => w.rule),
    ["scenarioOrderInverted"],
  );
});

test("with an excess-return case, implied ROTE uses the case's terminal growth", () => {
  const c = mutate(bankCase(), "method.terminal.growth", 0.03);
  const ir = assemble(decoded(bank(), c)).pricedIn.impliedRote;
  assert.ok(ir);
  assert.equal(ir.terminalGrowth, 0.03);
  assertClose(ir.impliedRote, 0.03 + ir.priceToTangibleBook * (ir.costOfEquity - 0.03), 1e-12);
});

test("non-controlling interests come off a dcf's equity and go into enterprise value", () => {
  const plain = assemble(decoded(acme(), loadFixture("acme-dcf.case")));
  const minority = assemble(
    decoded(
      mutate(acme(), "balanceSheet.nonControllingInterests", 500),
      loadFixture("acme-dcf.case"),
    ),
  );
  if (plain.valuation?.method !== "dcf" || minority.valuation?.method !== "dcf") {
    throw new Error("unreachable");
  }
  assertClose(minority.valuation.equityValue, plain.valuation.equityValue - 500, 1e-6);
  assertClose(
    minority.derived.enterpriseValue ?? 0,
    (plain.derived.enterpriseValue ?? 0) + 500,
    1e-6,
  );
});

test("a run-rate dividend replaces trailing dividends paid in the yield", () => {
  const r = assemble(decoded(mutate(acme(), "market.dividendPerShareRunRate", 5)));
  assertClose(r.derived.multiples.dividendYield ?? 0, 5 / r.inputs.company.market.price, 1e-9);
});
