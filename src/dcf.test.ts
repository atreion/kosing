import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type DcfAssumptions, type DcfInputs, projectCashFlows, projectYear } from "./dcf.ts";
import { assertAllClose, unwrap } from "./test-utils.ts";
import {
  parseNonNegativeInteger,
  parseNonNegativeNumber,
  parsePositiveInteger,
  parsePositiveNumber,
  parseUnitInterval,
} from "./validate.ts";

describe("projectYear", () => {
  it("constructs every field for year one", () => {
    const actual = projectYear(
      1000,
      1,
      {
        revenueGrowth: 0.1,
        ebitMargin: 0.3,
        capexPercentOfRevenue: 0.05,
        daPercentOfRevenue: 0.04,
      },
      { taxRate: 0.2, wacc: 0.1 },
      0.02,
    );

    const expected = {
      year: 1,
      revenue: 1100,
      ebit: 330,
      ebitda: 374,
      nopat: 264,
      da: 44,
      capex: 55,
      changeInWorkingCapital: 2,
      fcff: 251,
      discountFactor: 1 / 1.1,
      pvFcff: 251 / 1.1,
    };

    assertAllClose(actual, expected, 1e-9);
  });
});

describe("projectCashFlows", () => {
  it("compounds revenue across years", () => {
    const inputs: DcfInputs = {
      revenueBase: unwrap(parseNonNegativeNumber(1000, "revenueBase")),
      taxRate: unwrap(parseUnitInterval(0, "taxRate")),
      wacc: unwrap(parsePositiveNumber(0.1, "wacc")),
      netDebt: 0,
      dilutedSharesOutstandingMillions: unwrap(
        parsePositiveNumber(100, "dilutedSharesOutstandingMillions"),
      ),
      nonOperatingAssets: 0,
      currency: "SEK",
      unit: "millions",
    };
    const assumptions: DcfAssumptions = {
      explicitPeriodYears: unwrap(parsePositiveInteger(1, "explicitPeriodYears")),
      fadePeriodYears: unwrap(parseNonNegativeInteger(1, "fadePeriodYears")),
      yearlyAssumptions: [
        {
          revenueGrowth: 0.1,
          ebitMargin: 0,
          capexPercentOfRevenue: 0,
          daPercentOfRevenue: 0,
        },
        {
          revenueGrowth: 0.05,
          ebitMargin: 0,
          capexPercentOfRevenue: 0,
          daPercentOfRevenue: 0,
        },
      ],
      workingCapitalPercentOfRevenue: 0,
      terminalValueMethod: { method: "perpetuityGrowth", growthRate: 0.025 },
    };

    const actual = projectCashFlows(inputs, assumptions);
    const expected = [1100, 1155];

    assert.deepEqual(
      actual.map((row) => row.revenue),
      expected,
    );
  });
});
