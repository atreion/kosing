/**
 * Translation sensitivity: when a currency the company earns or spends in
 * moves by pct against the reporting currency, revenue in it translates to
 * (1 + pct x revenueShare) of itself and costs to (1 + pct x costShare).
 * What that does to value is the caller's model; this module only builds
 * the shock per pair and move and collects the revaluations.
 */

export type FxExposure = {
  readonly pair: string;
  readonly revenueShare: number;
  readonly costShare: number;
};

export type FxShock = {
  readonly revenueFactor: number;
  readonly costFactor: number;
};

export type FxMove = { readonly pct: number; readonly valuePerShare: number | null };

export type FxPairResult = { readonly pair: string; readonly moves: readonly FxMove[] };

export function shockFor(exposure: FxExposure, pct: number): FxShock {
  return {
    revenueFactor: 1 + pct * exposure.revenueShare,
    costFactor: 1 + pct * exposure.costShare,
  };
}

export function computeFxSensitivity(
  exposures: readonly FxExposure[],
  moves: readonly number[],
  revalue: (shock: FxShock) => number | null,
): readonly FxPairResult[] {
  return exposures.map((exposure) => ({
    pair: exposure.pair,
    moves: moves.map((pct) => ({ pct, valuePerShare: revalue(shockFor(exposure, pct)) })),
  }));
}
