import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BalanceSheetItems,
  FxLayer,
  HistoricalPriceRanges,
  MarketData,
  Multiples,
  WaccRawInputs,
} from "./market.ts";

const market = {
  as_of: "2026-10-01",
  share_price: 212,
  currency: "SEK",
  market_cap: 24000,
  enterprise_value: 26000,
  net_debt: 2000,
  shares_outstanding_m: 113.2,
  shares_diluted_m: null,
  source_ref: "S2",
};

test("market data parses with a null diluted share count", () => {
  assert.equal(MarketData.safeParse(market).success, true);
});

test("market data without net_debt is rejected", () => {
  const { net_debt: _nd, ...bad } = market;
  assert.equal(MarketData.safeParse(bad).success, false);
});

test("a null enterprise value parses but an absent one does not", () => {
  assert.equal(MarketData.safeParse({ ...market, enterprise_value: null }).success, true);
  const { enterprise_value: _ev, ...bad } = market;
  assert.equal(MarketData.safeParse(bad).success, false);
});

test("a share price must be above zero", () => {
  assert.equal(MarketData.safeParse({ ...market, share_price: 0 }).success, false);
  assert.equal(MarketData.safeParse({ ...market, market_cap: 0 }).success, true);
});

const wacc = {
  risk_free_rate: 0.025,
  risk_free_basis: "Swedish 10-year government bond",
  erp: 0.055,
  beta_company: null,
  beta_sector: 1.1,
  tax_rate_effective: 0.21,
  tax_rate_statutory: 0.206,
  pretax_cost_of_debt: 0.04,
  capital_structure: {
    equity_weight_market: 0.9,
    debt_weight_market: 0.1,
    basis_date: "2026-10-01",
  },
  source_refs: ["S3"],
};

test("wacc raw inputs accept a null company beta", () => {
  assert.equal(WaccRawInputs.safeParse(wacc).success, true);
});

test("a capital structure without its basis_date is rejected", () => {
  const { basis_date: _bd, ...structure } = wacc.capital_structure;
  assert.equal(WaccRawInputs.safeParse({ ...wacc, capital_structure: structure }).success, false);
});

test("a tax rate outside zero to one is rejected", () => {
  assert.equal(WaccRawInputs.safeParse({ ...wacc, tax_rate_effective: 1.2 }).success, false);
  assert.equal(WaccRawInputs.safeParse({ ...wacc, tax_rate_statutory: -0.1 }).success, false);
});

test("source_refs must name at least one source", () => {
  assert.equal(WaccRawInputs.safeParse({ ...wacc, source_refs: [] }).success, false);
});

test("multiples parse with every ratio null", () => {
  const multiples = {
    as_of: "2026-10-01",
    pe_trailing: null,
    ev_ebit: null,
    source_ref: "S2",
  };
  assert.equal(Multiples.safeParse(multiples).success, true);
});

test("historical price ranges carry a currency on the share price band", () => {
  const ranges = {
    share_price: { "5y_low": 120, "5y_high": 260, currency: "SEK" },
    pe_trailing: { "10y_low": 9, "10y_high": 24 },
    source_refs: ["S4"],
  };
  assert.equal(HistoricalPriceRanges.safeParse(ranges).success, true);
  const { currency: _c, ...noCurrency } = ranges.share_price;
  assert.equal(
    HistoricalPriceRanges.safeParse({ ...ranges, share_price: noCurrency }).success,
    false,
  );
});

test("balance sheet items reject negative debt", () => {
  const sheet = {
    as_of_date: "2026-06-30",
    currency: "SEK",
    unit: "millions",
    cash_and_equivalents: 4200,
    total_debt: 9100,
    source_ref: "S5",
  };
  assert.equal(BalanceSheetItems.safeParse(sheet).success, true);
  assert.equal(BalanceSheetItems.safeParse({ ...sheet, total_debt: -1 }).success, false);
});

test("an fx layer that does not apply still names both currencies", () => {
  const fx = { applies: false, reporting_currency: "SEK", trading_currency: "SEK" };
  assert.equal(FxLayer.safeParse(fx).success, true);
  const { trading_currency: _tc, ...bad } = fx;
  assert.equal(FxLayer.safeParse(bad).success, false);
});

test("an fx pair is six uppercase letters and a rate is above zero", () => {
  const fx = {
    applies: true,
    reporting_currency: "SEK",
    trading_currency: "SEK",
    sek_relevant_pairs: ["EURSEK"],
    spot_rates: [{ pair: "EURSEK", rate: 11.2, as_of: "2026-10-01", source_ref: "S6" }],
  };
  assert.equal(FxLayer.safeParse(fx).success, true);
  assert.equal(FxLayer.safeParse({ ...fx, sek_relevant_pairs: ["EUR/SEK"] }).success, false);
  assert.equal(
    FxLayer.safeParse({
      ...fx,
      spot_rates: [{ pair: "EURSEK", rate: 0, as_of: "2026-10-01", source_ref: "S6" }],
    }).success,
    false,
  );
});
