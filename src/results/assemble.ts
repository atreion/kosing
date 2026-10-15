/**
 * Decoded plus options to Results. The order of work is the order of the
 * sections; resolutions are decode's first, then each section's as it runs.
 */

import type { Company } from "../domain/company.ts";
import type { Valuation } from "../domain/valuation.ts";
import { assertNever } from "../exhaustive.ts";
import type { Decoded } from "../input/decode.ts";
import type { Resolution, Warning } from "../input/errors.ts";
import { priceStale } from "../input/warnings.ts";
import { computeDcf, type DcfInputs } from "../math/dcf.ts";
import {
  computeExcessReturn,
  computeExcessReturnSensitivity,
  type ExcessReturnInputs,
} from "../math/excess-return.ts";
import { computeFxSensitivity, type FxPairResult } from "../math/fx.ts";
import { computeMultiples } from "../math/multiples.ts";
import { computeNav } from "../math/nav.ts";
import { computeNormalisedEarnings } from "../math/normalised-earnings.ts";
import { computeSensitivity, type SensitivityResult } from "../math/sensitivity.ts";
import { computeWacc } from "../math/wacc.ts";
import { selectLatestReportedPeriod } from "../select/base-period.ts";
import {
  selectAlternativeBetaWacc,
  selectDcf,
  selectScenarioInputs,
  selectSensitivity,
} from "../select/dcf.ts";
import { selectDerived } from "../select/derived.ts";
import { selectExcessReturn } from "../select/excess-return.ts";
import { type FxBase, selectFx } from "../select/fx.ts";
import { selectMultipleInputs } from "../select/multiples.ts";
import { selectNav } from "../select/nav.ts";
import { selectNormalisedEarnings } from "../select/normalised-earnings.ts";
import { selectWacc } from "../select/wacc.ts";
import { hurdleSection } from "./hurdle.ts";
import { impliedRoteSection, multipleRows, reverseDcfSection } from "./priced-in.ts";
import {
  type AlternativeBetaValue,
  DEFAULT_VALUATOR_OPTIONS,
  type ExcessReturnScenarioValue,
  type Results,
  type ScenarioValue,
  type ValuationSection,
  type ValuatorOptions,
} from "./types.ts";

type Valued = {
  readonly valuation: ValuationSection | null;
  readonly sensitivity: SensitivityResult | null;
  readonly fxBase: FxBase | null;
  readonly resolutions: readonly Resolution[];
};

const NOTHING: Valued = { valuation: null, sensitivity: null, fxBase: null, resolutions: [] };

function scenarioValue(inputs: DcfInputs): ScenarioValue | null {
  const r = computeDcf(inputs);
  if (r.kind !== "value") return null;
  return {
    valuePerShare: r.valuePerShare,
    enterpriseValue: r.enterpriseValue,
    equityValue: r.equityValue,
    terminalValuePctOfEv: r.terminalValuePctOfEv,
  };
}

function alternativeBetaValue(
  valuation: Extract<Valuation, { method: "dcf" }>,
  base: DcfInputs,
): AlternativeBetaValue | null {
  const alt = selectAlternativeBetaWacc(valuation);
  if (alt === null) return null;
  const r = computeDcf({ ...base, wacc: alt.wacc });
  return {
    beta: alt.beta,
    costOfEquity: alt.costOfEquity,
    wacc: alt.wacc,
    valuePerShare: r.kind === "value" ? r.valuePerShare : null,
  };
}

function valueDcf(valuation: Extract<Valuation, { method: "dcf" }>, company: Company): Valued {
  const s = selectDcf(valuation, company);
  const outcome = computeDcf(s.inputs);
  if (outcome.kind === "undefined") {
    return {
      ...NOTHING,
      resolutions: [...s.resolutions, { kind: "dcfUnavailable", reason: outcome.reason }],
    };
  }
  const { kind: _k, ...value } = outcome;
  return {
    valuation: {
      method: "dcf",
      basePeriod: s.basePeriod,
      wacc: s.wacc,
      ...value,
      terminal: valuation.assumptions.terminal,
      scenarios:
        valuation.assumptions.scenarios === null
          ? null
          : {
              bear: scenarioValue(
                selectScenarioInputs(s.inputs, valuation.assumptions.scenarios.bear),
              ),
              bull: scenarioValue(
                selectScenarioInputs(s.inputs, valuation.assumptions.scenarios.bull),
              ),
            },
      alternativeBeta: alternativeBetaValue(valuation, s.inputs),
    },
    sensitivity: computeSensitivity(selectSensitivity(s.inputs, valuation.sensitivity)),
    fxBase: { inputs: s.inputs, baseEbit: s.basePeriodEbit },
    resolutions: s.resolutions,
  };
}

function excessReturnScenario(inputs: ExcessReturnInputs): ExcessReturnScenarioValue | null {
  const r = computeExcessReturn(inputs);
  if (r.kind !== "value") return null;
  return {
    valuePerShare: r.valuePerShare,
    equityValue: r.equityValue,
    priceToTangibleBook: r.priceToTangibleBook,
  };
}

function valueExcessReturn(
  valuation: Extract<Valuation, { method: "excessReturn" }>,
  company: Company,
): Valued {
  const inputs = selectExcessReturn(valuation, company);
  const outcome = computeExcessReturn(inputs);
  if (outcome.kind === "undefined") {
    return {
      ...NOTHING,
      resolutions: [{ kind: "excessReturnUnavailable", reason: outcome.reason }],
    };
  }
  const { kind: _k, ...value } = outcome;
  const s = valuation.assumptions.scenarios;
  return {
    ...NOTHING,
    valuation: {
      method: "excessReturn",
      costOfEquity: inputs.costOfEquity,
      tangibleBook: inputs.tangibleBook,
      payoutRatio: inputs.payoutRatio,
      terminalGrowth: inputs.terminalGrowth,
      ...value,
      scenarios:
        s === null
          ? null
          : {
              bear: excessReturnScenario(selectExcessReturn(valuation, company, s.bear.rotePath)),
              bull: excessReturnScenario(selectExcessReturn(valuation, company, s.bull.rotePath)),
            },
      sensitivity: computeExcessReturnSensitivity(inputs),
    },
  };
}

function value(valuation: Valuation, company: Company): Valued {
  switch (valuation.method) {
    case "dcf":
      return valueDcf(valuation, company);
    case "normalisedEarnings": {
      const s = selectNormalisedEarnings(valuation, company);
      return {
        ...NOTHING,
        valuation: {
          method: "normalisedEarnings",
          revenueBase: s.revenueBase,
          scenarios: computeNormalisedEarnings(s.inputs),
          ltmEbitMargin: s.ltmEbitMargin,
        },
      };
    }
    case "nav": {
      const nav = computeNav(selectNav(valuation, company));
      return {
        ...NOTHING,
        valuation: {
          method: "nav",
          ...nav,
          lookThroughNav: valuation.lookThroughNav,
          holdings: valuation.holdings,
        },
      };
    }
    case "excessReturn":
      return valueExcessReturn(valuation, company);
    default:
      return assertNever(valuation);
  }
}

/**
 * Decode cannot order whole paths, only the values they produce can be
 * ordered, so an analyst's sign slip is caught here rather than letting V1 be
 * answered from the wrong side.
 */
function scenarioValues(
  valuation: ValuationSection | null,
): { bear: number; base: number; bull: number } | null {
  if (valuation?.method !== "dcf" && valuation?.method !== "excessReturn") return null;
  const s = valuation.scenarios;
  if (s === null || s.bear === null || s.bull === null) return null;
  return { bear: s.bear.valuePerShare, base: valuation.valuePerShare, bull: s.bull.valuePerShare };
}

function scenarioWarnings(valuation: ValuationSection | null): Warning[] {
  const v = scenarioValues(valuation);
  if (v === null || (v.bear <= v.base && v.base <= v.bull)) return [];
  return [
    {
      rule: "scenarioOrderInverted",
      path: "method.scenarios",
      message: `bear ${v.bear.toFixed(2)}, base ${v.base.toFixed(2)}, bull ${v.bull.toFixed(2)} per share are not in order`,
    },
  ];
}

function fxSection(
  company: Company,
  fxBase: FxBase | null,
  moves: readonly number[],
): { readonly fx: readonly FxPairResult[] | null; readonly resolutions: readonly Resolution[] } {
  if (company.fx === null) return { fx: null, resolutions: [] };
  const s = selectFx(company.fx, company.currency, fxBase);
  if (s.kind === "unavailable") {
    return { fx: null, resolutions: [{ kind: "fxUnavailable", reason: s.reason }] };
  }
  return { fx: computeFxSensitivity(s.exposures, moves, s.revalue), resolutions: s.resolutions };
}

export function assemble(
  decoded: Decoded,
  options: ValuatorOptions = DEFAULT_VALUATOR_OPTIONS,
): Results {
  const { company } = decoded;
  const derived = selectDerived(company);
  const wacc = computeWacc(selectWacc(company.costOfCapital));
  const base = selectLatestReportedPeriod(company.financials);
  const multiples = computeMultiples(selectMultipleInputs(derived, base.period, company));
  const reverse = reverseDcfSection(company, wacc.wacc, options.reverseDcf);
  const valued = decoded.valuation === null ? NOTHING : value(decoded.valuation, company);
  const fx = fxSection(company, valued.fxBase, options.fxMoves);
  return {
    schemaVersion: "1.0",
    inputs: {
      ticker: company.identity.ticker,
      valuedOn: options.valuedOn,
      factsAsOf: company.asOf,
      caseFactsAsOf: decoded.caseFactsAsOf,
      classification: decoded.classification,
      aiExposure: decoded.aiExposure,
      company,
    },
    derived: { ...derived, multiples, wacc },
    pricedIn: {
      reverseDcf: reverse.section,
      impliedRote: impliedRoteSection(
        company,
        derived.marketCap,
        wacc.costOfEquity,
        options.reverseDcf.terminalGrowth,
      ),
      multiples: multipleRows(company, multiples),
    },
    valuation: valued.valuation,
    hurdle: hurdleSection({
      classification: decoded.classification,
      aiExposure: decoded.aiExposure,
      valuation: valued.valuation,
      price: company.market.price,
      reportingCurrency: company.currency,
      resolutions: decoded.resolutions,
    }),
    sensitivity: valued.sensitivity,
    fx: fx.fx,
    resolutions: [
      ...decoded.resolutions,
      ...reverse.resolutions,
      ...valued.resolutions,
      ...fx.resolutions,
    ],
    warnings: [
      ...decoded.warnings,
      ...priceStale(company.market.asOf, options.valuedOn),
      ...scenarioWarnings(valued.valuation),
    ],
  };
}
