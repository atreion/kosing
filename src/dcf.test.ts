import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeDcf,
  computeTerminalValue,
  type DcfAssumptions,
  projectCashFlows,
  projectYear,
  type TerminalValueMethod,
} from "./dcf.ts";
import {
  type DcfRawAssumptions,
  type DcfRawInputs,
  type DcfRawTerminalValueMethod,
  parseDcfAssumptions,
  parseDcfInputs,
} from "./dcf-parse.ts";
import { assertAllClose, assertClose, unwrap } from "./test-utils.ts";
import { parsePositiveNumber } from "./validate.ts";

const baseRawInputs: DcfRawInputs = {
  revenueBase: 1000,
  taxRate: 0,
  wacc: 0.1,
  netDebt: 0,
  dilutedSharesOutstandingMillions: 100,
  nonOperatingAssets: 0,
  currency: "SEK",
  unit: "millions",
};
const baseInputs = unwrap(parseDcfInputs(baseRawInputs));

const perpetuity: DcfRawTerminalValueMethod = { kind: "perpetuityGrowth", growthRate: 0.025 };

const baseRawAssumptions: DcfRawAssumptions = {
  explicitPeriodYears: 1,
  fadePeriodYears: 1,
  revenueGrowthPath: [0, 0],
  ebitMarginPath: [0.1, 0.1],
  capexPercentOfRevenuePath: [0, 0],
  daPercentOfRevenuePath: [0, 0],
  workingCapitalPercentOfRevenue: 0,
  terminalValueMethod: perpetuity,
};

function makeAssumptions(
  terminalValueMethod: DcfRawTerminalValueMethod,
  daPercentOfRevenue = 0,
): DcfAssumptions {
  return unwrap(
    parseDcfAssumptions(
      {
        ...baseRawAssumptions,
        daPercentOfRevenuePath: [daPercentOfRevenue, daPercentOfRevenue],
        terminalValueMethod,
      },
      baseInputs.wacc,
    ),
  );
}

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
      { taxRate: 0.2, wacc: 0.1, workingCapitalPercentOfRevenue: 0.02 },
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
    const assumptions = unwrap(
      parseDcfAssumptions(
        { ...baseRawAssumptions, revenueGrowthPath: [0.1, 0.05] },
        baseInputs.wacc,
      ),
    );
    const actual = projectCashFlows(baseInputs, assumptions);
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

describe("computeTerminalValue", () => {
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
      assertClose(computeTerminalValue(finalYear, wacc, method), expected, 1e-9);
    });
  }
});

describe("computeDcf", () => {
  const pv2 = 1 / 1.1 ** 2;
  const tolerance = 1e-9;

  it("discounts the Gordon perpetuity to present value", () => {
    const result = computeDcf(baseInputs, makeAssumptions(perpetuity));
    const expectedTerminalValue = ((100 * 1.025) / 0.075) * pv2;

    assertClose(result.terminalValue, expectedTerminalValue, tolerance);
    assertClose(result.enterpriseValue, 100 / 1.1 + 100 * pv2 + expectedTerminalValue, tolerance);
  });

  it("applies an exit multiple to final-year ebit", () => {
    const result = computeDcf(
      baseInputs,
      makeAssumptions({ kind: "exitMultiple", multiple: 10, basis: "evEbit" }),
    );

    assertClose(result.terminalValue, 1000 * pv2, tolerance);
  });

  it("applies an exit multiple to final-year ebitda", () => {
    const result = computeDcf(
      baseInputs,
      makeAssumptions({ kind: "exitMultiple", multiple: 8, basis: "evEbitda" }, 0.05),
    );

    assertClose(result.terminalValue, 1200 * pv2, tolerance);
  });

  it("emits a note when terminal value exceeds 75% of enterprise value", () => {
    const result = computeDcf(
      baseInputs,
      makeAssumptions({ kind: "perpetuityGrowth", growthRate: 0.07 }),
    );

    assert.ok(result.terminalValuePercentOfEv > 0.75);
    assert.deepEqual(result.notes, [
      { kind: "terminalValueDominates", percentOfEv: result.terminalValuePercentOfEv },
    ]);
  });

  it("subtracts net debt in the equity bridge", () => {
    const result = computeDcf({ ...baseInputs, netDebt: 200 }, makeAssumptions(perpetuity));

    assertClose(result.equityValue, result.enterpriseValue - 200, tolerance);
  });

  it("adds non-operating assets in the equity bridge", () => {
    const result = computeDcf(
      { ...baseInputs, nonOperatingAssets: 50 },
      makeAssumptions(perpetuity),
    );

    assertClose(result.equityValue, result.enterpriseValue + 50, tolerance);
  });
});
