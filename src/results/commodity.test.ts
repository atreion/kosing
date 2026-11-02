import assert from "node:assert/strict";
import { test } from "node:test";
import { computeMineValue } from "../math/mine.ts";
import { loadFixture, mutate } from "../test-fixtures.ts";
import { assertAllFinite, assertClose } from "../test-utils.ts";
import { valuate } from "../valuate.ts";

const facts = () => loadFixture("miner.facts");
const minerCase = () => loadFixture("miner-mine-nav.case");

function run(f: unknown = facts(), c: unknown = minerCase()) {
  const r = valuate(f, c);
  assert.ok(r.success, JSON.stringify(r.error));
  const v = r.data.valuation;
  if (v?.method !== "nav" || v.commodity === null) return assert.fail("expected a mine nav");
  return { results: r.data, nav: v, commodity: v.commodity };
}

test("the mines discount at the company's WACC on the US risk-free rate, made real", () => {
  const { commodity } = run();
  // Cost of equity 0.0519 + 1.3 x 0.05 = 0.1169; debt 0.06 x 0.7 = 0.042; 0.9/0.1 weights.
  assertClose(commodity.usdWacc, 0.10941, 1e-12);
  assertClose(commodity.realRate, 1.10941 / 1.0235 - 1, 1e-12);
});

test("a producing mine is its own NPV at the deck, valued from the facts' date", () => {
  const { commodity } = run();
  const north = commodity.mines[0];
  // 2026-10-01 is day 273 of 365.
  const timing = { realRate: commodity.realRate, valuationYear: 2026 + 273 / 365 };
  const expected = computeMineValue(
    {
      production: [
        { year: 2027, volume: 10 },
        { year: 2028, volume: 10 },
      ],
      byProducts: [],
      cashCostPerUnit: 30,
      royaltyRate: 0.05,
      royaltySteps: [],
      sustainingCapexPerUnit: 5,
      initialCapex: [{ year: 2026, amount: 100 }],
      openingTaxBase: 0,
      closureCost: 20,
      taxRate: 0.25,
      delayYears: 0,
    },
    80,
    timing,
  ).npv;
  assertClose(north?.valueUsd.base ?? Number.NaN, expected, 1e-9);
});

test("a feasibility mine is owned in part, risked at 0.35 and late in the bear case", () => {
  const { commodity } = run();
  const south = commodity.mines[1];
  assert.equal(south?.riskFactor, 0.35);
  const unrisked = run(facts(), mutate(minerCase(), "method.parts.1.stage", "producing"));
  const asProducer = unrisked.commodity.mines[1]?.valueUsd.base ?? Number.NaN;
  assertClose(south?.valueUsd.base ?? Number.NaN, asProducer * 0.35, 1e-9);
  const onTime = run(
    facts(),
    mutate(minerCase(), "method.parts.1.delayYears", { bear: 0, base: 0, bull: 0 }),
  );
  // Every cash flow moves two years later, so the bear value is discounted twice more.
  const late = onTime.commodity.mines[1]?.valueUsd.bear ?? Number.NaN;
  assertClose(
    south?.valueUsd.bear ?? Number.NaN,
    late / (1 + onTime.commodity.realRate) ** 2,
    1e-9,
  );
});

test("USD values convert at the facts' spot rate and net cash is the balance sheet's", () => {
  const { nav, commodity, results } = run();
  const north = nav.parts.find((p) => p.name === "North pit");
  assertClose(
    north?.value.base ?? Number.NaN,
    (commodity.mines[0]?.valueUsd.base ?? 0) / 0.65,
    1e-9,
  );
  assert.equal(nav.parentNetDebt, -200);
  assert.ok(results.resolutions.some((r) => r.kind === "navNetDebtFromBalanceSheet"));
});

test("a ceiling below the bull deck makes the contract book a cost; inside the collar it is nothing", () => {
  const { commodity, nav } = run();
  assert.equal(commodity.contractBookUsd?.base, 0);
  assert.ok((commodity.contractBookUsd?.bull ?? 0) < 0);
  assert.ok(nav.parts.some((p) => p.kind === "contractBook"));
});

test("the implied price is the deck that values the company at its price", () => {
  const { nav } = run();
  const atBase = mutate(facts(), "market.price", nav.valuePerShare);
  const { commodity } = run(atBase);
  assertClose(commodity.impliedPrice ?? Number.NaN, 80, 1e-6);
});

test("no implied price inside the bracket is reported, not guessed", () => {
  const r = valuate(mutate(facts(), "market.price", 1e6), minerCase());
  assert.ok(r.success);
  const v = r.data.valuation;
  if (v?.method !== "nav") return assert.fail();
  assert.equal(v.commodity?.impliedPrice, null);
  assert.ok(r.data.resolutions.some((x) => x.kind === "impliedCommodityPriceUnavailable"));
});

test("at a real rate above the brokers' 8%, NAV8 is the higher value", () => {
  const { nav, commodity } = run();
  assert.ok(commodity.realRate > 0.08);
  assert.ok(commodity.valuePerShareAt8PctReal > nav.valuePerShare);
});

test("a commodity producer gets the 40% hurdle and the results are finite", () => {
  const { results } = run();
  assert.equal(results.hurdle?.requiredDiscount, 0.4);
  assertAllFinite(results);
});

test("a company not reporting in USD needs a USD spot rate for its mines", () => {
  const r = valuate(mutate(facts(), "fx", null), minerCase());
  assert.equal(r.success, false);
  assert.ok(r.error?.some((e) => e.rule === "semantic.navPartNeedsSpotRate"));
});

test("a mine year before the facts' year is a stale plan", () => {
  const r = valuate(facts(), mutate(minerCase(), "method.parts.0.initialCapex.0.year", 2025));
  assert.equal(r.success, false);
  assert.equal(r.error?.[0]?.path, "method.parts.0.initialCapex.0.year");
});

const gold = {
  name: "gold",
  unit: "oz",
  priceDeck: { bear: 1000, base: 2000, bull: 3000 },
  rationale: "Moves with the main deck.",
};

function withGold(c: unknown = minerCase()): unknown {
  return mutate(c, "method.commodity.otherProducts", [gold]);
}

function northGoldByProduct(c: unknown): unknown {
  return mutate(c, "method.parts.0.byProducts", [
    {
      product: "gold",
      production: [
        { year: 2027, volume: 0.01 },
        { year: 2028, volume: 0.01 },
      ],
    },
  ]);
}

test("a by-product adds its revenue at its own deck in each scenario", () => {
  const plain = run().commodity.mines[0]?.valueUsd ?? assert.fail();
  const withCredit = run(facts(), northGoldByProduct(withGold())).commodity.mines[0]?.valueUsd;
  const gain = (k: "bear" | "base" | "bull") => (withCredit?.[k] ?? Number.NaN) - plain[k];
  // 0.01 Moz a year at the gold deck: the gain scales with the deck, after royalty and tax.
  assert.ok(gain("bear") > 0);
  assertClose(gain("bull") / gain("base"), 1.5, 1e-9);
  assertClose(gain("base") / gain("bear"), 2, 1e-9);
});

test("a mine of another product values at that product's deck", () => {
  const asGold = mutate(withGold(), "method.parts.0.product", "gold");
  const { commodity } = run(facts(), asGold);
  const atGold = commodity.mines[0]?.valueUsd.base ?? Number.NaN;
  const atUranium = run().commodity.mines[0]?.valueUsd.base ?? Number.NaN;
  assert.ok(atGold > atUranium * 10);
});

test("the implied price moves the main commodity and holds other products at base", () => {
  const c = northGoldByProduct(withGold());
  const { nav } = run(facts(), c);
  const atBase = mutate(facts(), "market.price", nav.valuePerShare);
  assertClose(run(atBase, c).commodity.impliedPrice ?? Number.NaN, 80, 1e-6);
});

test("products must be known, unique, and by-products only in the mine's years", () => {
  const rejects = (c: unknown, path: string) => {
    const r = valuate(facts(), c);
    assert.equal(r.success, false);
    assert.ok(
      r.error?.some((e) => e.path === path),
      JSON.stringify(r.error),
    );
  };
  rejects(mutate(minerCase(), "method.parts.0.product", "gold"), "method.parts.0.product");
  rejects(northGoldByProduct(minerCase()), "method.parts.0.byProducts.0.product");
  rejects(
    mutate(northGoldByProduct(withGold()), "method.parts.0.byProducts.0.production.1.year", 2030),
    "method.parts.0.byProducts.0.production.1.year",
  );
  rejects(
    mutate(withGold(), "method.commodity.otherProducts", [gold, gold]),
    "method.commodity.otherProducts.1.name",
  );
  rejects(
    mutate(withGold(), "method.commodity.otherProducts.0.name", "U3O8"),
    "method.commodity.otherProducts.0.name",
  );
});

const inventory = {
  kind: "inventory",
  name: "Drummed U3O8",
  volume: 1,
  costPerUnit: 50,
  taxRate: 0.25,
  rationale: "Held at the converter.",
};

test("inventory reprices with the deck in every scenario and in the implied price", () => {
  const doc = minerCase() as { method: { parts: unknown[] } };
  const withInventory = mutate(doc, "method.parts", [...doc.method.parts, inventory]);
  const { nav } = run(facts(), withInventory);
  const part = nav.parts.find((p) => p.kind === "inventory");
  // At 85-less-5: 80 x 1 - 0.25 x 30 = 72.5 USD m, in AUD at 0.65.
  assertClose(part?.value.base ?? Number.NaN, 72.5 / 0.65, 1e-9);
  assert.ok((part?.value.bull ?? 0) > (part?.value.base ?? 0));
  const atBase = run(mutate(facts(), "market.price", nav.valuePerShare), withInventory);
  assertClose(atBase.commodity.impliedPrice ?? Number.NaN, 80, 1e-6);
});

test("the rate-stress rows bracket the base value", () => {
  const { nav, commodity } = run();
  const [lower, same, higher] = commodity.realRateSensitivity;
  assertClose(same?.valuePerShare ?? Number.NaN, nav.valuePerShare, 1e-9);
  assertClose(lower?.realRate ?? Number.NaN, commodity.realRate - 0.01, 1e-12);
  assert.ok((lower?.valuePerShare ?? 0) > nav.valuePerShare);
  assert.ok((higher?.valuePerShare ?? Infinity) < nav.valuePerShare);
});
