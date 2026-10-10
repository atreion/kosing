/**
 * FX sensitivity reruns the DCF under a translation shock. Base revenue
 * scales by the revenue factor and base costs (revenue less EBIT) by the
 * cost factor; the resulting change in base margin is applied to every
 * year's margin, so the shock is held for the whole projection. A pair is
 * every exposure in a currency other than the reporting one.
 */

import type { Exposure, Fx } from "../domain/company.ts";
import type { Currency } from "../domain/types.ts";
import type { Resolution } from "../input/errors.ts";
import { computeDcf, type DcfInputs } from "../math/dcf.ts";
import type { FxExposure, FxShock } from "../math/fx.ts";

export type FxBase = { readonly inputs: DcfInputs; readonly baseEbit: number };

export type FxSelection =
  | {
      readonly kind: "ready";
      readonly exposures: readonly FxExposure[];
      readonly revalue: (shock: FxShock) => number | null;
      readonly resolutions: readonly Resolution[];
    }
  | {
      readonly kind: "unavailable";
      readonly reason: "noDcfValuation" | "nonPositiveBaseRevenue";
    };

function shocked(dcf: FxBase, shock: FxShock): DcfInputs {
  const revenue = dcf.inputs.revenueBase;
  const costs = revenue - dcf.baseEbit;
  const shockedRevenue = revenue * shock.revenueFactor;
  const shockedMargin = (shockedRevenue - costs * shock.costFactor) / shockedRevenue;
  const marginShift = shockedMargin - dcf.baseEbit / revenue;
  const [first, ...rest] = dcf.inputs.years.map((y) => ({
    ...y,
    ebitMargin: y.ebitMargin + marginShift,
  }));
  if (first === undefined) throw new Error("unreachable: years is NonEmpty");
  return { ...dcf.inputs, revenueBase: shockedRevenue, years: [first, ...rest] };
}

/**
 * A null share is unknown, and unknown is treated as no exposure through that
 * line, with a resolution saying so. Revenue and cost are handled alike.
 */
function shareOrZero(
  exposure: Exposure,
  field: "revenueShare" | "costShare",
  resolutions: Resolution[],
): number {
  const value = exposure[field];
  if (value !== null) return value;
  resolutions.push({ kind: "fxShareAssumedZero", currency: exposure.currency, field });
  return 0;
}

export function selectFx(fx: Fx, currency: Currency, dcf: FxBase | null): FxSelection {
  if (dcf === null) return { kind: "unavailable", reason: "noDcfValuation" };
  // The shock is a change in margin, which a base period without revenue does not have.
  if (dcf.inputs.revenueBase <= 0) return { kind: "unavailable", reason: "nonPositiveBaseRevenue" };
  const resolutions: Resolution[] = [];
  const exposures = fx.exposures
    .filter((e) => e.currency !== currency)
    .map((e) => ({
      pair: `${e.currency}${currency}`,
      revenueShare: shareOrZero(e, "revenueShare", resolutions),
      costShare: shareOrZero(e, "costShare", resolutions),
    }));
  return {
    kind: "ready",
    exposures,
    resolutions,
    revalue: (shock) => {
      const r = computeDcf(shocked(dcf, shock));
      return r.kind === "value" ? r.valuePerShare : null;
    },
  };
}
