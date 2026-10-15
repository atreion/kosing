/**
 * What decode reports besides a Company: errors that stop it, resolutions
 * that record a fallback, and warnings that are advisory. All three are data;
 * nothing here is a formatted sentence until an AI reads it.
 */

import type { z } from "zod";
import type { Unit } from "../domain/types.ts";

/** `path` is a dotted pointer into the file a human or model edits. */
export type DecodeError = {
  readonly file: "facts" | "case";
  readonly layer: "schema" | "semantic";
  readonly rule: string;
  readonly path: string;
  readonly message: string;
};

export function decodeError(
  file: DecodeError["file"],
  rule: string,
  path: string,
  message: string,
): DecodeError {
  return { file, layer: "semantic", rule, path, message };
}

export function zodIssuesToErrors(
  file: DecodeError["file"],
  issues: readonly z.core.$ZodIssue[],
): DecodeError[] {
  return issues.map((issue) => ({
    file,
    layer: "schema",
    rule: "schema.violation",
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

/**
 * Why a fallback fired. `unitRescaled.from` is derived from Unit rather than
 * listed, so a fourth unit added to UNIT_VALUES breaks this type until someone
 * decides what it rescales by.
 */
export type Resolution =
  | { readonly kind: "betaFromSector"; readonly value: number }
  | { readonly kind: "betaOverridden"; readonly from: number; readonly to: number }
  | { readonly kind: "waccOverridden"; readonly to: number }
  | { readonly kind: "taxRateOverridden"; readonly from: number; readonly to: number }
  | { readonly kind: "sharesFromOutstanding"; readonly value: number }
  | { readonly kind: "taxRateFromEffective"; readonly value: number }
  | {
      readonly kind: "unitRescaled";
      readonly from: Exclude<Unit, "millions">;
      readonly divisor: number;
    }
  | {
      readonly kind: "priceConvertedToReporting";
      readonly pair: string;
      readonly rate: number;
      readonly inverted: boolean;
    }
  | {
      readonly kind: "netDebtDerived";
      readonly totalDebt: number;
      readonly cash: number;
      readonly shortTermInvestments: number;
    }
  | { readonly kind: "revenueBaseFromLtm" }
  | { readonly kind: "revenueBaseAveraged"; readonly fromFy: number; readonly toFy: number }
  | { readonly kind: "dcfBasePeriodFromFiscalYear"; readonly fy: number }
  | {
      readonly kind: "reverseDcfUnavailable";
      readonly reason:
        | "noUsableBasePeriod"
        | "discountRateNotPositive"
        | "terminalGrowthNotBelowWacc"
        | "noGrowthInBracketMatchesPrice"
        | "financialInstitution";
    }
  | {
      readonly kind: "excessReturnUnavailable";
      readonly reason: "costOfEquityNotPositive" | "costOfEquityNotAboveGrowth";
    }
  | {
      readonly kind: "dcfUnavailable";
      readonly reason: "discountRateNotPositive" | "terminalGrowthNotBelowWacc";
    }
  | {
      readonly kind: "fxUnavailable";
      readonly reason: "noDcfValuation" | "nonPositiveBaseRevenue";
    }
  | {
      readonly kind: "fxExposureIncomplete";
      readonly currency: string;
      readonly missing: readonly ("revenueShare" | "costShare")[];
    };

/** Advisory, never fatal. */
export type Warning = {
  readonly rule:
    | "casePredatesFacts"
    | "ltmOlderThanFiscalYear"
    | "scenarioOrderInverted"
    | "priceStale"
    | "capitalNearRequirement"
    | "tangibleBookAboveEquity";
  readonly path: string;
  readonly message: string;
};

/** The shape Zod's safeParse returns, so every decoder reports one way. */
export type DecodeResult<T> =
  | { readonly success: true; readonly data: T; readonly error?: undefined }
  | { readonly success: false; readonly data?: undefined; readonly error: DecodeError[] };

export function decoded<T>(data: T): DecodeResult<T> {
  return { success: true, data };
}

export function failed<T>(error: DecodeError[]): DecodeResult<T> {
  return { success: false, error };
}
