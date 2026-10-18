/**
 * The required discount: how far below base value a price must be before a
 * name may be accumulated. The table is the investor's, stated in the data
 * repo's lenses/investor.md; this module is where it is applied.
 */

import type { AiExposure, Classification } from "../domain/types.ts";

/** Classifications with no valuation method have no entry, so they have no discount. */
const CLASSIFICATION_DISCOUNT: Readonly<Record<Classification, number | null>> = {
  qualityCompounder: 0.25,
  garp: 0.3,
  holdingCompany: 0.3,
  specialSituation: 0.35,
  valueCyclical: 0.4,
  bankInsurer: 0.25,
  reitUtility: null,
  saasPreProfit: null,
  commodityProducer: null,
};

const AI_EXPOSURE_ADD_ON: Readonly<Record<AiExposure, number>> = {
  direct: 0.15,
  picksAndShovels: 0.1,
  wealthEffect: 0.05,
  disruption: 0.05,
  secondOrderOnly: 0,
};

export type RequiredDiscount = {
  readonly classificationDiscount: number;
  readonly aiExposureAddOn: number;
  readonly requiredDiscount: number;
};

export function requiredDiscount(
  classification: Classification,
  aiExposure: AiExposure,
): RequiredDiscount | null {
  const classificationDiscount = CLASSIFICATION_DISCOUNT[classification];
  if (classificationDiscount === null) return null;
  const aiExposureAddOn = AI_EXPOSURE_ADD_ON[aiExposure];
  return {
    classificationDiscount,
    aiExposureAddOn,
    requiredDiscount: classificationDiscount + aiExposureAddOn,
  };
}

export type HurdleInputs = {
  readonly requiredDiscount: number;
  readonly baseValue: number;
  readonly price: number;
};

export type HurdleResult = {
  readonly entryPrice: number;
  readonly clears: boolean;
};

/** A price a rounding error above the entry price still clears it. */
const CLEARS_TOLERANCE = 1e-9;

export function computeHurdle(inputs: HurdleInputs): HurdleResult {
  const entryPrice = inputs.baseValue * (1 - inputs.requiredDiscount);
  return { entryPrice, clears: inputs.price <= entryPrice + CLEARS_TOLERANCE };
}
