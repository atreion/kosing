import type { Company } from "../domain/company.ts";
import { isNonEmpty, type NonEmpty } from "../domain/types.ts";
import type { Valuation } from "../domain/valuation.ts";
import type { ExcessReturnInputs } from "../math/excess-return.ts";
import { computeWacc } from "../math/wacc.ts";
import { selectWacc } from "./wacc.ts";

type ExcessReturnValuation = Extract<Valuation, { method: "excessReturn" }>;

function nonEmpty(path: readonly number[]): NonEmpty<number> {
  if (!isNonEmpty(path)) throw new Error("unreachable: the schema requires ten years");
  return path;
}

export function selectExcessReturn(
  valuation: ExcessReturnValuation,
  company: Company,
  rotePath: readonly number[] = valuation.assumptions.rotePath,
): ExcessReturnInputs {
  return {
    tangibleBook: valuation.tangibleBook,
    shares: company.market.shares,
    costOfEquity: computeWacc(selectWacc(valuation.costOfCapital)).costOfEquity,
    rotePath: nonEmpty(rotePath),
    payoutRatio: valuation.assumptions.payoutRatio,
    terminalGrowth: valuation.assumptions.terminalGrowth,
  };
}
