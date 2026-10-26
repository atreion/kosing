import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFixture, mutate } from "../test-fixtures.ts";
import { CaseSchema } from "./case.ts";
import { decodeCompany } from "./decode-company.ts";
import { decodeValuation } from "./decode-valuation.ts";
import { FactsSchema } from "./facts.ts";

function run(factsDoc: unknown, caseDoc: unknown) {
  const facts = FactsSchema.safeParse(factsDoc);
  const c = CaseSchema.safeParse(caseDoc);
  assert.ok(facts.success, JSON.stringify(facts.error?.issues.slice(0, 3)));
  assert.ok(c.success, JSON.stringify(c.error?.issues.slice(0, 3)));
  const company = decodeCompany(facts.data);
  assert.ok(company.success);
  return decodeValuation(facts.data, c.data, company.data.company);
}

const acme = () => loadFixture("acme.facts");
const holdco = () => loadFixture("holdco.facts");

test("a dcf case decodes with the default sensitivity grid and no overrides", () => {
  const result = run(acme(), loadFixture("acme-dcf.case"));
  assert.ok(result.success, JSON.stringify(result.error));
  const { valuation, resolutions } = result.data;
  assert.equal(valuation.method, "dcf");
  if (valuation.method !== "dcf") return;
  assert.equal(valuation.financials.fiscalYears.length, 5);
  assert.equal(valuation.financials.ltm?.revenue, 11400);
  assert.deepEqual(valuation.sensitivity.waccSteps, [-0.01, -0.005, 0, 0.005, 0.01]);
  assert.equal(valuation.waccOverride, null);
  assert.equal(valuation.costOfCapital.beta, 1.1);
  assert.deepEqual(resolutions, []);
});

test("a beta override replaces the facts' beta on the dcf branch and is recorded", () => {
  const withOverride = mutate(loadFixture("acme-dcf.case"), "overrides", {
    beta: 1.3,
    wacc: null,
    taxRate: null,
    rationale: "sector beta is stale",
  });
  const result = run(acme(), withOverride);
  assert.ok(result.success);
  if (result.data.valuation.method !== "dcf") return assert.fail();
  assert.equal(result.data.valuation.costOfCapital.beta, 1.3);
  assert.deepEqual(result.data.resolutions, [{ kind: "betaOverridden", from: 1.1, to: 1.3 }]);
});

test("a case's own sensitivity grid replaces the default", () => {
  const custom = mutate(loadFixture("acme-dcf.case"), "sensitivity", {
    waccSteps: [-0.02, 0, 0.02],
    terminalGrowthSteps: [0, 0.005],
  });
  const result = run(acme(), custom);
  assert.ok(result.success);
  if (result.data.valuation.method !== "dcf") return assert.fail();
  assert.deepEqual(result.data.valuation.sensitivity, {
    waccSteps: [-0.02, 0, 0.02],
    terminalGrowthSteps: [0, 0.005],
  });
});

test("averageFy takes the most recent window and records it", () => {
  const result = run(acme(), loadFixture("acme-normalised.case"));
  assert.ok(result.success, JSON.stringify(result.error));
  if (result.data.valuation.method !== "normalisedEarnings") return assert.fail();
  const base = result.data.valuation.revenueBase;
  assert.equal(base.kind, "averageFy");
  if (base.kind !== "averageFy") return;
  assert.deepEqual(
    base.window.map((y) => y.fy),
    [2023, 2024, 2025],
  );
  assert.ok(
    result.data.resolutions.some(
      (r) => r.kind === "revenueBaseAveraged" && r.fromFy === 2023 && r.toFy === 2025,
    ),
  );
});

test("an ltm policy with no ltm row is unsatisfiable", () => {
  const ltmCase = mutate(loadFixture("acme-normalised.case"), "method.revenueBase", {
    kind: "ltm",
  });
  const result = run(mutate(acme(), "financials.ltm", null), ltmCase);
  assert.equal(result.success, false);
  assert.equal(result.error?.[0]?.rule, "semantic.revenueBaseUnsatisfiable");
  assert.equal(result.error?.[0]?.path, "method.revenueBase");
});

test("averageFy asking for more years than exist is unsatisfiable", () => {
  const six = mutate(loadFixture("acme-normalised.case"), "method.revenueBase", {
    kind: "averageFy",
    years: 6,
  });
  const result = run(acme(), six);
  assert.equal(result.success, false);
  assert.equal(result.error?.[0]?.rule, "semantic.revenueBaseUnsatisfiable");
});

test("a dcf case against a row with null revenue reports every missing figure", () => {
  const broken = mutate(
    mutate(acme(), "financials.fiscalYears.0.revenue", null),
    "financials.fiscalYears.2.ebit",
    null,
  );
  const result = run(broken, loadFixture("acme-dcf.case"));
  assert.equal(result.success, false);
  assert.deepEqual(
    result.error?.map((e) => [e.rule, e.file, e.path]),
    [
      ["semantic.periodMissingFigure", "facts", "financials.fiscalYears.0.revenue"],
      ["semantic.periodMissingFigure", "facts", "financials.fiscalYears.2.ebit"],
    ],
  );
});

test("a nav case without parts takes every facts holding at its fair value, flat", () => {
  const result = run(holdco(), loadFixture("holdco-nav.case"));
  assert.ok(result.success, JSON.stringify(result.error));
  if (result.data.valuation.method !== "nav") return assert.fail();
  assert.equal(result.data.valuation.parts.length, 3);
  assert.deepEqual(result.data.valuation.parts[0], {
    name: "Listed Industrial AB",
    kind: "factsFairValue",
    holding: "Listed Industrial AB",
    value: { bear: 18000, base: 18000, bull: 18000 },
  });
  assert.equal(result.data.valuation.hasScenarios, false);
  assert.equal(result.data.valuation.parentNetDebt, 300);
});

const partsCase = () => loadFixture("holdco-parts-nav.case");

test("nav parts value each kind in the reporting currency and record the exclusion", () => {
  const result = run(holdco(), partsCase());
  assert.ok(result.success, JSON.stringify(result.error));
  if (result.data.valuation.method !== "nav") return assert.fail();
  assert.equal(result.data.valuation.hasScenarios, true);
  assert.deepEqual(
    result.data.valuation.parts.map((p) => [
      p.name,
      p.kind,
      p.kind === "mine" || p.kind === "inventory" ? null : p.value,
    ]),
    [
      ["Listed Industrial AB", "factsFairValue", { bear: 18000, base: 18000, bull: 18000 }],
      ["Listed Bank AB", "lookThrough", { bear: 7500, base: 10000, bull: 12500 }],
      ["Parent operations", "segment", { bear: 2400, base: 3200, bull: 4000 }],
      ["Head-office property", "analystValue", { bear: 1000, base: 1200, bull: 1500 }],
    ],
  );
  assert.deepEqual(result.data.resolutions, [
    { kind: "navHoldingExcluded", holding: "Private Software Group" },
  ]);
});

test("an excluded holding may have no fair value", () => {
  const result = run(mutate(holdco(), "holdings.items.2.fairValue", null), partsCase());
  assert.ok(result.success, JSON.stringify(result.error));
});

test("a look-through stake in a foreign currency converts through the facts' spot rate either way", () => {
  const usd = mutate(partsCase(), "method.parts.1.currency", "USD");
  const withRate = (pair: string, rate: number) =>
    mutate(holdco(), "fx", {
      spotRates: [{ pair, rate, asOf: "2026-10-01", sourceRef: "S1" }],
      exposures: [],
    });
  for (const [pair, rate, inverted] of [
    ["USDSEK", 10, false],
    ["SEKUSD", 0.1, true],
  ] as const) {
    const result = run(withRate(pair, rate), usd);
    assert.ok(result.success, JSON.stringify(result.error));
    if (result.data.valuation.method !== "nav") return assert.fail();
    const bank = result.data.valuation.parts[1];
    assert.ok(bank && bank.kind !== "mine" && bank.kind !== "inventory");
    assert.ok(Math.abs(bank.value.base - 100000) < 1e-6, pair);
    assert.ok(
      result.data.resolutions.some(
        (r) =>
          r.kind === "navPartConverted" &&
          r.part === "Listed Bank AB" &&
          r.pair === pair &&
          r.inverted === inverted,
      ),
      pair,
    );
  }
});

test("a look-through stake in a currency the facts carry no spot rate for is rejected", () => {
  const result = run(holdco(), mutate(partsCase(), "method.parts.1.currency", "USD"));
  assert.equal(result.success, false);
  assert.deepEqual(
    [result.error?.[0]?.file, result.error?.[0]?.rule, result.error?.[0]?.path],
    ["facts", "semantic.navPartNeedsSpotRate", "fx.spotRates"],
  );
});

test("a part naming a holding the facts do not carry is rejected at the part", () => {
  const result = run(holdco(), mutate(partsCase(), "method.parts.0.holding", "Unknown AB"));
  assert.equal(result.success, false);
  const rules = result.error?.map((e) => [e.rule, e.path]);
  assert.deepEqual(rules?.[0], ["semantic.navPartUnknownHolding", "method.parts.0.holding"]);
  assert.ok(
    rules?.some(([rule]) => rule === "semantic.navHoldingUnaccounted"),
    "Listed Industrial AB is now unaccounted for",
  );
});

test("every facts holding is accounted for exactly once", () => {
  const twice = mutate(partsCase(), "method.parts.2.holding", "Listed Bank AB");
  const result = run(holdco(), twice);
  assert.equal(result.success, false);
  assert.deepEqual(
    result.error?.map((e) => [e.rule, e.path]),
    [
      ["semantic.navHoldingTwice", "method.parts.2.holding"],
      ["semantic.navHoldingUnaccounted", "method.parts"],
    ],
  );
  assert.ok(result.error?.[1]?.message.includes("Private Software Group"));
});

test("a factsFairValue part needs the holding's fair value", () => {
  const result = run(mutate(holdco(), "holdings.items.0.fairValue", null), partsCase());
  assert.equal(result.success, false);
  assert.deepEqual(
    [result.error?.[0]?.rule, result.error?.[0]?.path],
    ["semantic.holdingWithoutValue", "holdings.items.0.fairValue"],
  );
});

test("parts that exclude everything leave nothing to value", () => {
  const allOut = mutate(partsCase(), "method.parts", [
    { kind: "excluded", holding: "Listed Industrial AB", rationale: "x" },
    { kind: "excluded", holding: "Listed Bank AB", rationale: "x" },
    { kind: "excluded", holding: "Private Software Group", rationale: "x" },
  ]);
  const result = run(holdco(), allOut);
  assert.equal(result.success, false);
  assert.deepEqual(
    [result.error?.[0]?.rule, result.error?.[0]?.path],
    ["semantic.navRequiresParts", "method.parts"],
  );
});

test("with parts, a holdings block with no items is enough for segments alone", () => {
  const segmentsOnly = mutate(partsCase(), "method.parts", [
    {
      kind: "segment",
      name: "Operations",
      metric: "EBITDA",
      metricValue: 100,
      multiple: { bear: 5, base: 6, bull: 7 },
      rationale: "x",
    },
  ]);
  const result = run(mutate(holdco(), "holdings.items", []), segmentsOnly);
  assert.ok(result.success, JSON.stringify(result.error));
});

test("a nav case against empty holdings fails at holdings.items, not on items[0]", () => {
  const result = run(mutate(holdco(), "holdings.items", []), loadFixture("holdco-nav.case"));
  assert.equal(result.success, false);
  assert.deepEqual(
    [result.error?.[0]?.rule, result.error?.[0]?.path],
    ["semantic.navRequiresHoldings", "holdings.items"],
  );

  const none = run(mutate(holdco(), "holdings", null), loadFixture("holdco-nav.case"));
  assert.deepEqual(
    [none.error?.[0]?.rule, none.error?.[0]?.path],
    ["semantic.navRequiresHoldings", "holdings"],
  );
});

test("a holding with a null fair value is rejected by name", () => {
  const result = run(
    mutate(holdco(), "holdings.items.2.fairValue", null),
    loadFixture("holdco-nav.case"),
  );
  assert.equal(result.success, false);
  assert.equal(result.error?.[0]?.rule, "semantic.holdingWithoutValue");
  assert.equal(result.error?.[0]?.path, "holdings.items.2.fairValue");
  assert.ok(result.error?.[0]?.message.includes("Private Software Group"));
});

test("a ticker mismatch and an unresolvable case source ref are both reported", () => {
  const wrong = mutate(
    mutate(loadFixture("acme-dcf.case"), "ticker", "ACMX"),
    "method.sourceRefs.1",
    "S77",
  );
  const result = run(acme(), wrong);
  assert.equal(result.success, false);
  assert.deepEqual(
    result.error?.map((e) => [e.rule, e.path]),
    [
      ["semantic.tickerMismatch", "ticker"],
      ["semantic.sourceRef", "method.sourceRefs.1"],
    ],
  );
});

test("the operating ltm row keeps its end date", () => {
  const result = run(acme(), loadFixture("acme-dcf.case"));
  assert.ok(result.success);
  const { valuation } = result.data;
  assert.equal(valuation.method, "dcf");
  if (valuation.method !== "dcf") return;
  assert.equal(valuation.financials.ltm?.endDate, "2026-06-30");
});

test("a tax override replaces the cash-flow rate on the dcf branch and is recorded", () => {
  const c = mutate(
    mutate(loadFixture("acme-dcf.case"), "overrides.taxRate", 0.236),
    "overrides.rationale",
    "reported rate depressed by an exempt gain",
  );
  const result = run(acme(), c);
  assert.ok(result.success, JSON.stringify(result.error));
  const { valuation, resolutions } = result.data;
  if (valuation.method !== "dcf") throw new Error("unreachable");
  assert.equal(valuation.costOfCapital.taxRateForCashFlows, 0.236);
  assert.equal(
    valuation.costOfCapital.taxRateForDiscounting,
    0.206,
    "the discount rate keeps its own",
  );
  assert.ok(
    resolutions.some((r) => r.kind === "taxRateOverridden" && r.from === 0.21 && r.to === 0.236),
  );
});

test("scenarios reach the domain as paths, without their rationale", () => {
  const paths = (g: number, m: number) => ({
    revenueGrowthPath: Array.from({ length: 10 }, () => g),
    ebitMarginPath: Array.from({ length: 10 }, () => m),
  });
  const c = mutate(loadFixture("acme-dcf.case"), "method.scenarios", {
    bear: { ...paths(0.01, 0.1), rationale: "down" },
    bull: { ...paths(0.08, 0.14), rationale: "up" },
  });
  const result = run(acme(), c);
  assert.ok(result.success, JSON.stringify(result.error));
  if (result.data.valuation.method !== "dcf") throw new Error("unreachable");
  assert.deepEqual(result.data.valuation.assumptions.scenarios, {
    bear: paths(0.01, 0.1),
    bull: paths(0.08, 0.14),
  });
  const none = run(acme(), loadFixture("acme-dcf.case"));
  if (none.data?.valuation.method !== "dcf") throw new Error("unreachable");
  assert.equal(none.data.valuation.assumptions.scenarios, null);
});

test("under a beta override the alternative is the beta facts resolved, unless they are equal", () => {
  const measured = mutate(acme(), "costOfCapital.betaCompany", 0.76);
  const override = (beta: number) =>
    mutate(
      mutate(loadFixture("acme-dcf.case"), "overrides.beta", beta),
      "overrides.rationale",
      "why",
    );
  const toSector = run(measured, override(1.1));
  if (toSector.data?.valuation.method !== "dcf") throw new Error("unreachable");
  assert.equal(toSector.data.valuation.costOfCapital.beta, 1.1);
  assert.equal(toSector.data.valuation.costOfCapital.alternativeBeta, 0.76);
  const toThird = run(measured, override(0.9));
  if (toThird.data?.valuation.method !== "dcf") throw new Error("unreachable");
  assert.equal(toThird.data.valuation.costOfCapital.alternativeBeta, 0.76);
  const same = run(measured, override(0.76));
  if (same.data?.valuation.method !== "dcf") throw new Error("unreachable");
  assert.equal(same.data.valuation.costOfCapital.alternativeBeta, null);
});

test("an excess-return case decodes against a bank's facts", () => {
  const r = run(loadFixture("nordbank.facts"), loadFixture("nordbank-excess.case"));
  assert.ok(r.success, JSON.stringify(r.error));
  const v = r.data.valuation;
  assert.equal(v.method, "excessReturn");
  if (v.method !== "excessReturn") return;
  assert.equal(v.tangibleBook, 9000);
  assert.equal(v.assumptions.payoutRatio, 0.6);
  assert.equal(v.assumptions.terminalGrowth, 0.02);
  assert.equal(v.assumptions.scenarios?.bear.rotePath[0], 0.12);
});

test("an excess-return case on facts without the block names the block", () => {
  const c = mutate(loadFixture("nordbank-excess.case"), "ticker", "ACME");
  const r = run(loadFixture("acme.facts"), c);
  assert.equal(r.success, false);
  assert.deepEqual(
    r.error?.map((e) => [e.file, e.rule, e.path]),
    [["facts", "semantic.excessReturnNeedsFinancialInstitution", "financialInstitution"]],
  );
});

test("a bank's facts are valued by excessReturn only", () => {
  const c = mutate(loadFixture("acme-dcf.case"), "ticker", "NORD");
  const r = run(loadFixture("nordbank.facts"), c);
  assert.equal(r.success, false);
  assert.deepEqual(
    r.error?.map((e) => [e.file, e.rule, e.path]),
    [["facts", "semantic.financialInstitutionNeedsExcessReturn", "financialInstitution"]],
  );
});
