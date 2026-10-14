/**
 * Mid-cycle valuation for a cyclical: a normalised revenue base times a
 * through-the-cycle margin times an EV/EBIT multiple, bridged to equity and
 * per share, for each of bear, base and bull. The ordering bear <= base <=
 * bull follows from ordered inputs; nothing here enforces or clamps it.
 */

export type Triple = {
  readonly bear: number;
  readonly base: number;
  readonly bull: number;
};

export type NormalisedEarningsInputs = {
  readonly revenueBase: number;
  readonly netDebt: number;
  /** Deducted beside net debt: the multiple prices EBIT after IFRS 16, which carries no lease cost. */
  readonly leaseLiabilities: number;
  readonly shares: number;
  readonly ebitMargin: Triple;
  readonly evEbitMultiple: Triple;
};

export type ScenarioValue = {
  readonly ebit: number;
  readonly ev: number;
  readonly equity: number;
  readonly valuePerShare: number;
};

export type NormalisedEarningsResult = {
  readonly bear: ScenarioValue;
  readonly base: ScenarioValue;
  readonly bull: ScenarioValue;
};

function scenario(
  inputs: NormalisedEarningsInputs,
  margin: number,
  multiple: number,
): ScenarioValue {
  const ebit = inputs.revenueBase * margin;
  const ev = ebit * multiple;
  const equity = ev - inputs.netDebt - inputs.leaseLiabilities;
  return { ebit, ev, equity, valuePerShare: equity / inputs.shares };
}

export function computeNormalisedEarnings(
  inputs: NormalisedEarningsInputs,
): NormalisedEarningsResult {
  return {
    bear: scenario(inputs, inputs.ebitMargin.bear, inputs.evEbitMultiple.bear),
    base: scenario(inputs, inputs.ebitMargin.base, inputs.evEbitMultiple.base),
    bull: scenario(inputs, inputs.ebitMargin.bull, inputs.evEbitMultiple.bull),
  };
}
