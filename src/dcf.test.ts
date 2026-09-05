import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type DcfAssumptions,
  type DcfInputs,
  projectCashFlows,
  projectYear,
  type TerminalValueMethod,
  terminalValue,
} from "./dcf.ts";
import { assertAllClose, assertClose, unwrap } from "./test-utils.ts";
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
      terminalValueMethod: { kind: "perpetuityGrowth", growthRate: 0.025 },
    };

    const actual = projectCashFlows(inputs, assumptions);
    const expected = [1100, 1155];

    assert.deepEqual(
      actual.map((row) => row.revenue),
      expected,
    );
  });
});

type TerminalValueCase = {
  readonly desc: string;
  readonly method: TerminalValueMethod;
  readonly expected: number;
};

describe("terminalValue", () => {
  const multiple = unwrap(parsePositiveNumber(10, "multiple"));
  const finalYear = { ebit: 300, ebitda: 340, fcff: 200 };
  const wacc = 0.08;
  const cases: readonly TerminalValueCase[] = [
    {
      desc: "perpetuity growth applies Gordon formula",
      method: { kind: "perpetuityGrowth", growthRate: 0.02 },
      expected: 3400,
    },
    {
      desc: "zero growth reduces to fcff over wacc",
      method: { kind: "perpetuityGrowth", growthRate: 0 },
      expected: 2500,
    },
    {
      desc: "exit multiple on ebit",
      method: { kind: "exitMultiple", multiple, basis: "evEbit" },
      expected: 3000,
    },
    {
      desc: "exit multiple on ebitda",
      method: { kind: "exitMultiple", multiple, basis: "evEbitda" },
      expected: 3400,
    },
    {
      desc: "exit multiple on fcff",
      method: { kind: "exitMultiple", multiple, basis: "evFcff" },
      expected: 2000,
    },
  ];

  for (const { desc, method, expected } of cases) {
    it(desc, () => {
      assertClose(terminalValue(finalYear, wacc, method), expected, 1e-9);
    });
  }
});
