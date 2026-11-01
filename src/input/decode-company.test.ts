import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFixture, mutate } from "../test-fixtures.ts";
import { decodeCompany } from "./decode-company.ts";
import { FactsSchema } from "./facts.ts";

function parse(doc: unknown) {
  const result = FactsSchema.safeParse(doc);
  assert.ok(result.success, JSON.stringify(result.error?.issues.slice(0, 3)));
  return result.data;
}

const acme = () => loadFixture("acme.facts");
const dual = () => loadFixture("dual.facts");

test("acme decodes with the sector beta and derived net debt recorded", () => {
  const result = decodeCompany(parse(acme()));
  assert.ok(result.success);
  const { company, resolutions } = result.data;
  assert.equal(company.costOfCapital.beta, 1.1);
  assert.equal(company.netDebt, 4100 - 1900 - 200);
  assert.deepEqual(company.otherClaims, {
    operatingLeaseLiabilities: 700,
    pensionObligations: 450,
    nonControllingInterests: null,
  });
  assert.deepEqual(resolutions.map((r) => r.kind).sort(), ["betaFromSector", "netDebtDerived"]);
});

test("diluted shares win over outstanding", () => {
  const diluted = decodeCompany(parse(acme()));
  assert.equal(diluted.data?.company.market.shares, 115);
  const dualShares = decodeCompany(parse(dual()));
  assert.equal(dualShares.data?.company.market.shares, 48);
});

test("zero is a share count, and a zero share count is an error at the field that supplied it", () => {
  const diluted = decodeCompany(parse(mutate(acme(), "market.sharesDilutedM", 0)));
  assert.equal(diluted.success, false);
  assert.deepEqual(
    diluted.error?.map((e) => [e.rule, e.path]),
    [["semantic.zeroShares", "market.sharesDilutedM"]],
    "0 was used as the diluted count, not treated as missing",
  );

  const outstanding = decodeCompany(
    parse(mutate(mutate(acme(), "market.sharesDilutedM", null), "market.sharesOutstandingM", 0)),
  );
  assert.deepEqual(
    outstanding.error?.map((e) => [e.rule, e.path]),
    [["semantic.zeroShares", "market.sharesOutstandingM"]],
  );
});

test("totalEquity rescales with the other aggregates", () => {
  const result = decodeCompany(parse(dual()));
  assert.equal(result.data?.company.balanceSheet.totalEquity, 400);
  const nothing = decodeCompany(parse(mutate(acme(), "balanceSheet.totalEquity", null)));
  assert.equal(nothing.data?.company.balanceSheet.totalEquity, null);
});

test("a null diluted count falls back and records why", () => {
  const result = decodeCompany(parse(mutate(acme(), "market.sharesDilutedM", null)));
  assert.equal(result.data?.company.market.shares, 113.2);
  assert.ok(
    result.data?.resolutions.some((r) => r.kind === "sharesFromOutstanding" && r.value === 113.2),
  );
});

test("fiscal years are sorted ascending regardless of file order", () => {
  const result = decodeCompany(parse(dual()));
  assert.deepEqual(
    result.data?.company.financials.fiscalYears.map((y) => y.fy),
    [2024, 2025],
  );
});

test("thousands are rescaled on every aggregate and no per-share figure", () => {
  const result = decodeCompany(parse(dual()));
  assert.ok(result.success);
  const { company, resolutions } = result.data;
  assert.equal(company.financials.fiscalYears[0].revenue, 1100);
  assert.equal(company.balanceSheet.totalDebt, 500);
  assert.equal(company.otherClaims.operatingLeaseLiabilities, 80);
  assert.equal(company.financials.fiscalYears[0].fy, 2024, "fy is not a monetary figure");
  assert.ok(
    resolutions.some(
      (r) => r.kind === "unitRescaled" && r.from === "thousands" && r.divisor === 1000,
    ),
  );
});

test("ones rescale holdings too, and leave price alone", () => {
  const holdco = mutate(
    mutate(loadFixture("holdco.facts"), "unit", "ones"),
    "holdings.items.0.fairValue",
    18_000_000_000,
  );
  const result = decodeCompany(parse(holdco));
  assert.ok(result.success);
  assert.equal(result.data.company.holdings?.items[0]?.fairValue, 18000);
  assert.equal(result.data.company.holdings?.parentNetDebt, 300 / 1_000_000);
  assert.equal(result.data.company.market.price, 98, "price is per share and never rescaled");
});

test("a price in another currency is converted using the pair in either direction", () => {
  const result = decodeCompany(parse(dual()));
  assert.ok(result.success);
  assert.ok(Math.abs(result.data.company.market.price - 150 * 0.088) < 1e-12);
  const conversion = result.data.resolutions.find((r) => r.kind === "priceConvertedToReporting");
  assert.deepEqual(conversion, {
    kind: "priceConvertedToReporting",
    pair: "SEKEUR",
    rate: 0.088,
    inverted: false,
  });

  const flipped = mutate(
    mutate(dual(), "fx.spotRates.0.pair", "EURSEK"),
    "fx.spotRates.0.rate",
    1 / 0.088,
  );
  const inverted = decodeCompany(parse(flipped));
  assert.ok(inverted.success);
  assert.ok(Math.abs(inverted.data.company.market.price - 150 * 0.088) < 1e-9);
  assert.equal(
    inverted.data.resolutions.find((r) => r.kind === "priceConvertedToReporting")?.inverted,
    true,
  );
});

test("a statutory tax rate wins; a null one falls back and records why", () => {
  const statutory = decodeCompany(parse(acme()));
  assert.equal(statutory.data?.company.costOfCapital.taxRateForDiscounting, 0.206);
  assert.equal(statutory.data?.company.costOfCapital.taxRateForCashFlows, 0.21);

  const effective = decodeCompany(parse(mutate(acme(), "costOfCapital.taxRateStatutory", null)));
  assert.equal(effective.data?.company.costOfCapital.taxRateForDiscounting, 0.21);
  assert.ok(effective.data?.resolutions.some((r) => r.kind === "taxRateFromEffective"));
});

test("both betas null is a decode error naming the path", () => {
  const result = decodeCompany(parse(mutate(acme(), "costOfCapital.betaSector", null)));
  assert.equal(result.success, false);
  assert.deepEqual(result.error?.[0], {
    file: "facts",
    layer: "semantic",
    rule: "semantic.noBeta",
    path: "costOfCapital.betaCompany",
    message: result.error?.[0]?.message,
  });
});

test("estimates are aggregates and rescale with the rows; eps is per share and does not", () => {
  const result = decodeCompany(parse(dual()));
  assert.ok(result.success);
  assert.deepEqual(result.data.company.estimates, [
    { fy: 2026, revenue: 1300, ebit: 160, eps: 2.4, basis: "adjusted" },
  ]);
});

test("quoted per-share figures convert with the price; reported ones do not", () => {
  const result = decodeCompany(parse(dual()));
  assert.ok(result.success);
  const { market, historicalRanges, estimates } = result.data.company;
  assert.ok(Math.abs((market.week52High ?? 0) - 180 * 0.088) < 1e-12);
  assert.ok(Math.abs((market.week52Low ?? 0) - 120 * 0.088) < 1e-12);
  assert.ok(Math.abs((historicalRanges?.sharePrice.y5Low ?? 0) - 100 * 0.088) < 1e-12);
  assert.ok(Math.abs((historicalRanges?.sharePrice.y5High ?? 0) - 200 * 0.088) < 1e-12);
  assert.equal(historicalRanges?.peTrailing.y5Low, 12, "a multiple is a ratio, not a price");
  assert.equal(estimates[0]?.eps, 2.4, "eps is reported in the reporting currency already");
});

test("the beta not used is kept only when the measured beta won and a sector beta exists", () => {
  const sectorUsed = decodeCompany(parse(acme()));
  assert.equal(
    sectorUsed.data?.company.costOfCapital.alternativeBeta,
    null,
    "sector beta used, nothing else to offer",
  );
  const measured = decodeCompany(parse(mutate(acme(), "costOfCapital.betaCompany", 0.76)));
  assert.equal(measured.data?.company.costOfCapital.beta, 0.76);
  assert.equal(measured.data?.company.costOfCapital.alternativeBeta, 1.1);
  const noSector = decodeCompany(
    parse(
      mutate(mutate(acme(), "costOfCapital.betaCompany", 0.76), "costOfCapital.betaSector", null),
    ),
  );
  assert.equal(noSector.data?.company.costOfCapital.alternativeBeta, null);
});

test("a bank's block is decoded with aggregates scaled to millions", () => {
  const thousands = mutate(
    mutate(loadFixture("nordbank.facts"), "unit", "thousands"),
    "financialInstitution.tangibleBookEquity",
    9_000_000,
  );
  const r = decodeCompany(parse(thousands));
  assert.ok(r.success, JSON.stringify(r.error));
  assert.equal(r.data.company.financialInstitution?.tangibleBookEquity, 9000);
  assert.equal(r.data.company.financialInstitution?.capitalRatio, 0.175, "ratios are not scaled");
  const acmeResult = decodeCompany(parse(acme()));
  assert.ok(acmeResult.success);
  assert.equal(acmeResult.data.company.financialInstitution, null);
});

test("a dividend gone ex but unpaid is net debt, for the company and a holding company's parent", () => {
  const result = decodeCompany(parse(mutate(acme(), "balanceSheet.dividendPayable", 300)));
  assert.ok(result.success);
  assert.equal(result.data.company.netDebt, 4100 - 1900 - 200 + 300);
  const holdco = loadFixture("holdco.facts");
  const parent = decodeCompany(parse(mutate(holdco, "balanceSheet.dividendPayable", 50)));
  assert.ok(parent.success);
  assert.equal(parent.data.company.holdings?.parentNetDebt, 300 + 50);
});

test("a financial institution carries its dividend in tangible book, not as payable", () => {
  const bank = mutate(loadFixture("nordbank.facts"), "balanceSheet.dividendPayable", 10);
  assert.equal(FactsSchema.safeParse(bank).success, false);
});

test("cash raised after the balance sheet comes off net debt, for the company and a parent", () => {
  const result = decodeCompany(parse(mutate(acme(), "balanceSheet.cashAfterBalanceSheet", 250)));
  assert.ok(result.success);
  assert.equal(result.data.company.netDebt, 4100 - 1900 - 200 - 250);
  const holdco = loadFixture("holdco.facts");
  const parent = decodeCompany(parse(mutate(holdco, "balanceSheet.cashAfterBalanceSheet", 40)));
  assert.ok(parent.success);
  assert.equal(parent.data.company.holdings?.parentNetDebt, 300 - 40);
  const bank = mutate(loadFixture("nordbank.facts"), "balanceSheet.cashAfterBalanceSheet", 10);
  assert.equal(FactsSchema.safeParse(bank).success, false, "a financial institution keeps it at 0");
});

test("lease payments, basis changes and a run-rate dividend are decoded", () => {
  const edited = mutate(
    mutate(mutate(acme(), "financials.ltm.leasePayments", -120), "financials.basisChanges", [
      { asOf: "2026-03-31", description: "Robotics discontinued", sourceRef: "S1" },
    ]),
    "market.dividendPerShareRunRate",
    4,
  );
  const result = decodeCompany(parse(edited));
  assert.ok(result.success);
  const { company } = result.data;
  assert.equal(company.financials.ltm?.leasePayments, -120);
  assert.deepEqual(company.financials.basisChanges, [
    { asOf: "2026-03-31", description: "Robotics discontinued" },
  ]);
  assert.equal(company.market.dividendPerShareRunRate, 4);
});
