import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type DcfRawAssumptions,
  type DcfRawInputs,
  type DcfRawTerminalValueMethod,
  type DcfValidationError,
  parseDcfAssumptions,
  parseDcfInputs,
} from "./dcf-parse.ts";
import { unwrap } from "./test-utils.ts";
import type { ValidationError } from "./validate.ts";

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

type RejectedInputsCase = {
  readonly desc: string;
  readonly raw: DcfRawInputs;
  readonly expected: ValidationError;
};

describe("parseDcfInputs", () => {
  it("accepts the base inputs unchanged", () => {
    assert.deepEqual(parseDcfInputs(baseRawInputs), { ok: true, value: baseRawInputs });
  });

  const cases: readonly RejectedInputsCase[] = [
    {
      desc: "rejects a negative revenue base",
      raw: { ...baseRawInputs, revenueBase: -1 },
      expected: { kind: "notNonNegative", name: "revenueBase", value: -1 },
    },
    {
      desc: "rejects a tax rate above one",
      raw: { ...baseRawInputs, taxRate: 1.5 },
      expected: { kind: "notUnitInterval", name: "taxRate", value: 1.5 },
    },
    {
      desc: "rejects a zero wacc",
      raw: { ...baseRawInputs, wacc: 0 },
      expected: { kind: "notPositive", name: "wacc", value: 0 },
    },
    {
      desc: "rejects zero diluted shares",
      raw: { ...baseRawInputs, dilutedSharesOutstandingMillions: 0 },
      expected: { kind: "notPositive", name: "dilutedSharesOutstandingMillions", value: 0 },
    },
  ];

  for (const { desc, raw, expected } of cases) {
    it(desc, () => {
      assert.deepEqual(parseDcfInputs(raw), { ok: false, error: expected });
    });
  }
});

type RejectedAssumptionsCase = {
  readonly desc: string;
  readonly raw: DcfRawAssumptions;
  readonly expected: DcfValidationError;
};

describe("parseDcfAssumptions", () => {
  it("zips the paths into one row per year", () => {
    const assumptions = unwrap(
      parseDcfAssumptions(
        {
          ...baseRawAssumptions,
          revenueGrowthPath: [0.1, 0.05],
          ebitMarginPath: [0.3, 0.25],
          capexPercentOfRevenuePath: [0.05, 0.04],
          daPercentOfRevenuePath: [0.04, 0.03],
        },
        baseInputs.wacc,
      ),
    );

    assert.deepEqual(assumptions.yearlyAssumptions, [
      {
        revenueGrowth: 0.1,
        ebitMargin: 0.3,
        capexPercentOfRevenue: 0.05,
        daPercentOfRevenue: 0.04,
      },
      {
        revenueGrowth: 0.05,
        ebitMargin: 0.25,
        capexPercentOfRevenue: 0.04,
        daPercentOfRevenue: 0.03,
      },
    ]);
  });

  it("brands the exit multiple", () => {
    const assumptions = unwrap(
      parseDcfAssumptions(
        {
          ...baseRawAssumptions,
          terminalValueMethod: { kind: "exitMultiple", multiple: 10, basis: "evEbitda" },
        },
        baseInputs.wacc,
      ),
    );

    assert.deepEqual(assumptions.terminalValueMethod, {
      kind: "exitMultiple",
      multiple: 10,
      basis: "evEbitda",
    });
  });

  const cases: readonly RejectedAssumptionsCase[] = [
    {
      desc: "rejects a zero explicit period",
      raw: { ...baseRawAssumptions, explicitPeriodYears: 0 },
      expected: { kind: "notPositiveInteger", name: "explicitPeriodYears", value: 0 },
    },
    {
      desc: "rejects a fractional explicit period",
      raw: { ...baseRawAssumptions, explicitPeriodYears: 1.5 },
      expected: { kind: "notPositiveInteger", name: "explicitPeriodYears", value: 1.5 },
    },
    {
      desc: "rejects a negative fade period",
      raw: { ...baseRawAssumptions, fadePeriodYears: -1 },
      expected: { kind: "notNonNegativeInteger", name: "fadePeriodYears", value: -1 },
    },
    {
      desc: "rejects a path shorter than the projection",
      raw: { ...baseRawAssumptions, ebitMarginPath: [0.1] },
      expected: { kind: "wrongLength", name: "ebitMarginPath", actual: 1, expected: 2 },
    },
    {
      desc: "rejects a path longer than the projection",
      raw: { ...baseRawAssumptions, daPercentOfRevenuePath: [0, 0, 0] },
      expected: { kind: "wrongLength", name: "daPercentOfRevenuePath", actual: 3, expected: 2 },
    },
    {
      desc: "rejects terminal growth equal to wacc",
      raw: {
        ...baseRawAssumptions,
        terminalValueMethod: { kind: "perpetuityGrowth", growthRate: 0.1 },
      },
      expected: { kind: "terminalGrowthNotBelowWacc", growthRate: 0.1, wacc: 0.1 },
    },
    {
      desc: "rejects terminal growth above wacc",
      raw: {
        ...baseRawAssumptions,
        terminalValueMethod: { kind: "perpetuityGrowth", growthRate: 0.12 },
      },
      expected: { kind: "terminalGrowthNotBelowWacc", growthRate: 0.12, wacc: 0.1 },
    },
    {
      desc: "rejects a zero exit multiple",
      raw: {
        ...baseRawAssumptions,
        terminalValueMethod: { kind: "exitMultiple", multiple: 0, basis: "evEbit" },
      },
      expected: { kind: "notPositive", name: "multiple", value: 0 },
    },
  ];

  for (const { desc, raw, expected } of cases) {
    it(desc, () => {
      assert.deepEqual(parseDcfAssumptions(raw, baseInputs.wacc), { ok: false, error: expected });
    });
  }
});
