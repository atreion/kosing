/**
 * FX sensitivity reruns the DCF under a translation shock. Base revenue
 * scales by the revenue factor and base costs (revenue less EBIT) by the
 * cost factor; the resulting change in base margin is applied to every
 * year's margin, so the shock is held for the whole projection. A pair is
 * every exposure in a currency other than the reporting one that states a
 * revenue share; a missing cost share counts as none.
 */

import type { Fx } from "../domain/company.ts";
import type { Currency } from "../domain/types.ts";
import { computeDcf, type DcfInputs } from "../math/dcf.ts";
import type { FxExposure, FxShock } from "../math/fx.ts";

export type FxBase = { readonly inputs: DcfInputs; readonly baseEbit: number };

export type FxSelection =
  | {
      readonly kind: "ready";
      readonly exposures: readonly FxExposure[];
      readonly revalue: (shock: FxShock) => number | null;
    }
  | { readonly kind: "unavailable"; readonly reason: "noDcfValuation" };

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

export function selectFx(fx: Fx, currency: Currency, dcf: FxBase | null): FxSelection {
  if (dcf === null) return { kind: "unavailable", reason: "noDcfValuation" };
  const exposures = fx.exposures.flatMap((e) =>
    e.currency === currency || e.revenueShare === null
      ? []
      : [
          {
            pair: `${e.currency}${currency}`,
            revenueShare: e.revenueShare,
            costShare: e.costShare ?? 0,
          },
        ],
  );
  return {
    kind: "ready",
    exposures,
    revalue: (shock) => {
      const r = computeDcf(shocked(dcf, shock));
      return r.kind === "value" ? r.valuePerShare : null;
    },
  };
}
