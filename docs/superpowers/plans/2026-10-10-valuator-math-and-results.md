# Valuator Math and Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a `Decoded` into `results.json`: the eight math modules, the pure selectors that feed them, the results assembler, and `kosing value --facts F [--case C]`, proved by property grids over deterministic inputs and one cited worked example per algorithm that has one.

**Architecture:** `src/math/` modules each take their own input type and know nothing about the domain. `src/select/` holds pure, total functions from the domain to those inputs; nothing between decode and math can fail, because decode already rejected what would make a selector partial, and the one thing decode cannot know (whether terminal growth is below the computed WACC) becomes a `null` section with a resolution rather than an exception. `src/results/assemble.ts` wires the three layers into one shape regardless of what ran. The legacy `result.ts`, `validate.ts`, `dcf-parse.ts`, `dcf.ts`, `wacc.ts` and the Nova golden are deleted; the arithmetic in `dcf.ts` and `wacc.ts` is carried into `src/math/`.

**Tech Stack:** TypeScript 7, Zod 4.6.5 (input layer only, untouched here except one new field), Node 22.18+, tsx, `node:test` + `node:assert/strict`, Biome. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-07-valuator-design.md`

**Scope:** Plan 2 of 2. Plan 1 (`docs/superpowers/plans/2026-10-08-valuator-inputs-and-decode.md`) is complete and approved at `9357c68`; this plan starts there. Task 1 makes four small adjustments to plan 1's surface that the math needs; everything else is new.

**Execution:** Claude implements every task inline (superpowers:executing-plans), with the user reviewing at three checkpoints: after Task 4 (WACC and DCF carried over, legacy deleted), after Task 10 (all eight math modules), and after Task 15 plus the whole-branch review.

## Global Constraints

- Node `>=22.18`. TypeScript `strict`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters`, all already set in `tsconfig.json`, none relaxed.
- Relative imports carry the `.ts` extension. Filenames are kebab-case (Biome `useFilenamingConvention`).
- Tests live next to the code as `*.test.ts`, using `node:test` and `node:assert/strict`. `npm test` globs `src/**/*.test.ts`, so new directories need no config.
- `npm run check` (typecheck + Biome + tests) must pass before every commit.
- Line width 100, double quotes, semicolons, trailing commas. Biome enforces. Biome's `useIterableCallbackReturn` rejects an expression-bodied `forEach`; use `for...of`.
- No `as` casts in `src/` outside the two brand transforms in `src/input/primitives.ts` and the test utilities. Test files may use `as never` to bypass the `IsoDate` brand, as `src/domain/valuation.test.ts` already does.
- `src/math/` imports nothing from `src/domain/` except the generic utilities in `src/domain/types.ts` (`NonEmpty`, `isNonEmpty`) and nothing from `src/input/`. `src/select/` imports from `src/domain/`, `src/math/` and `src/input/errors.ts` (for `Resolution`). `src/results/` imports from all three. Nothing under `src/` except `src/cli.ts`, `src/test-fixtures.ts` and test files imports `node:fs` or `node:child_process`.
- Math never re-validates. Inputs arrive from decode and the selectors; the only runtime guard inside `src/math/` is the Gordon precondition `growth < wacc`, which returns a typed `undefined` outcome rather than throwing.
- Every section of `results.json` is present on every run. A section that could not run is `null`, and when it had inputs and still could not run, a resolution says why.
- Nothing in results is a formatted sentence. Reasons are string literals from a closed union.
- `case` is reserved: type `Case`, variable `investmentCase`.
- Commit directly on `main`, one commit per task unless a step says otherwise.

## Rulings made while planning

Each is where the spec was silent or where following it literally would mislead a user. All are surfaced at the checkpoints; any can be reversed.

- **Facts gain `balanceSheet.totalEquity: number | null`.** The spec's results carry `priceBook` and facts carry a `priceBook` historical band, but no book value to compute the current multiple from. A number that is always `null` next to a band it can never be compared with is worse than a missing field. One nullable key, scaled like every other aggregate. (Task 1)
- **A resolved share count of 0 is a decode error, `semantic.zeroShares`.** Plan 1 ruled that `sharesDilutedM: 0` is a share count, not a missing value, and that still holds: zero is used, never replaced by `sharesOutstandingM`. But zero shares cannot price a share, and every per-share figure would be `Infinity`, which `JSON.stringify` silently turns into `null`. The error names the field that supplied the zero. The `dual.facts` fixture, which used `0` to prove the fallback did not fire, now uses `48`, and a mutation test proves the same thing through the error path. (Task 1)
- **`OperatingFinancials.ltm` carries its `endDate`.** Results name the DCF base period as `{ kind, fy, endDate }`; the operating LTM row lost its date in plan 1 and gets it back as `OperatingLtm`. (Task 1)
- **`Decoded` carries `caseFactsAsOf`.** Results echo it under `inputs`; plan 1's `Decoded` dropped it. (Task 1)
- **The DCF reports both `terminalValue` (undiscounted) and `pvTerminalValue`.** The spec lists `terminalValue` and `terminalValuePctOfEv`; the legacy code reported the discounted figure under the undiscounted name. Both are useful and the identity `pvExplicitPeriod + pvTerminalValue = enterpriseValue` is what an advisor checks. (Task 3)
- **Terminal growth at or above WACC is a `null` valuation with `dcfUnavailable`, not an error.** Decode cannot check it (WACC is computed), the math must not throw, and the spec says sections that could not run are `null` with the reason in resolutions. The same rule makes a sensitivity cell `null` when its shifted growth meets its shifted WACC. (Tasks 3, 6, 13)
- **Working capital is a share of the change in revenue.** `changeInWorkingCapital = workingCapitalPctRevenue × (revenue − previousRevenue)`, as the legacy code and the case field name say. End-of-year discounting. Both conventions are why the Wall Street Prep reverse-DCF example (mid-year, working capital as a share of revenue level) is not used as a golden. (Task 3)
- **Capex and D&A ratios for the reverse DCF come from `|capex| / revenue` and `|depreciationAmortization| / revenue`.** Facts report capex as the cash-flow statement does (an outflow, negative); the fixtures do. The absolute value accepts either sign without a resolution, because the sign is a reporting convention, not a fallback. (Task 11)
- **The reverse DCF's terminal growth and horizon are selector arguments with defaults, echoed in results.** `DEFAULT_VALUATOR_OPTIONS.reverseDcf = { horizonYears: 10, terminalGrowth: 0.02 }`. The spec says caller choices are selector arguments, never hidden state; results carry both so the advisor sees what was assumed. (Tasks 5, 11, 13)
- **The reverse DCF solves by bisection on `[-0.5, 1.0]` and reports `noGrowthInBracketMatchesPrice` when the bracket does not straddle the price.** A base period with negative FCFF margin, or a price no growth in that range can reach, is a reason, not a hang or a `NaN`. (Task 5)
- **Sensitivity steps are sorted ascending; with an exit-multiple terminal the growth axis is `null` and the grid is n × 1.** The spec says the growth axis is only meaningful for perpetuity growth. Sorting is what makes "monotone along each axis" a property; the case may list steps in any order. (Task 6)
- **FX sensitivity revalues the DCF under a translation shock; it is `null` with `fxUnavailable` when there is no DCF valuation.** The spec's table lists `fx` as computed from `Company` alone, but a value per share needs a valuation. The reading: for each exposure with a non-null `revenueShare` in a currency other than the reporting one, a move of `pct` scales base revenue by `1 + pct × revenueShare` and base costs by `1 + pct × costShare` (`costShare` null counts as 0), shifts every year's EBIT margin by the resulting base-margin change, and reruns the DCF. The pair is labelled `${exposure.currency}${currency}`; no spot rate is needed for a percentage move. With `fx` present but no relevant exposure, the section is `[]`. (Tasks 10, 12)
- **`linearFade` is not written.** Nothing in this plan consumes it: the case supplies ten-number paths and the reverse DCF uses constant growth. The spec's "remains a shared helper" referred to the Python helper. Add it when a consumer appears.
- **Worked examples: WACC, DCF and NAV have cited published examples; reverse DCF, multiples, normalised earnings, sensitivity and FX do not.** The reverse DCF's only published examples use mid-year discounting and a different working-capital convention; it is proved by the round trip through the forward DCF, which has its own golden. Multiples and normalised earnings are one division and one multiplication over an equity bridge the DCF golden already exercises. Sensitivity and FX are grids over the DCF. No invented citations.
- **The end-to-end test runs the real CLI process over the hand-written fixtures, not over a real company.** The spec wants a real name against a current report. Writing one from memory would present approximate figures as a report; the researcher skill is what produces real facts, and it does not exist yet. The process-level test proves `kosing value` runs end to end; the real name is the first task of the skills spec.
- **Selectors are grouped by section, not strictly one file per math module.** `select/dcf.ts` also builds the sensitivity inputs (two lines); `select/base-period.ts` is shared by the DCF, reverse DCF and multiples selectors. Same public surface, fewer two-line files.
- **Per-run options are a code-level argument, not CLI flags.** `valuate(facts, case, options)` takes `ValuatorOptions`; the CLI passes the defaults. Flags arrive when a skill needs them.

## Review Focus

Five input classes the spec implies, that the fixtures do not exercise on their own, and that would break the program or mislead the advisor if they arrived. Each has a test pinned to the task that owns the code.

1. **Terminal growth equal to or above the computed WACC**, in the base case or in one sensitivity cell. The Gordon formula divides by `wacc − growth`; the user must get `null` with `dcfUnavailable`, or a `null` cell, never `Infinity`, a negative value or a `null` that `JSON.stringify` smuggled in. (Task 3 for the base case, Task 6 for the cell, Task 13 for the resolution)
2. **A base period with negative or zero EBIT for the reverse DCF.** No constant growth may reach the price; the solver must report `noGrowthInBracketMatchesPrice`, not loop or return `NaN`. (Task 5)
3. **A share count that resolves to zero.** Every per-share figure would be infinite. Decode rejects it with the path of the field that supplied the zero. (Task 1)
4. **A multiple with a negative or zero denominator.** A loss-making company has no P/E; `marketCap / netIncome` must be `null`, not a negative multiple positioned "below" its band. (Task 7)
5. **A NAV case whose parent net debt exceeds the gross asset value.** NAV goes negative, the discount is applied to a negative number, and value per share is negative. That is the honest answer; nothing clamps it to zero, and the results walk must still find every number finite. (Task 9)

Across every task: `JSON.stringify` turns `NaN` and `Infinity` into `null` without a word. Task 13 adds `assertAllFinite`, which walks a results object and fails on any non-finite number, and runs it over every fixture pair.

## File structure

```
src/
  math/                        MATH, pure, own input types
    wacc.ts                      computeWacc
    dcf.ts                       projectYear, projectCashFlows, terminalValue, computeDcf
    reverse-dcf.ts               solveImpliedGrowth
    sensitivity.ts               computeSensitivity
    multiples.ts                 computeMultiples, positionInBand, median
    normalised-earnings.ts       computeNormalisedEarnings
    nav.ts                       computeNav
    fx.ts                        computeFxSensitivity
  select/                      DOMAIN to MATH, pure and total
    base-period.ts               selectOperatingBasePeriod, selectReportedBasePeriod
    wacc.ts                      selectWacc
    derived.ts                   selectDerived
    multiples.ts                 selectMultipleInputs, selectBand, selectPeerValues
    reverse-dcf.ts               selectReverseDcf, ReverseDcfOptions
    dcf.ts                       selectDcf, selectSensitivity
    normalised-earnings.ts       selectNormalisedEarnings
    nav.ts                       selectNav
    fx.ts                        selectFx
  results/
    types.ts                     Results and its sections
    priced-in.ts                 multiples rows, reverse DCF section
    assemble.ts                  assemble(decoded, options): Results
  valuate.ts                   valuate(factsJson, caseJson?, options?): DecodeResult<Results>
  cli.ts                       kosing schema | value
  cli.e2e.test.ts              spawns the real process
  index.ts                     the public surface, legacy exports gone
  test-utils.ts                assertClose, assertAllClose, assertAllFinite
deleted:
  src/result.ts  src/validate.ts  src/dcf-parse.ts  src/dcf.ts  src/wacc.ts
  src/smoke.test.ts  and every *.test.ts beside them
```

---

### Task 1: Four adjustments to plan 1's surface

**Files:**
- Modify: `src/input/facts.ts` (BalanceSheet)
- Modify: `src/domain/company.ts` (BalanceSheet)
- Modify: `src/domain/financials.ts` (OperatingLtm)
- Modify: `src/input/decode-company.ts` (totalEquity, zero shares)
- Modify: `src/input/decode-valuation.ts` (OperatingLtm endDate)
- Modify: `src/input/decode.ts` (caseFactsAsOf)
- Modify: `src/input/errors.ts` (no change to kinds yet; `DecodeError` is reused)
- Modify: `tests/fixtures/valid/acme.facts.json`, `holdco.facts.json`, `dual.facts.json`
- Modify: `src/input/facts.test.ts`, `src/input/decode-company.test.ts`, `src/input/decode-valuation.test.ts`, `src/input/decode.test.ts`
- Modify: `docs/superpowers/specs/2026-10-07-valuator-design.md`

**Interfaces:**
- Consumes: plan 1's `FactsSchema`, `decodeCompany`, `decodeValuation`, `decode`.
- Produces: `BalanceSheet.totalEquity: number | null` on both wire and domain; `OperatingLtm = Period & { readonly endDate: IsoDate }` and `OperatingFinancials.ltm: OperatingLtm | null`; `Decoded.caseFactsAsOf: IsoDate | null`; decode error `semantic.zeroShares` at `market.sharesDilutedM` or `market.sharesOutstandingM`.

- [ ] **Step 1: Write the failing tests**

Append to `src/input/facts.test.ts`, next to the existing `balanceSheet` object (add `totalEquity: 6200` to that object too):

```ts
test("totalEquity is a nullable aggregate on the balance sheet", () => {
  assert.equal(BalanceSheet.safeParse({ ...balanceSheet, totalEquity: null }).success, true);
  assert.equal(BalanceSheet.safeParse({ ...balanceSheet, totalEquity: "big" }).success, false);
  const { totalEquity: _t, ...without } = balanceSheet;
  assert.equal(BalanceSheet.safeParse(without).success, false, "every key is present");
});
```

Replace the test `"diluted shares win over outstanding, and zero is a share count"` in `src/input/decode-company.test.ts` with:

```ts
test("diluted shares win over outstanding", () => {
  const diluted = decodeCompany(parse(acme()));
  assert.equal(diluted.data?.company.market.shares, 115);
  const dualShares = decodeCompany(parse(dual()));
  assert.equal(dualShares.data?.company.market.shares, 48);
});

test("zero is a share count, and a zero share count is an error at the field that supplied it", () => {
  const diluted = decodeCompany(parse(mutate(acme(), "market.sharesDilutedM", 0)));
  assert.equal(diluted.success, false);
  assert.deepEqual(
    diluted.error?.map((e) => [e.rule, e.path]),
    [["semantic.zeroShares", "market.sharesDilutedM"]],
    "0 was used as the diluted count, not treated as missing",
  );

  const outstanding = decodeCompany(
    parse(mutate(mutate(acme(), "market.sharesDilutedM", null), "market.sharesOutstandingM", 0)),
  );
  assert.deepEqual(
    outstanding.error?.map((e) => [e.rule, e.path]),
    [["semantic.zeroShares", "market.sharesOutstandingM"]],
  );
});

test("totalEquity rescales with the other aggregates", () => {
  const result = decodeCompany(parse(dual()));
  assert.equal(result.data?.company.balanceSheet.totalEquity, 400);
  const nothing = decodeCompany(parse(mutate(acme(), "balanceSheet.totalEquity", null)));
  assert.equal(nothing.data?.company.balanceSheet.totalEquity, null);
});
```

Append to `src/input/decode-valuation.test.ts`, using the file's existing `run(factsDoc, caseDoc)` helper:

```ts
test("the operating ltm row keeps its end date", () => {
  const result = run(acme(), loadFixture("acme-dcf.case"));
  assert.ok(result.success);
  const { valuation } = result.data;
  assert.equal(valuation.method, "dcf");
  if (valuation.method !== "dcf") return;
  assert.equal(valuation.financials.ltm?.endDate, "2026-06-30");
});
```

Append to `src/input/decode.test.ts`:

```ts
test("caseFactsAsOf is echoed from the case and null without one", () => {
  const withCase = decode(loadFixture("acme.facts"), loadFixture("acme-dcf.case"));
  assert.equal(withCase.data?.caseFactsAsOf, "2026-10-01");
  const alone = decode(loadFixture("acme.facts"));
  assert.equal(alone.data?.caseFactsAsOf, null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test 2>&1 | grep -E "^not ok|# (pass|fail)"`
Expected: the new tests fail (`totalEquity` unknown key under strict object, `shares` is 0 rather than an error, `endDate` undefined, `caseFactsAsOf` undefined). Also `npx tsc --noEmit` reports `caseFactsAsOf` and `endDate` do not exist on the types.

- [ ] **Step 3: Add `totalEquity` to the wire and domain balance sheets**

In `src/input/facts.ts`, inside `BalanceSheet` after `intangiblesExGoodwill`:

```ts
  totalEquity: nullableNumber,
```

In `src/domain/company.ts`, inside `BalanceSheet` after `intangiblesExGoodwill`:

```ts
  /** Book equity, for the current price-to-book multiple. */
  readonly totalEquity: number | null;
```

In `src/input/decode-company.ts`, in the `balanceSheet` literal after `intangiblesExGoodwill`:

```ts
      totalEquity: scale.nullable(bs.totalEquity),
```

Add `"totalEquity": 6200,` after `"intangiblesExGoodwill"` in `acme.facts.json`; `"totalEquity": 30000,` in `holdco.facts.json`; `"totalEquity": 400000,` in `dual.facts.json`.

- [ ] **Step 4: Reject a zero share count**

In `src/input/decode-company.ts`, replace `decodeMarket`:

```ts
/**
 * The share count prefers diluted; a diluted count of zero is a share count,
 * not a missing one, which is exactly why it is an error rather than a fallback.
 */
function decodeMarket(
  facts: Facts,
  convert: Convert,
  resolutions: Resolution[],
): DecodeResult<Market> {
  const { market } = facts;
  let shares = market.sharesDilutedM;
  let suppliedBy: "market.sharesDilutedM" | "market.sharesOutstandingM" = "market.sharesDilutedM";
  if (shares === null) {
    shares = market.sharesOutstandingM;
    suppliedBy = "market.sharesOutstandingM";
    resolutions.push({ kind: "sharesFromOutstanding", value: shares });
  }
  if (shares === 0) {
    return failed([
      decodeError("facts", "semantic.zeroShares", suppliedBy, "a share count of 0 cannot price a share"),
    ]);
  }
  return decoded({
    price: convert(market.price),
    shares,
    week52High: convertNullable(convert, market.week52High),
    week52Low: convertNullable(convert, market.week52Low),
    asOf: market.asOf,
  });
}
```

In `decodeCompany`, replace `market: decodeMarket(facts, convert, resolutions),` by hoisting the call above the `company` literal:

```ts
  const market = decodeMarket(facts, convert, resolutions);
  if (!market.success) return failed(market.error);
```

and in the literal: `market: market.data,`.

Change `"sharesDilutedM": 0` to `"sharesDilutedM": 48` in `tests/fixtures/valid/dual.facts.json`.

- [ ] **Step 5: Give the operating LTM row its date**

In `src/domain/financials.ts`, replace `OperatingFinancials`:

```ts
/** The LTM row the math uses, dated so results can name the base period. */
export type OperatingLtm = Period & { readonly endDate: IsoDate };

export type OperatingFinancials = {
  readonly ltm: OperatingLtm | null;
  readonly fiscalYears: NonEmpty<FiscalYear>;
};
```

In `src/input/decode-valuation.ts`, `toOperatingFinancials`: change `let ltm: Period | null = null;` to `let ltm: OperatingLtm | null = null;` and `if (period.success) ltm = period.data;` to `if (period.success) ltm = { ...period.data, endDate: company.financials.ltm.endDate };`. Import `OperatingLtm` from the domain.

`CyclicalRevenueBase.kind === "ltm"` still carries a `Period`; `resolveRevenueBase` keeps returning `{ kind: "ltm", period: financials.ltm }`, and a `OperatingLtm` is a `Period`, so nothing else changes.

- [ ] **Step 6: Carry `caseFactsAsOf` through decode**

In `src/input/decode.ts`, add to `Decoded` after `classification`:

```ts
  /** The facts snapshot the case was written against; echoed in results. */
  readonly caseFactsAsOf: IsoDate | null;
```

(import `IsoDate` from the domain types) and in the returned object: `caseFactsAsOf: investmentCase?.factsAsOf ?? null,`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm run check`
Expected: typecheck clean, Biome clean, all tests pass (the count grows by five). If `decode-valuation.test.ts` deep-equals an operating LTM row somewhere, it now needs `endDate`; fix the expectation, not the code.

- [ ] **Step 8: Update the spec**

In `docs/superpowers/specs/2026-10-07-valuator-design.md`:
- in the `facts.json` block under `balanceSheet`, after `intangiblesExGoodwill`, add `  totalEquity                  number | null`;
- in the Domain model, replace `type OperatingFinancials = { ltm: Period | null; fiscalYears: NonEmpty<FiscalYear> };` with `type OperatingLtm = Period & { endDate: IsoDate };` and `type OperatingFinancials = { ltm: OperatingLtm | null; fiscalYears: NonEmpty<FiscalYear> };`;
- in Decode's `Decoded` type, after `classification`, add `caseFactsAsOf: IsoDate | null;   // echoed in results`;
- in the Cross-document rules table add the row `| semantic.zeroShares | the resolved share count is not 0; the error names the field that supplied it |`.

- [ ] **Step 9: Commit**

```bash
git add src/input src/domain tests/fixtures docs/superpowers/specs/2026-10-07-valuator-design.md
git commit -m "feat(input): totalEquity, dated operating ltm, caseFactsAsOf, zero-share error

Four small changes the math needs: a book value for price-to-book, the LTM
end date so results can name the DCF base period, the case's factsAsOf echoed
through Decoded, and a decode error for a share count of zero, which would
otherwise make every per-share figure infinite."
```

---

### Task 2: `math/wacc.ts`

**Files:**
- Create: `src/math/wacc.ts`
- Create: `src/math/wacc.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:

```ts
export type WaccInputs = {
  readonly riskFree: number;
  readonly erp: number;
  readonly beta: number;
  readonly countryPremium: number;
  readonly preTaxCostOfDebt: number;
  readonly taxRate: number;
  readonly equityWeight: number;
  readonly debtWeight: number;
};
export type WaccResult = {
  readonly costOfEquity: number;
  readonly afterTaxCostOfDebt: number;
  readonly wacc: number;
};
export function computeWacc(inputs: WaccInputs): WaccResult;
```

The legacy `src/wacc.ts` stays until Task 4 deletes it; the new module lives beside it with no imports between them.

- [ ] **Step 1: Write the failing tests**

`src/math/wacc.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { assertClose } from "../test-utils.ts";
import { computeWacc, type WaccInputs } from "./wacc.ts";

/**
 * Pearson, "WACC Calculator", worked examples:
 * E = $600,000, D = $400,000, Re = 11%, Rd = 6%, Tc = 25% gives WACC = 8.4%;
 * Rf = 3.5%, beta = 1.15, market risk premium = 6% gives Re = 10.4%.
 * https://www.pearson.com/channels/calculators/wacc-calculator
 */
test("worked example: Pearson's WACC and CAPM figures", () => {
  // Pearson states the cost of equity directly; a zero beta and an 11% risk-free rate reproduce it.
  const withStatedCostOfEquity = computeWacc({
    riskFree: 0.11,
    erp: 0,
    beta: 0,
    countryPremium: 0,
    preTaxCostOfDebt: 0.06,
    taxRate: 0.25,
    equityWeight: 0.6,
    debtWeight: 0.4,
  });
  assertClose(withStatedCostOfEquity.costOfEquity, 0.11, 1e-12);
  assertClose(withStatedCostOfEquity.afterTaxCostOfDebt, 0.045, 1e-12);
  assertClose(withStatedCostOfEquity.wacc, 0.084, 1e-12);

  const capm = computeWacc({
    riskFree: 0.035,
    erp: 0.06,
    beta: 1.15,
    countryPremium: 0,
    preTaxCostOfDebt: 0,
    taxRate: 0,
    equityWeight: 1,
    debtWeight: 0,
  });
  assertClose(capm.costOfEquity, 0.104, 1e-12);
});

test("the country premium is scaled by beta alongside the equity risk premium", () => {
  const r = computeWacc({
    riskFree: 0.05,
    erp: 0.055,
    beta: 1,
    countryPremium: 0.02,
    preTaxCostOfDebt: 0.04,
    taxRate: 0.2,
    equityWeight: 0.8,
    debtWeight: 0.2,
  });
  assertClose(r.costOfEquity, 0.125, 1e-12);
  assertClose(r.afterTaxCostOfDebt, 0.032, 1e-12);
  assertClose(r.wacc, 0.8 * 0.125 + 0.2 * 0.032, 1e-12);
});

test("property: WACC lies between the after-tax cost of debt and the cost of equity", () => {
  const base: WaccInputs = {
    riskFree: 0.03,
    erp: 0.05,
    beta: 1.2,
    countryPremium: 0.01,
    preTaxCostOfDebt: 0.05,
    taxRate: 0.25,
    equityWeight: 0.5,
    debtWeight: 0.5,
  };
  for (const equityWeight of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
    for (const beta of [0.2, 0.8, 1.5]) {
      const r = computeWacc({ ...base, beta, equityWeight, debtWeight: 1 - equityWeight });
      const lo = Math.min(r.afterTaxCostOfDebt, r.costOfEquity);
      const hi = Math.max(r.afterTaxCostOfDebt, r.costOfEquity);
      assert.ok(r.wacc >= lo - 1e-12 && r.wacc <= hi + 1e-12, `w=${equityWeight} b=${beta}`);
    }
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test src/math/wacc.test.ts`
Expected: FAIL, cannot find module `./wacc.ts`.

- [ ] **Step 3: Write the module**

`src/math/wacc.ts`:

```ts
/**
 * Cost of capital, textbook: CAPM for equity with the country premium scaled
 * by beta alongside the equity risk premium, the tax shield on debt, and the
 * weighted average. Weights are taken as given; decode has checked they sum
 * to one.
 */

export type WaccInputs = {
  readonly riskFree: number;
  readonly erp: number;
  readonly beta: number;
  readonly countryPremium: number;
  readonly preTaxCostOfDebt: number;
  readonly taxRate: number;
  readonly equityWeight: number;
  readonly debtWeight: number;
};

export type WaccResult = {
  readonly costOfEquity: number;
  readonly afterTaxCostOfDebt: number;
  readonly wacc: number;
};

export function computeWacc(inputs: WaccInputs): WaccResult {
  const costOfEquity = inputs.riskFree + inputs.beta * (inputs.erp + inputs.countryPremium);
  const afterTaxCostOfDebt = inputs.preTaxCostOfDebt * (1 - inputs.taxRate);
  const wacc = inputs.equityWeight * costOfEquity + inputs.debtWeight * afterTaxCostOfDebt;
  return { costOfEquity, afterTaxCostOfDebt, wacc };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test src/math/wacc.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add src/math/wacc.ts src/math/wacc.test.ts
git commit -m "feat(math): wacc with its own input type and Pearson's worked example"
```

---

### Task 3: `math/dcf.ts`

**Files:**
- Create: `src/math/dcf.ts`
- Create: `src/math/dcf.test.ts`

**Interfaces:**
- Consumes: `NonEmpty`, `isNonEmpty` from `src/domain/types.ts`; `assertNever` from `src/exhaustive.ts`.
- Produces:

```ts
export type YearAssumptions = {
  readonly revenueGrowth: number;
  readonly ebitMargin: number;
  readonly capexPctRevenue: number;
  readonly daPctRevenue: number;
};
export type Terminal =
  | { readonly kind: "perpetuityGrowth"; readonly growth: number }
  | { readonly kind: "exitMultiple"; readonly multiple: number; readonly on: "evEbit" | "evEbitda" | "evFcff" };
export type DcfInputs = {
  readonly revenueBase: number;
  readonly taxRate: number;
  readonly wacc: number;
  readonly netDebt: number;
  readonly shares: number;
  readonly years: NonEmpty<YearAssumptions>;
  readonly workingCapitalPctRevenue: number;
  readonly terminal: Terminal;
};
export type YearRow = { year, revenue, ebit, nopat, da, ebitda, capex, changeInWorkingCapital, fcff, discountFactor, pvFcff: number };
export type DcfNote = { readonly kind: "terminalValueDominates"; readonly pctOfEv: number };
export type DcfValue = {
  readonly kind: "value";
  readonly valuePerShare: number; readonly enterpriseValue: number; readonly equityValue: number;
  readonly terminalValue: number; readonly pvTerminalValue: number; readonly terminalValuePctOfEv: number;
  readonly pvExplicitPeriod: number; readonly projection: NonEmpty<YearRow>; readonly notes: readonly DcfNote[];
};
export type DcfUndefined = { readonly kind: "undefined"; readonly reason: "terminalGrowthNotBelowWacc" };
export type DcfOutcome = DcfValue | DcfUndefined;
export function projectYear(previousRevenue: number, year: number, a: YearAssumptions, c: ProjectionConstants): YearRow;
export function projectCashFlows(inputs: DcfInputs): NonEmpty<YearRow>;
export function terminalValue(finalYear: YearRow, wacc: number, terminal: Terminal): number;  // precondition: growth < wacc
export function computeDcf(inputs: DcfInputs): DcfOutcome;
```

The math's `Terminal` is structurally identical to the domain's; the selector passes the domain value through. Each layer declares its own so the math never imports the domain model.

- [ ] **Step 1: Write the failing tests**

`src/math/dcf.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { NonEmpty } from "../domain/types.ts";
import { assertAllClose, assertClose } from "../test-utils.ts";
import {
  computeDcf,
  type DcfInputs,
  projectYear,
  terminalValue,
  type YearAssumptions,
} from "./dcf.ts";

function flat(count: number, a: YearAssumptions): NonEmpty<YearAssumptions> {
  return [a, ...Array.from({ length: count - 1 }, () => a)];
}

const unit: YearAssumptions = { revenueGrowth: 0, ebitMargin: 0.1, capexPctRevenue: 0, daPctRevenue: 0 };

const base: DcfInputs = {
  revenueBase: 1000,
  taxRate: 0,
  wacc: 0.1,
  netDebt: 0,
  shares: 100,
  years: flat(2, unit),
  workingCapitalPctRevenue: 0,
  terminal: { kind: "perpetuityGrowth", growth: 0.025 },
};

function value(inputs: DcfInputs): number {
  const r = computeDcf(inputs);
  assert.equal(r.kind, "value");
  if (r.kind !== "value") throw new Error("unreachable");
  return r.valuePerShare;
}

test("projectYear constructs every field for year one", () => {
  const row = projectYear(
    1000,
    1,
    { revenueGrowth: 0.1, ebitMargin: 0.3, capexPctRevenue: 0.05, daPctRevenue: 0.04 },
    { taxRate: 0.2, wacc: 0.1, workingCapitalPctRevenue: 0.02 },
  );
  assertAllClose(
    row,
    {
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
    },
    1e-9,
  );
});

/**
 * Embat, "Discounted Cash Flow (DCF): Formula and Example": FCFF of 100, 115,
 * 130, 145, 160 over five years, WACC 9.0%, terminal growth 2.00%, net debt
 * 300. Stated: explicit PV 495.63, terminal value 2,331.43, its PV 1,515.27,
 * enterprise value 2,010.90, equity value 1,710.90, terminal share 75.35%.
 * https://www.embat.io/blog/discounted-cash-flow
 *
 * Mapped onto this model with margin 1, no tax, capex, D&A or working
 * capital, so FCFF equals revenue and revenue growth reproduces the stated
 * cash flows exactly.
 */
test("worked example: Embat's five-year DCF with a Gordon terminal value", () => {
  const flows = [100, 115, 130, 145, 160];
  const years = flows.map((f, i) => ({
    revenueGrowth: f / (i === 0 ? 100 : (flows[i - 1] ?? 100)) - 1,
    ebitMargin: 1,
    capexPctRevenue: 0,
    daPctRevenue: 0,
  }));
  const [first, ...rest] = years;
  if (first === undefined) throw new Error("unreachable");
  const r = computeDcf({
    revenueBase: 100,
    taxRate: 0,
    wacc: 0.09,
    netDebt: 300,
    shares: 1,
    years: [first, ...rest],
    workingCapitalPctRevenue: 0,
    terminal: { kind: "perpetuityGrowth", growth: 0.02 },
  });
  assert.equal(r.kind, "value");
  if (r.kind !== "value") return;
  assert.deepEqual(
    r.projection.map((row) => Math.round(row.fcff * 1e6) / 1e6),
    flows,
  );
  assertClose(r.pvExplicitPeriod, 495.63, 0.01);
  assertClose(r.terminalValue, 2331.43, 0.01);
  assertClose(r.pvTerminalValue, 1515.27, 0.01);
  assertClose(r.enterpriseValue, 2010.9, 0.01);
  assertClose(r.equityValue, 1710.9, 0.01);
  assertClose(r.terminalValuePctOfEv, 0.7535, 1e-4);
  assertClose(r.pvExplicitPeriod + r.pvTerminalValue, r.enterpriseValue, 1e-9);
});

/**
 * Wall Street Prep, "Terminal Value": year-5 FCF $36mm, long-term growth
 * 2.5%, WACC 10.0%, end-of-year discounting. Stated: terminal value $492mm,
 * present value $305mm. https://www.wallstreetprep.com/knowledge/terminal-value/
 */
test("worked example: Wall Street Prep's perpetuity terminal value", () => {
  const finalYear = projectYear(
    36,
    5,
    { revenueGrowth: 0, ebitMargin: 1, capexPctRevenue: 0, daPctRevenue: 0 },
    { taxRate: 0, wacc: 0.1, workingCapitalPctRevenue: 0 },
  );
  const tv = terminalValue(finalYear, 0.1, { kind: "perpetuityGrowth", growth: 0.025 });
  assertClose(tv, 492, 0.01);
  assertClose(tv * finalYear.discountFactor, 305, 1);
});

test("exit multiples apply to the final year's ebit, ebitda or fcff", () => {
  const finalYear = projectYear(
    1000,
    1,
    { revenueGrowth: 0, ebitMargin: 0.3, capexPctRevenue: 0.1, daPctRevenue: 0.04 },
    { taxRate: 0, wacc: 0.08, workingCapitalPctRevenue: 0 },
  );
  assertClose(terminalValue(finalYear, 0.08, { kind: "exitMultiple", multiple: 10, on: "evEbit" }), 3000, 1e-9);
  assertClose(terminalValue(finalYear, 0.08, { kind: "exitMultiple", multiple: 10, on: "evEbitda" }), 3400, 1e-9);
  assertClose(terminalValue(finalYear, 0.08, { kind: "exitMultiple", multiple: 10, on: "evFcff" }), 2400, 1e-9);
});

test("terminal growth at or above wacc is a typed undefined outcome, never a number", () => {
  for (const growth of [0.1, 0.11, 0.5]) {
    const r = computeDcf({ ...base, terminal: { kind: "perpetuityGrowth", growth } });
    assert.deepEqual(r, { kind: "undefined", reason: "terminalGrowthNotBelowWacc" });
  }
  const exit = computeDcf({ ...base, terminal: { kind: "exitMultiple", multiple: 8, on: "evEbit" } });
  assert.equal(exit.kind, "value", "an exit multiple has no growth precondition");
});

test("the equity bridge subtracts net debt and divides by shares", () => {
  const r = computeDcf({ ...base, netDebt: 200, shares: 50 });
  assert.equal(r.kind, "value");
  if (r.kind !== "value") return;
  assertClose(r.equityValue, r.enterpriseValue - 200, 1e-9);
  assertClose(r.valuePerShare, r.equityValue / 50, 1e-9);
});

test("a note fires when the terminal value exceeds 75% of enterprise value", () => {
  const r = computeDcf({ ...base, terminal: { kind: "perpetuityGrowth", growth: 0.07 } });
  assert.equal(r.kind, "value");
  if (r.kind !== "value") return;
  assert.ok(r.terminalValuePctOfEv > 0.75);
  assert.deepEqual(r.notes, [{ kind: "terminalValueDominates", pctOfEv: r.terminalValuePctOfEv }]);
});

test("property: value is increasing in every growth-path entry and in terminal growth", () => {
  const ten = flat(10, { revenueGrowth: 0.05, ebitMargin: 0.15, capexPctRevenue: 0.04, daPctRevenue: 0.03 });
  const inputs: DcfInputs = { ...base, taxRate: 0.25, years: ten, workingCapitalPctRevenue: 0.1 };
  const v0 = value(inputs);
  for (let i = 0; i < 10; i += 1) {
    const years = ten.map((y, j) => (j === i ? { ...y, revenueGrowth: y.revenueGrowth + 0.01 } : y));
    const [first, ...rest] = years;
    if (first === undefined) throw new Error("unreachable");
    assert.ok(value({ ...inputs, years: [first, ...rest] }) > v0, `year ${i + 1}`);
  }
  let previous = value({ ...inputs, terminal: { kind: "perpetuityGrowth", growth: 0 } });
  for (const growth of [0.01, 0.02, 0.03, 0.04]) {
    const v = value({ ...inputs, terminal: { kind: "perpetuityGrowth", growth } });
    assert.ok(v > previous, `growth ${growth}`);
    previous = v;
  }
});

test("property: value is decreasing in wacc", () => {
  let previous = Number.POSITIVE_INFINITY;
  for (const wacc of [0.05, 0.06, 0.07, 0.08, 0.1, 0.12, 0.15]) {
    const v = value({ ...base, wacc });
    assert.ok(v < previous, `wacc ${wacc}`);
    previous = v;
  }
});

test("property: value is continuous in wacc, growth and the growth path", () => {
  const h = 1e-7;
  const v = value(base);
  const dWacc = Math.abs(value({ ...base, wacc: base.wacc + h }) - v);
  const dGrowth = Math.abs(value({ ...base, terminal: { kind: "perpetuityGrowth", growth: 0.025 + h } }) - v);
  const bumped = flat(2, { ...unit, revenueGrowth: h });
  const dPath = Math.abs(value({ ...base, years: bumped }) - v);
  for (const d of [dWacc, dGrowth, dPath]) assert.ok(d < 1e-3 * Math.abs(v), `delta ${d}`);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test src/math/dcf.test.ts`
Expected: FAIL, cannot find module `./dcf.ts`.

- [ ] **Step 3: Write the module**

`src/math/dcf.ts`:

```ts
/**
 * Unlevered DCF, textbook. Each year: revenue grows, EBIT is a margin, NOPAT
 * is EBIT after tax, FCFF = NOPAT + D&A - capex - change in working capital,
 * discounted at end of year. Terminal value by Gordon growth on the final
 * year's FCFF or by an exit multiple on the final year's EBIT, EBITDA or
 * FCFF, discounted with the final year's factor.
 *
 * The one precondition the formula has, growth < wacc, is returned as a typed
 * outcome rather than thrown: decode cannot check it because the WACC is
 * computed, and a section that could not run is null in results.
 */

import { isNonEmpty, type NonEmpty } from "../domain/types.ts";
import { assertNever } from "../exhaustive.ts";

export type YearAssumptions = {
  readonly revenueGrowth: number;
  readonly ebitMargin: number;
  readonly capexPctRevenue: number;
  readonly daPctRevenue: number;
};

export type Terminal =
  | { readonly kind: "perpetuityGrowth"; readonly growth: number }
  | {
      readonly kind: "exitMultiple";
      readonly multiple: number;
      readonly on: "evEbit" | "evEbitda" | "evFcff";
    };

export type DcfInputs = {
  readonly revenueBase: number;
  readonly taxRate: number;
  readonly wacc: number;
  readonly netDebt: number;
  readonly shares: number;
  readonly years: NonEmpty<YearAssumptions>;
  /** Working capital as a share of revenue; the cash cost is this times the change in revenue. */
  readonly workingCapitalPctRevenue: number;
  readonly terminal: Terminal;
};

export type YearRow = {
  readonly year: number;
  readonly revenue: number;
  readonly ebit: number;
  readonly nopat: number;
  readonly da: number;
  readonly ebitda: number;
  readonly capex: number;
  readonly changeInWorkingCapital: number;
  readonly fcff: number;
  readonly discountFactor: number;
  readonly pvFcff: number;
};

export type DcfNote = { readonly kind: "terminalValueDominates"; readonly pctOfEv: number };

export type DcfValue = {
  readonly kind: "value";
  readonly valuePerShare: number;
  readonly enterpriseValue: number;
  readonly equityValue: number;
  /** Undiscounted, at the end of the final year. */
  readonly terminalValue: number;
  readonly pvTerminalValue: number;
  readonly terminalValuePctOfEv: number;
  readonly pvExplicitPeriod: number;
  readonly projection: NonEmpty<YearRow>;
  readonly notes: readonly DcfNote[];
};

export type DcfUndefined = {
  readonly kind: "undefined";
  readonly reason: "terminalGrowthNotBelowWacc";
};

export type DcfOutcome = DcfValue | DcfUndefined;

export type ProjectionConstants = {
  readonly taxRate: number;
  readonly wacc: number;
  readonly workingCapitalPctRevenue: number;
};

export function projectYear(
  previousRevenue: number,
  year: number,
  a: YearAssumptions,
  c: ProjectionConstants,
): YearRow {
  const revenue = previousRevenue * (1 + a.revenueGrowth);
  const ebit = revenue * a.ebitMargin;
  const nopat = ebit * (1 - c.taxRate);
  const da = revenue * a.daPctRevenue;
  const ebitda = ebit + da;
  const capex = revenue * a.capexPctRevenue;
  const changeInWorkingCapital = c.workingCapitalPctRevenue * (revenue - previousRevenue);
  const fcff = nopat + da - capex - changeInWorkingCapital;
  const discountFactor = 1 / (1 + c.wacc) ** year;
  return {
    year,
    revenue,
    ebit,
    nopat,
    da,
    ebitda,
    capex,
    changeInWorkingCapital,
    fcff,
    discountFactor,
    pvFcff: fcff * discountFactor,
  };
}

export function projectCashFlows(inputs: DcfInputs): NonEmpty<YearRow> {
  const constants: ProjectionConstants = {
    taxRate: inputs.taxRate,
    wacc: inputs.wacc,
    workingCapitalPctRevenue: inputs.workingCapitalPctRevenue,
  };
  const rows: YearRow[] = [];
  let previousRevenue = inputs.revenueBase;
  for (const [i, a] of inputs.years.entries()) {
    const row = projectYear(previousRevenue, i + 1, a, constants);
    rows.push(row);
    previousRevenue = row.revenue;
  }
  if (!isNonEmpty(rows)) throw new Error("unreachable: years is NonEmpty");
  return rows;
}

function exitBasis(finalYear: YearRow, on: Extract<Terminal, { kind: "exitMultiple" }>["on"]): number {
  switch (on) {
    case "evEbit":
      return finalYear.ebit;
    case "evEbitda":
      return finalYear.ebitda;
    case "evFcff":
      return finalYear.fcff;
    default:
      return assertNever(on);
  }
}

/** Precondition for perpetuityGrowth: growth < wacc. computeDcf checks it; callers of this do too. */
export function terminalValue(finalYear: YearRow, wacc: number, terminal: Terminal): number {
  switch (terminal.kind) {
    case "perpetuityGrowth":
      return (finalYear.fcff * (1 + terminal.growth)) / (wacc - terminal.growth);
    case "exitMultiple":
      return terminal.multiple * exitBasis(finalYear, terminal.on);
    default:
      return assertNever(terminal);
  }
}

const TERMINAL_DOMINANCE = 0.75;

function gordonIsDefined(wacc: number, terminal: Terminal): boolean {
  return terminal.kind !== "perpetuityGrowth" || terminal.growth < wacc;
}

export function computeDcf(inputs: DcfInputs): DcfOutcome {
  if (!gordonIsDefined(inputs.wacc, inputs.terminal)) {
    return { kind: "undefined", reason: "terminalGrowthNotBelowWacc" };
  }
  const projection = projectCashFlows(inputs);
  const finalYear = projection[projection.length - 1] ?? projection[0];
  const tv = terminalValue(finalYear, inputs.wacc, inputs.terminal);
  const pvTerminalValue = tv * finalYear.discountFactor;
  const pvExplicitPeriod = projection.reduce((sum, row) => sum + row.pvFcff, 0);
  const enterpriseValue = pvExplicitPeriod + pvTerminalValue;
  const terminalValuePctOfEv = enterpriseValue === 0 ? 0 : pvTerminalValue / enterpriseValue;
  const equityValue = enterpriseValue - inputs.netDebt;
  return {
    kind: "value",
    valuePerShare: equityValue / inputs.shares,
    enterpriseValue,
    equityValue,
    terminalValue: tv,
    pvTerminalValue,
    terminalValuePctOfEv,
    pvExplicitPeriod,
    projection,
    notes:
      terminalValuePctOfEv > TERMINAL_DOMINANCE
        ? [{ kind: "terminalValueDominates", pctOfEv: terminalValuePctOfEv }]
        : [],
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test src/math/dcf.test.ts`
Expected: 11 pass. If the Embat projection check fails on the sixth decimal, the growth ratios are the cause; loosen only that `deepEqual` to a per-row `assertClose(…, 1e-9)`, never the cited totals.

- [ ] **Step 5: Run the whole check and commit**

Run: `npm run check`
Expected: clean. The legacy `src/dcf.ts` still exists and still passes its own tests; the two modules do not import each other.

```bash
git add src/math/dcf.ts src/math/dcf.test.ts
git commit -m "feat(math): dcf with a typed outcome and two cited worked examples

Gordon growth at or above wacc is a typed undefined outcome rather than a
throw: decode cannot check it and results report the section as null. The
terminal value is reported both undiscounted and at present value."
```

---

### Task 4: Delete the legacy math and its parse layer

**Files:**
- Delete: `src/result.ts`, `src/result.test.ts`, `src/validate.ts`, `src/validate.test.ts`, `src/dcf-parse.ts`, `src/dcf-parse.test.ts`, `src/dcf.ts`, `src/dcf.test.ts`, `src/wacc.ts`, `src/wacc.test.ts`, `src/smoke.test.ts`
- Modify: `src/test-utils.ts` (drop `unwrap`)
- Modify: `src/index.ts`
- Modify: `package.json` (description)

**Interfaces:**
- Consumes: `src/math/wacc.ts`, `src/math/dcf.ts`.
- Produces: `src/index.ts` exports the decode surface (unchanged), `emitJsonSchema`, and the two math modules' types and functions. `valuate` is added in Task 13.

- [ ] **Step 1: Delete the files**

```bash
git rm src/result.ts src/result.test.ts src/validate.ts src/validate.test.ts \
  src/dcf-parse.ts src/dcf-parse.test.ts src/dcf.ts src/dcf.test.ts \
  src/wacc.ts src/wacc.test.ts src/smoke.test.ts
```

`smoke.test.ts` tested that the toolchain runs enums. Every other test is that proof now.

- [ ] **Step 2: Run typecheck to see what still points at them**

Run: `npx tsc --noEmit`
Expected: errors in `src/index.ts` (the legacy exports) and `src/test-utils.ts` (`unwrap` imports `Result`).

- [ ] **Step 3: Trim `test-utils.ts` and rewrite `index.ts`**

`src/test-utils.ts` keeps `assertClose` and `assertAllClose` only; remove `unwrap` and the `Result` import.

`src/index.ts`:

```ts
// The valuator's public surface. Everything the CLI does is callable in-process.
export type {
  BalanceSheet,
  Company,
  CostOfCapital,
  Estimate,
  Exposure,
  Fx,
  HistoricalRanges,
  Holdings,
  Identity,
  Market,
  OtherClaims,
  Peer,
  RangeBand,
  ReportedHolding,
  SpotRate,
} from "./domain/company.ts";
export type {
  Financials,
  FiscalYear,
  OperatingFinancials,
  OperatingLtm,
  Period,
  ReportedFiscalYear,
  ReportedLtm,
  ReportedPeriod,
} from "./domain/financials.ts";
export type { Basis, Classification, Currency, IsoDate, NonEmpty, Unit } from "./domain/types.ts";
export type {
  CyclicalAssumptions,
  CyclicalRevenueBase,
  DcfAssumptions,
  Holding,
  NavAssumptions,
  ScenarioTriple,
  SensitivityAxes,
  Terminal,
  Valuation,
} from "./domain/valuation.ts";
export type { Case } from "./input/case.ts";
export { type Decoded, decode } from "./input/decode.ts";
export type { DecodeError, DecodeResult, Resolution, Warning } from "./input/errors.ts";
export type { Facts } from "./input/facts.ts";
export { emitJsonSchema } from "./input/schema.ts";
export {
  computeDcf,
  type DcfInputs,
  type DcfOutcome,
  type DcfValue,
  type YearAssumptions,
  type YearRow,
} from "./math/dcf.ts";
export { computeWacc, type WaccInputs, type WaccResult } from "./math/wacc.ts";
```

In `package.json`, set `"description": "The investment workbench's deterministic valuator: facts and a case in, results out."`.

- [ ] **Step 4: Run the whole check**

Run: `npm run check`
Expected: clean; the test count drops by the legacy suites and the domain's `DcfAssumptions` is exported without collision.

- [ ] **Step 5: Commit**

```bash
git add -A src/index.ts src/test-utils.ts package.json
git commit -m "chore: delete the legacy math, its parse layer and the Nova golden

result.ts, validate.ts, dcf-parse.ts and the old dcf.ts and wacc.ts are
replaced by src/math/, which takes inputs from decode and never re-validates.
The Nova golden pinned Python's output and goes with them."
```

**Checkpoint 1.** What exists: WACC and DCF in `src/math/` with cited worked examples and property grids, the legacy layer gone, four small changes to plan 1's surface. Present the rulings from Tasks 1 and 3 and wait.

---

### Task 5: `math/reverse-dcf.ts`

**Files:**
- Create: `src/math/reverse-dcf.ts`
- Create: `src/math/reverse-dcf.test.ts`

**Interfaces:**
- Consumes: `computeDcf`, `DcfInputs`, `YearAssumptions` from `src/math/dcf.ts`.
- Produces:

```ts
export type ReverseDcfInputs = {
  readonly targetValuePerShare: number;
  readonly revenueBase: number;
  readonly ebitMargin: number;
  readonly capexPctRevenue: number;
  readonly daPctRevenue: number;
  readonly taxRate: number;
  readonly wacc: number;
  readonly netDebt: number;
  readonly shares: number;
  readonly horizonYears: number;      // integer >= 1
  readonly terminalGrowth: number;
};
export const GROWTH_BRACKET: { readonly low: -0.5; readonly high: 1 };
export type ReverseDcfOutcome =
  | { readonly kind: "solved"; readonly impliedGrowth: number }
  | { readonly kind: "unsolvable"; readonly reason: "terminalGrowthNotBelowWacc" | "noGrowthInBracketMatchesPrice" };
export function dcfInputsAtGrowth(inputs: ReverseDcfInputs, growth: number): DcfInputs;
export function solveImpliedGrowth(inputs: ReverseDcfInputs): ReverseDcfOutcome;
```

- [ ] **Step 1: Write the failing tests**

`src/math/reverse-dcf.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { assertClose } from "../test-utils.ts";
import { computeDcf } from "./dcf.ts";
import { dcfInputsAtGrowth, type ReverseDcfInputs, solveImpliedGrowth } from "./reverse-dcf.ts";

const base: ReverseDcfInputs = {
  targetValuePerShare: 50,
  revenueBase: 1000,
  ebitMargin: 0.15,
  capexPctRevenue: 0.04,
  daPctRevenue: 0.03,
  taxRate: 0.25,
  wacc: 0.09,
  netDebt: 200,
  shares: 100,
  horizonYears: 10,
  terminalGrowth: 0.02,
};

function valueAt(inputs: ReverseDcfInputs, growth: number): number {
  const r = computeDcf(dcfInputsAtGrowth(inputs, growth));
  if (r.kind !== "value") throw new Error(r.reason);
  return r.valuePerShare;
}

test("property: the solved growth, fed through the forward DCF, recovers the price", () => {
  for (const target of [20, 35, 50, 80, 120]) {
    for (const wacc of [0.07, 0.09, 0.12]) {
      const inputs = { ...base, targetValuePerShare: target, wacc };
      const r = solveImpliedGrowth(inputs);
      assert.equal(r.kind, "solved", `target ${target} wacc ${wacc}`);
      if (r.kind !== "solved") continue;
      const recovered = valueAt(inputs, r.impliedGrowth);
      assert.ok(Math.abs(recovered - target) / target < 1e-9, `${recovered} vs ${target}`);
    }
  }
});

test("a growth known in advance is found", () => {
  const target = valueAt(base, 0.065);
  const r = solveImpliedGrowth({ ...base, targetValuePerShare: target });
  assert.equal(r.kind, "solved");
  if (r.kind !== "solved") return;
  assertClose(r.impliedGrowth, 0.065, 1e-9);
});

test("the horizon builds that many identical years with no working capital drag", () => {
  const five = dcfInputsAtGrowth({ ...base, horizonYears: 5 }, 0.1);
  assert.equal(five.years.length, 5);
  assert.deepEqual(five.years[0], {
    revenueGrowth: 0.1,
    ebitMargin: 0.15,
    capexPctRevenue: 0.04,
    daPctRevenue: 0.03,
  });
  assert.equal(five.workingCapitalPctRevenue, 0);
  assert.deepEqual(five.terminal, { kind: "perpetuityGrowth", growth: 0.02 });
});

test("terminal growth at or above wacc is unsolvable with that reason", () => {
  assert.deepEqual(solveImpliedGrowth({ ...base, terminalGrowth: 0.09 }), {
    kind: "unsolvable",
    reason: "terminalGrowthNotBelowWacc",
  });
});

test("a negative-margin base period cannot reach a positive price", () => {
  const r = solveImpliedGrowth({ ...base, ebitMargin: -0.05, daPctRevenue: 0 });
  assert.deepEqual(r, { kind: "unsolvable", reason: "noGrowthInBracketMatchesPrice" });
});

test("a price beyond what any growth in the bracket reaches is unsolvable, not clamped", () => {
  const atTop = valueAt(base, 1);
  const r = solveImpliedGrowth({ ...base, targetValuePerShare: atTop * 2 });
  assert.deepEqual(r, { kind: "unsolvable", reason: "noGrowthInBracketMatchesPrice" });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test src/math/reverse-dcf.test.ts`
Expected: FAIL, cannot find module `./reverse-dcf.ts`.

- [ ] **Step 3: Write the module**

`src/math/reverse-dcf.ts`:

```ts
/**
 * Reverse DCF: the constant revenue growth over the horizon that makes the
 * forward DCF's value per share equal the price, holding the base period's
 * margin and capex and D&A ratios, no working capital drag, and a Gordon
 * terminal at the given growth.
 *
 * Solved by bisection. Value is not monotone in growth when the FCFF margin
 * is negative, so the bracket's end points are checked for a sign change
 * first: no sign change means no growth in the bracket reaches the price,
 * which is reported rather than guessed.
 */

import { isNonEmpty } from "../domain/types.ts";
import { computeDcf, type DcfInputs, type YearAssumptions } from "./dcf.ts";

export type ReverseDcfInputs = {
  readonly targetValuePerShare: number;
  readonly revenueBase: number;
  readonly ebitMargin: number;
  readonly capexPctRevenue: number;
  readonly daPctRevenue: number;
  readonly taxRate: number;
  readonly wacc: number;
  readonly netDebt: number;
  readonly shares: number;
  /** An integer of at least 1; the selector's option, not user input. */
  readonly horizonYears: number;
  readonly terminalGrowth: number;
};

export const GROWTH_BRACKET = { low: -0.5, high: 1 } as const;

const MAX_ITERATIONS = 200;
const GROWTH_TOLERANCE = 1e-14;

export type ReverseDcfOutcome =
  | { readonly kind: "solved"; readonly impliedGrowth: number }
  | {
      readonly kind: "unsolvable";
      readonly reason: "terminalGrowthNotBelowWacc" | "noGrowthInBracketMatchesPrice";
    };

export function dcfInputsAtGrowth(inputs: ReverseDcfInputs, growth: number): DcfInputs {
  const year: YearAssumptions = {
    revenueGrowth: growth,
    ebitMargin: inputs.ebitMargin,
    capexPctRevenue: inputs.capexPctRevenue,
    daPctRevenue: inputs.daPctRevenue,
  };
  const years = Array.from({ length: inputs.horizonYears }, () => year);
  if (!isNonEmpty(years)) throw new Error("horizonYears must be at least 1");
  return {
    revenueBase: inputs.revenueBase,
    taxRate: inputs.taxRate,
    wacc: inputs.wacc,
    netDebt: inputs.netDebt,
    shares: inputs.shares,
    years,
    workingCapitalPctRevenue: 0,
    terminal: { kind: "perpetuityGrowth", growth: inputs.terminalGrowth },
  };
}

export function solveImpliedGrowth(inputs: ReverseDcfInputs): ReverseDcfOutcome {
  if (inputs.terminalGrowth >= inputs.wacc) {
    return { kind: "unsolvable", reason: "terminalGrowthNotBelowWacc" };
  }
  const gap = (growth: number): number => {
    const r = computeDcf(dcfInputsAtGrowth(inputs, growth));
    if (r.kind !== "value") throw new Error("unreachable: the precondition was checked");
    return r.valuePerShare - inputs.targetValuePerShare;
  };
  let low = GROWTH_BRACKET.low;
  let high = GROWTH_BRACKET.high;
  let gapLow = gap(low);
  const gapHigh = gap(high);
  if (gapLow === 0) return { kind: "solved", impliedGrowth: low };
  if (gapHigh === 0) return { kind: "solved", impliedGrowth: high };
  if (Math.sign(gapLow) === Math.sign(gapHigh)) {
    return { kind: "unsolvable", reason: "noGrowthInBracketMatchesPrice" };
  }
  for (let i = 0; i < MAX_ITERATIONS && high - low > GROWTH_TOLERANCE; i += 1) {
    const mid = (low + high) / 2;
    const gapMid = gap(mid);
    if (gapMid === 0) return { kind: "solved", impliedGrowth: mid };
    if (Math.sign(gapMid) === Math.sign(gapLow)) {
      low = mid;
      gapLow = gapMid;
    } else {
      high = mid;
    }
  }
  return { kind: "solved", impliedGrowth: (low + high) / 2 };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test src/math/reverse-dcf.test.ts`
Expected: 6 pass. If the round trip misses 1e-9 relative, the bracket shrank to the tolerance but the value is steep there; lower `GROWTH_TOLERANCE` to `1e-15` before touching the test.

- [ ] **Step 5: Commit**

```bash
git add src/math/reverse-dcf.ts src/math/reverse-dcf.test.ts
git commit -m "feat(math): reverse dcf by bisection, proved by the forward round trip"
```

---

### Task 6: `math/sensitivity.ts`

**Files:**
- Create: `src/math/sensitivity.ts`
- Create: `src/math/sensitivity.test.ts`

**Interfaces:**
- Consumes: `computeDcf`, `DcfInputs` from `src/math/dcf.ts`; `NonEmpty` from the domain types.
- Produces:

```ts
export type SensitivityInputs = {
  readonly base: DcfInputs;
  readonly waccSteps: NonEmpty<number>;             // absolute deltas, must include 0
  readonly terminalGrowthSteps: NonEmpty<number>;   // likewise
};
export type SensitivityResult = {
  readonly axes: { readonly wacc: readonly number[]; readonly terminalGrowth: readonly number[] | null };
  readonly grid: readonly (readonly (number | null)[])[];   // grid[i][j]: wacc axis i, growth axis j
  readonly base: readonly [number, number];
};
export function computeSensitivity(inputs: SensitivityInputs): SensitivityResult;
```

- [ ] **Step 1: Write the failing tests**

`src/math/sensitivity.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { computeDcf, type DcfInputs } from "./dcf.ts";
import { computeSensitivity } from "./sensitivity.ts";

const year = { revenueGrowth: 0.05, ebitMargin: 0.15, capexPctRevenue: 0.04, daPctRevenue: 0.03 };
const base: DcfInputs = {
  revenueBase: 1000,
  taxRate: 0.25,
  wacc: 0.09,
  netDebt: 200,
  shares: 100,
  years: [year, year, year, year, year],
  workingCapitalPctRevenue: 0.05,
  terminal: { kind: "perpetuityGrowth", growth: 0.02 },
};
const steps = [-0.01, -0.005, 0, 0.005, 0.01] as const;

test("property: the base case sits at the centre and equals the plain DCF", () => {
  const r = computeSensitivity({ base, waccSteps: [...steps], terminalGrowthSteps: [...steps] });
  assert.deepEqual(r.base, [2, 2]);
  const plain = computeDcf(base);
  assert.equal(plain.kind, "value");
  if (plain.kind !== "value") return;
  assert.equal(r.grid[2]?.[2], plain.valuePerShare);
  assert.deepEqual(r.axes.wacc, [0.08, 0.085, 0.09, 0.095, 0.1]);
  assert.deepEqual(r.axes.terminalGrowth, [0.01, 0.015, 0.02, 0.025, 0.03]);
});

test("property: cells decrease along the wacc axis and increase along the growth axis", () => {
  const r = computeSensitivity({ base, waccSteps: [...steps], terminalGrowthSteps: [...steps] });
  for (const row of r.grid) {
    for (let j = 1; j < row.length; j += 1) {
      const a = row[j - 1];
      const b = row[j];
      if (a !== null && b !== null && a !== undefined && b !== undefined) assert.ok(b > a);
    }
  }
  for (let j = 0; j < steps.length; j += 1) {
    for (let i = 1; i < r.grid.length; i += 1) {
      const a = r.grid[i - 1]?.[j];
      const b = r.grid[i]?.[j];
      if (a !== null && b !== null && a !== undefined && b !== undefined) assert.ok(b < a);
    }
  }
});

test("steps are sorted before use so the axes read low to high", () => {
  const r = computeSensitivity({
    base,
    waccSteps: [0.01, 0, -0.01],
    terminalGrowthSteps: [0, 0.005],
  });
  assert.deepEqual(r.axes.wacc, [0.08, 0.09, 0.1]);
  assert.deepEqual(r.base, [1, 0]);
});

test("a cell whose growth meets its wacc is null, not infinite", () => {
  const tight: DcfInputs = { ...base, wacc: 0.03, terminal: { kind: "perpetuityGrowth", growth: 0.02 } };
  const r = computeSensitivity({ base: tight, waccSteps: [-0.01, 0], terminalGrowthSteps: [0, 0.01] });
  // wacc 0.02 with growth 0.02 and 0.03: both undefined; wacc 0.03 with growth 0.03: undefined.
  assert.deepEqual(r.grid.map((row) => row.map((c) => c === null)), [
    [true, true],
    [false, true],
  ]);
  for (const row of r.grid) for (const c of row) assert.ok(c === null || Number.isFinite(c));
});

test("an exit-multiple terminal sweeps wacc only", () => {
  const exit: DcfInputs = { ...base, terminal: { kind: "exitMultiple", multiple: 10, on: "evEbit" } };
  const r = computeSensitivity({ base: exit, waccSteps: [...steps], terminalGrowthSteps: [...steps] });
  assert.equal(r.axes.terminalGrowth, null);
  assert.equal(r.grid.length, 5);
  assert.ok(r.grid.every((row) => row.length === 1));
  assert.deepEqual(r.base, [2, 0]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test src/math/sensitivity.test.ts`
Expected: FAIL, cannot find module `./sensitivity.ts`.

- [ ] **Step 3: Write the module**

`src/math/sensitivity.ts`:

```ts
/**
 * Value per share over a WACC x terminal-growth grid. Steps are absolute
 * deltas around the base inputs and are sorted so each axis reads low to
 * high and monotonicity is a property. A cell the Gordon formula cannot
 * define is null. With an exit-multiple terminal, growth has no meaning and
 * the grid is one column wide.
 */

import type { NonEmpty } from "../domain/types.ts";
import { computeDcf, type DcfInputs, type Terminal } from "./dcf.ts";

export type SensitivityInputs = {
  readonly base: DcfInputs;
  readonly waccSteps: NonEmpty<number>;
  readonly terminalGrowthSteps: NonEmpty<number>;
};

export type SensitivityResult = {
  readonly axes: {
    readonly wacc: readonly number[];
    readonly terminalGrowth: readonly number[] | null;
  };
  /** grid[i][j]: wacc axis i, terminal growth axis j. */
  readonly grid: readonly (readonly (number | null)[])[];
  readonly base: readonly [number, number];
};

function sorted(steps: readonly number[]): readonly number[] {
  return [...steps].sort((a, b) => a - b);
}

function indexOfZero(steps: readonly number[]): number {
  const i = steps.indexOf(0);
  if (i < 0) throw new Error("unreachable: decode requires a 0 step");
  return i;
}

function withGrowth(terminal: Terminal, delta: number): Terminal {
  return terminal.kind === "perpetuityGrowth"
    ? { kind: "perpetuityGrowth", growth: terminal.growth + delta }
    : terminal;
}

function cell(base: DcfInputs, waccDelta: number, growthDelta: number): number | null {
  const r = computeDcf({
    ...base,
    wacc: base.wacc + waccDelta,
    terminal: withGrowth(base.terminal, growthDelta),
  });
  return r.kind === "value" ? r.valuePerShare : null;
}

export function computeSensitivity(inputs: SensitivityInputs): SensitivityResult {
  const { base } = inputs;
  const waccSteps = sorted(inputs.waccSteps);
  const sweepsGrowth = base.terminal.kind === "perpetuityGrowth";
  const growthSteps = sweepsGrowth ? sorted(inputs.terminalGrowthSteps) : [0];
  const grid = waccSteps.map((dw) => growthSteps.map((dg) => cell(base, dw, dg)));
  return {
    axes: {
      wacc: waccSteps.map((d) => base.wacc + d),
      terminalGrowth:
        base.terminal.kind === "perpetuityGrowth"
          ? growthSteps.map((d) => base.terminal.growth + d)
          : null,
    },
    grid,
    base: [indexOfZero(waccSteps), indexOfZero(growthSteps)],
  };
}
```

If `tsc` complains that `base.terminal.growth` is not narrowed inside the ternary, bind `const terminal = base.terminal;` first and narrow on that.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test src/math/sensitivity.test.ts`
Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add src/math/sensitivity.ts src/math/sensitivity.test.ts
git commit -m "feat(math): sensitivity grid with sorted axes and null for undefined cells"
```

---

### Task 7: `math/multiples.ts`

**Files:**
- Create: `src/math/multiples.ts`
- Create: `src/math/multiples.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:

```ts
export type MultipleInputs = {
  readonly marketCap: number;
  readonly enterpriseValue: number;
  readonly netIncome: number | null;
  readonly ebit: number | null;
  readonly ebitda: number | null;
  readonly revenue: number | null;
  readonly bookValue: number | null;
};
export const METRICS: readonly ["peTrailing", "evEbit", "evEbitda", "evRevenue", "priceBook"];
export type Metric = (typeof METRICS)[number];
export type Multiples = { readonly [M in Metric]: number | null };
export type Position = "below" | "within" | "above";
export function computeMultiples(inputs: MultipleInputs): Multiples;   // null when the denominator is null or <= 0
export function positionInBand(current: number | null, low: number | null, high: number | null): Position | null;
export function median(values: readonly number[]): number | null;
```

- [ ] **Step 1: Write the failing tests**

`src/math/multiples.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { computeMultiples, median, positionInBand } from "./multiples.ts";

const inputs = {
  marketCap: 24380,
  enterpriseValue: 26380,
  netIncome: 1020,
  ebit: 1380,
  ebitda: 1750,
  revenue: 11400,
  bookValue: 6200,
};

test("each multiple is its numerator over its denominator", () => {
  assert.deepEqual(computeMultiples(inputs), {
    peTrailing: 24380 / 1020,
    evEbit: 26380 / 1380,
    evEbitda: 26380 / 1750,
    evRevenue: 26380 / 11400,
    priceBook: 24380 / 6200,
  });
});

test("a null, zero or negative denominator gives null, never a negative multiple", () => {
  const loss = computeMultiples({ ...inputs, netIncome: -50, ebit: 0, ebitda: null });
  assert.equal(loss.peTrailing, null);
  assert.equal(loss.evEbit, null);
  assert.equal(loss.evEbitda, null);
  assert.notEqual(loss.evRevenue, null);
});

test("position against a band is below, within or above, and null when anything is missing", () => {
  assert.equal(positionInBand(10, 12, 20), "below");
  assert.equal(positionInBand(12, 12, 20), "within");
  assert.equal(positionInBand(20, 12, 20), "within");
  assert.equal(positionInBand(21, 12, 20), "above");
  assert.equal(positionInBand(null, 12, 20), null);
  assert.equal(positionInBand(15, null, 20), null);
  assert.equal(positionInBand(15, 12, null), null);
});

test("median of an odd, even and empty list", () => {
  assert.equal(median([19, 22, 15]), 19);
  assert.equal(median([19, 22]), 20.5);
  assert.equal(median([]), null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test src/math/multiples.test.ts`
Expected: FAIL, cannot find module `./multiples.ts`.

- [ ] **Step 3: Write the module**

`src/math/multiples.ts`:

```ts
/**
 * Current valuation multiples and where they sit. A multiple over a
 * non-positive denominator has no meaning (a loss-maker has no P/E), so it
 * is null rather than a negative number an advisor could misread as cheap.
 */

export type MultipleInputs = {
  readonly marketCap: number;
  readonly enterpriseValue: number;
  readonly netIncome: number | null;
  readonly ebit: number | null;
  readonly ebitda: number | null;
  readonly revenue: number | null;
  readonly bookValue: number | null;
};

export const METRICS = ["peTrailing", "evEbit", "evEbitda", "evRevenue", "priceBook"] as const;
export type Metric = (typeof METRICS)[number];

export type Multiples = { readonly [M in Metric]: number | null };

export type Position = "below" | "within" | "above";

function ratio(numerator: number, denominator: number | null): number | null {
  return denominator === null || denominator <= 0 ? null : numerator / denominator;
}

export function computeMultiples(inputs: MultipleInputs): Multiples {
  return {
    peTrailing: ratio(inputs.marketCap, inputs.netIncome),
    evEbit: ratio(inputs.enterpriseValue, inputs.ebit),
    evEbitda: ratio(inputs.enterpriseValue, inputs.ebitda),
    evRevenue: ratio(inputs.enterpriseValue, inputs.revenue),
    priceBook: ratio(inputs.marketCap, inputs.bookValue),
  };
}

export function positionInBand(
  current: number | null,
  low: number | null,
  high: number | null,
): Position | null {
  if (current === null || low === null || high === null) return null;
  if (current < low) return "below";
  if (current > high) return "above";
  return "within";
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid];
  const lower = sorted[mid - 1];
  if (upper === undefined) return null;
  return sorted.length % 2 === 1 || lower === undefined ? upper : (lower + upper) / 2;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test src/math/multiples.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add src/math/multiples.ts src/math/multiples.test.ts
git commit -m "feat(math): multiples, band position and peer median"
```

---

### Task 8: `math/normalised-earnings.ts`

**Files:**
- Create: `src/math/normalised-earnings.ts`
- Create: `src/math/normalised-earnings.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:

```ts
export type Triple = { readonly bear: number; readonly base: number; readonly bull: number };
export type NormalisedEarningsInputs = {
  readonly revenueBase: number;
  readonly netDebt: number;
  readonly shares: number;
  readonly ebitMargin: Triple;
  readonly evEbitMultiple: Triple;
};
export type ScenarioValue = { readonly ebit: number; readonly ev: number; readonly equity: number; readonly valuePerShare: number };
export type NormalisedEarningsResult = { readonly bear: ScenarioValue; readonly base: ScenarioValue; readonly bull: ScenarioValue };
export function computeNormalisedEarnings(inputs: NormalisedEarningsInputs): NormalisedEarningsResult;
```

- [ ] **Step 1: Write the failing tests**

`src/math/normalised-earnings.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { assertClose } from "../test-utils.ts";
import { computeNormalisedEarnings, type NormalisedEarningsInputs } from "./normalised-earnings.ts";

const inputs: NormalisedEarningsInputs = {
  revenueBase: 10000,
  netDebt: 2000,
  shares: 100,
  ebitMargin: { bear: 0.09, base: 0.12, bull: 0.14 },
  evEbitMultiple: { bear: 10, base: 13, bull: 16 },
};

test("each scenario is revenue x margin x multiple, less net debt, per share", () => {
  const r = computeNormalisedEarnings(inputs);
  assert.deepEqual(r.base, { ebit: 1200, ev: 15600, equity: 13600, valuePerShare: 136 });
  assert.deepEqual(r.bear, { ebit: 900, ev: 9000, equity: 7000, valuePerShare: 70 });
  assertClose(r.bull.ebit, 1400, 1e-9);
  assertClose(r.bull.ev, 22400, 1e-9);
  assertClose(r.bull.valuePerShare, 204, 1e-9);
});

test("property: bear <= base <= bull whenever the inputs are ordered and revenue is non-negative", () => {
  for (const revenueBase of [0, 500, 10000, 250000]) {
    for (const [m1, m2, m3] of [
      [0.05, 0.1, 0.15],
      [0.1, 0.1, 0.1],
      [-0.02, 0.05, 0.2],
    ]) {
      for (const [x1, x2, x3] of [
        [8, 12, 16],
        [12, 12, 12],
      ]) {
        const r = computeNormalisedEarnings({
          ...inputs,
          revenueBase,
          ebitMargin: { bear: m1 ?? 0, base: m2 ?? 0, bull: m3 ?? 0 },
          evEbitMultiple: { bear: x1 ?? 0, base: x2 ?? 0, bull: x3 ?? 0 },
        });
        assert.ok(r.bear.valuePerShare <= r.base.valuePerShare + 1e-12);
        assert.ok(r.base.valuePerShare <= r.bull.valuePerShare + 1e-12);
      }
    }
  }
});

test("a negative-margin bear case is a negative EV, reported, not clamped", () => {
  const r = computeNormalisedEarnings({
    ...inputs,
    ebitMargin: { bear: -0.05, base: 0.1, bull: 0.15 },
  });
  assert.ok(r.bear.ev < 0);
  assert.ok(Number.isFinite(r.bear.valuePerShare));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test src/math/normalised-earnings.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Write the module**

`src/math/normalised-earnings.ts`:

```ts
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

function scenario(inputs: NormalisedEarningsInputs, margin: number, multiple: number): ScenarioValue {
  const ebit = inputs.revenueBase * margin;
  const ev = ebit * multiple;
  const equity = ev - inputs.netDebt;
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test src/math/normalised-earnings.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add src/math/normalised-earnings.ts src/math/normalised-earnings.test.ts
git commit -m "feat(math): normalised earnings across bear, base and bull"
```

---

### Task 9: `math/nav.ts`

**Files:**
- Create: `src/math/nav.ts`
- Create: `src/math/nav.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:

```ts
export type NavInputs = {
  readonly holdings: readonly { readonly name: string; readonly fairValue: number }[];
  readonly parentNetDebt: number;
  readonly warrantedDiscount: number;
  readonly shares: number;
};
export type NavResult = {
  readonly grossAssetValue: number; readonly parentNetDebt: number; readonly nav: number;
  readonly discountApplied: number; readonly equityValue: number; readonly valuePerShare: number;
};
export function computeNav(inputs: NavInputs): NavResult;
```

- [ ] **Step 1: Write the failing tests**

`src/math/nav.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { assertClose } from "../test-utils.ts";
import { computeNav, type NavInputs } from "./nav.ts";

/**
 * Edison Investment Research on DeA Capital, 23 November 2017, Exhibit 11,
 * sum of the parts: Kenan (Migros) 41.0, Crescita 8.3, Sigla and other
 * direct investments 11.7, private equity and real estate funds 188.9,
 * alternative asset management 150.8, other assets 0.0, net financial
 * position 79.7; group total EUR 480.5m over 256.3m shares, EUR 1.87 per
 * share. A positive net financial position is parent net cash, so
 * parentNetDebt is -79.7; the warranted discount is zero because the note
 * states the undiscounted figure.
 * https://edisongroup.com/research/accelerating-strong-cash-flow-supports-dividends/19953
 */
test("worked example: Edison's DeA Capital sum of the parts", () => {
  const r = computeNav({
    holdings: [
      { name: "Kenan (Migros)", fairValue: 41.0 },
      { name: "Crescita", fairValue: 8.3 },
      { name: "Sigla and other direct investments", fairValue: 11.7 },
      { name: "Private equity and real estate funds", fairValue: 188.9 },
      { name: "Alternative asset management", fairValue: 150.8 },
      { name: "Other assets", fairValue: 0 },
    ],
    parentNetDebt: -79.7,
    warrantedDiscount: 0,
    shares: 256.3,
  });
  assertClose(r.nav, 480.5, 0.1);
  assertClose(r.valuePerShare, 1.87, 0.01);
  assert.equal(r.discountApplied, 0);
});

const base: NavInputs = {
  holdings: [
    { name: "A", fairValue: 18000 },
    { name: "B", fairValue: 9500 },
    { name: "C", fairValue: 4200 },
  ],
  parentNetDebt: 300,
  warrantedDiscount: 0.2,
  shares: 280,
};

test("the discount applies to NAV after parent net debt", () => {
  const r = computeNav(base);
  assert.equal(r.grossAssetValue, 31700);
  assert.equal(r.nav, 31400);
  assertClose(r.discountApplied, 6280, 1e-9);
  assertClose(r.equityValue, 25120, 1e-9);
  assertClose(r.valuePerShare, 25120 / 280, 1e-9);
});

test("property: value is linear in holdings value and decreasing in the discount", () => {
  const v = (scale: number, discount: number) =>
    computeNav({
      ...base,
      holdings: base.holdings.map((h) => ({ ...h, fairValue: h.fairValue * scale })),
      warrantedDiscount: discount,
    }).valuePerShare;
  const v1 = v(1, 0.2);
  const v2 = v(2, 0.2);
  const v3 = v(3, 0.2);
  assertClose(v3 - v2, v2 - v1, 1e-9, "linear");
  let previous = Number.POSITIVE_INFINITY;
  for (const d of [0, 0.1, 0.2, 0.5, 0.9]) {
    const current = v(1, d);
    assert.ok(current < previous, `discount ${d}`);
    previous = current;
  }
});

test("parent net debt above the gross asset value gives a negative NAV, reported as is", () => {
  const r = computeNav({ ...base, parentNetDebt: 40000 });
  assert.ok(r.nav < 0);
  assert.ok(r.valuePerShare < 0);
  assert.ok(Number.isFinite(r.valuePerShare));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test src/math/nav.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Write the module**

`src/math/nav.ts`:

```ts
/**
 * Net asset value for a holding company: the sum of holdings at fair value,
 * less parent net debt, less the discount the case says the market warrants,
 * per share. A NAV below zero is reported as it is.
 */

export type NavInputs = {
  readonly holdings: readonly { readonly name: string; readonly fairValue: number }[];
  readonly parentNetDebt: number;
  readonly warrantedDiscount: number;
  readonly shares: number;
};

export type NavResult = {
  readonly grossAssetValue: number;
  readonly parentNetDebt: number;
  readonly nav: number;
  readonly discountApplied: number;
  readonly equityValue: number;
  readonly valuePerShare: number;
};

export function computeNav(inputs: NavInputs): NavResult {
  const grossAssetValue = inputs.holdings.reduce((sum, h) => sum + h.fairValue, 0);
  const nav = grossAssetValue - inputs.parentNetDebt;
  const discountApplied = nav * inputs.warrantedDiscount;
  const equityValue = nav - discountApplied;
  return {
    grossAssetValue,
    parentNetDebt: inputs.parentNetDebt,
    nav,
    discountApplied,
    equityValue,
    valuePerShare: equityValue / inputs.shares,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test src/math/nav.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add src/math/nav.ts src/math/nav.test.ts
git commit -m "feat(math): nav with Edison's DeA Capital sum of the parts as the worked example"
```

---

### Task 10: `math/fx.ts`

**Files:**
- Create: `src/math/fx.ts`
- Create: `src/math/fx.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:

```ts
export type FxExposure = { readonly pair: string; readonly revenueShare: number; readonly costShare: number };
export type FxShock = { readonly revenueFactor: number; readonly costFactor: number };
export type FxMove = { readonly pct: number; readonly valuePerShare: number | null };
export type FxPairResult = { readonly pair: string; readonly moves: readonly FxMove[] };
export function shockFor(exposure: FxExposure, pct: number): FxShock;
export function computeFxSensitivity(
  exposures: readonly FxExposure[],
  moves: readonly number[],
  revalue: (shock: FxShock) => number | null,
): readonly FxPairResult[];
```

The math takes the revaluation as a function so it knows nothing about the DCF. The selector in Task 12 supplies one that reruns the DCF under the shock.

- [ ] **Step 1: Write the failing tests**

`src/math/fx.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { computeFxSensitivity, shockFor } from "./fx.ts";

test("a move scales revenue and cost by their shares in that currency", () => {
  assert.deepEqual(shockFor({ pair: "USDSEK", revenueShare: 0.4, costShare: 0.1 }, 0.1), {
    revenueFactor: 1.04,
    costFactor: 1.01,
  });
  assert.deepEqual(shockFor({ pair: "USDSEK", revenueShare: 0.4, costShare: 0.1 }, -0.05), {
    revenueFactor: 0.98,
    costFactor: 0.995,
  });
});

test("each pair gets every move, revalued through the supplied function", () => {
  const exposures = [
    { pair: "USDSEK", revenueShare: 0.5, costShare: 0 },
    { pair: "EURSEK", revenueShare: 0.2, costShare: 0.3 },
  ];
  const r = computeFxSensitivity(exposures, [-0.1, 0.1], (s) => 100 * s.revenueFactor - 50 * s.costFactor);
  assert.deepEqual(r, [
    { pair: "USDSEK", moves: [{ pct: -0.1, valuePerShare: 45 }, { pct: 0.1, valuePerShare: 55 }] },
    {
      pair: "EURSEK",
      moves: [
        { pct: -0.1, valuePerShare: 100 * 0.98 - 50 * 0.97 },
        { pct: 0.1, valuePerShare: 100 * 1.02 - 50 * 1.03 },
      ],
    },
  ]);
});

test("property: zero exposure leaves the value unchanged, and a null revaluation is carried", () => {
  const unchanged = computeFxSensitivity(
    [{ pair: "USDSEK", revenueShare: 0, costShare: 0 }],
    [-0.1, -0.05, 0.05, 0.1],
    (s) => (s.revenueFactor === 1 && s.costFactor === 1 ? 42 : null),
  );
  assert.ok(unchanged[0]?.moves.every((m) => m.valuePerShare === 42));
  const undefinedValue = computeFxSensitivity(
    [{ pair: "USDSEK", revenueShare: 1, costShare: 0 }],
    [0.1],
    () => null,
  );
  assert.deepEqual(undefinedValue[0]?.moves, [{ pct: 0.1, valuePerShare: null }]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test src/math/fx.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Write the module**

`src/math/fx.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test src/math/fx.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Run the whole check and commit**

Run: `npm run check`
Expected: clean.

```bash
git add src/math/fx.ts src/math/fx.test.ts
git commit -m "feat(math): fx translation shocks over a caller-supplied revaluation"
```

**Checkpoint 2.** What exists: all eight math modules, each with its own input type, property grids, and the worked examples that have a source. Present the rulings from Tasks 5 to 10 (bracket and reasons, sorted steps and the exit-multiple grid, the FX reading, the examples that have no citation) and wait.

---

### Task 11: Selectors for the facts-only sections

**Files:**
- Create: `src/select/base-period.ts`, `src/select/wacc.ts`, `src/select/derived.ts`, `src/select/multiples.ts`, `src/select/reverse-dcf.ts`
- Create: `src/select/facts-only.test.ts`
- Modify: `src/input/errors.ts` (`reverseDcfUnavailable.reason` becomes a closed union)

**Interfaces:**
- Consumes: `Company`, `CostOfCapital`, `OtherClaims` from the domain; `Financials`, `OperatingFinancials`, `Period`, `ReportedPeriod` from the domain; `WaccInputs` (Task 2); `MultipleInputs`, `Metric` (Task 7); `ReverseDcfInputs` (Task 5).
- Produces:

```ts
// base-period.ts
export type BasePeriodRef =
  | { readonly kind: "ltm"; readonly fy: null; readonly endDate: IsoDate }
  | { readonly kind: "fiscalYear"; readonly fy: number; readonly endDate: IsoDate };
export function selectOperatingBasePeriod(f: OperatingFinancials): { ref: BasePeriodRef; period: Period };
export function selectLatestReportedPeriod(f: Financials): { ref: BasePeriodRef; period: ReportedPeriod };
export function selectUsableReportedPeriod(f: Financials, usable: (p: ReportedPeriod) => boolean): { ref: BasePeriodRef; period: ReportedPeriod } | null;
// wacc.ts
export function selectWacc(c: CostOfCapital): WaccInputs;        // taxRate = taxRateForDiscounting
// derived.ts
export type Derived = { marketCap: number; enterpriseValue: number; netDebt: number; otherClaims: OtherClaims };
export function selectDerived(company: Company): Derived;
// multiples.ts
export type Band = { readonly low: number | null; readonly high: number | null };
export function selectMultipleInputs(derived: Derived, period: ReportedPeriod, bookValue: number | null): MultipleInputs;
export function selectBands(company: Company, metric: Metric): { band5y: Band; band10y: Band };
export function selectPeerValues(company: Company, metric: Metric): readonly number[];
// reverse-dcf.ts
export type ReverseDcfOptions = { readonly horizonYears: number; readonly terminalGrowth: number };
export const DEFAULT_REVERSE_DCF_OPTIONS: ReverseDcfOptions;      // { horizonYears: 10, terminalGrowth: 0.02 }
export type ReverseDcfSelection =
  | { readonly kind: "ready"; readonly inputs: ReverseDcfInputs; readonly basePeriod: BasePeriodRef }
  | { readonly kind: "unavailable"; readonly reason: "noUsableBasePeriod" };
export function selectReverseDcf(company: Company, wacc: number, options: ReverseDcfOptions): ReverseDcfSelection;
```

Two tax rates, two uses: `selectWacc` takes `taxRateForDiscounting` (the debt tax shield in the discount rate); every DCF projection takes `taxRateForCashFlows` (NOPAT). The domain's `CostOfCapital` names both so this is a lookup, not a decision.

- [ ] **Step 1: Write the failing tests**

`src/select/facts-only.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Company } from "../domain/company.ts";
import { decode } from "../input/decode.ts";
import { loadFixture, mutate } from "../test-fixtures.ts";
import { selectLatestReportedPeriod, selectUsableReportedPeriod } from "./base-period.ts";
import { selectDerived } from "./derived.ts";
import { selectBands, selectMultipleInputs, selectPeerValues } from "./multiples.ts";
import { DEFAULT_REVERSE_DCF_OPTIONS, selectReverseDcf } from "./reverse-dcf.ts";
import { selectWacc } from "./wacc.ts";

function company(name: string, edit?: (doc: unknown) => unknown): Company {
  const doc = edit ? edit(loadFixture(name)) : loadFixture(name);
  const r = decode(doc);
  assert.ok(r.success, JSON.stringify(r.error));
  return r.data.company;
}

test("the base period is the ltm row when present, else the latest fiscal year", () => {
  const acme = selectLatestReportedPeriod(company("acme.facts").financials);
  assert.deepEqual(acme.ref, { kind: "ltm", fy: null, endDate: "2026-06-30" });
  assert.equal(acme.period.revenue, 11400);
  const holdco = selectLatestReportedPeriod(company("holdco.facts").financials);
  assert.deepEqual(holdco.ref, { kind: "fiscalYear", fy: 2025, endDate: "2025-12-31" });
});

test("a usable base period is searched newest first and may not exist", () => {
  const needsCapex = (p: { capex: number | null }) => p.capex !== null;
  const noLtmCapex = company("acme.facts", (d) => mutate(d, "financials.ltm.capex", null));
  const found = selectUsableReportedPeriod(noLtmCapex.financials, needsCapex);
  assert.deepEqual(found?.ref, { kind: "fiscalYear", fy: 2025, endDate: "2025-12-31" });
  assert.equal(selectUsableReportedPeriod(company("holdco.facts").financials, needsCapex), null);
});

test("wacc inputs take the discounting tax rate", () => {
  const c = company("acme.facts");
  const w = selectWacc(c.costOfCapital);
  assert.equal(w.taxRate, 0.206);
  assert.equal(w.beta, 1.1);
  assert.equal(w.countryPremium, 0);
});

test("derived figures: market cap is price x shares in millions, EV adds net debt", () => {
  const d = selectDerived(company("acme.facts"));
  assert.equal(d.marketCap, 212 * 115);
  assert.equal(d.netDebt, 2000);
  assert.equal(d.enterpriseValue, 212 * 115 + 2000);
  assert.deepEqual(d.otherClaims, { operatingLeaseLiabilities: 700, pensionObligations: 450 });
});

test("multiple inputs come from the base period and book value", () => {
  const c = company("acme.facts");
  const inputs = selectMultipleInputs(
    selectDerived(c),
    selectLatestReportedPeriod(c.financials).period,
    c.balanceSheet.totalEquity,
  );
  assert.deepEqual(inputs, {
    marketCap: 212 * 115,
    enterpriseValue: 212 * 115 + 2000,
    netIncome: 1020,
    ebit: 1380,
    ebitda: 1750,
    revenue: 11400,
    bookValue: 6200,
  });
});

test("bands come from historical ranges; evRevenue has none; peers have no priceBook", () => {
  const c = company("acme.facts");
  assert.deepEqual(selectBands(c, "peTrailing"), {
    band5y: { low: 14, high: 28 },
    band10y: { low: 11, high: 28 },
  });
  assert.deepEqual(selectBands(c, "evRevenue"), {
    band5y: { low: null, high: null },
    band10y: { low: null, high: null },
  });
  assert.deepEqual(selectPeerValues(c, "peTrailing"), [19, 22]);
  assert.deepEqual(selectPeerValues(c, "evEbitda"), [11]);
  assert.deepEqual(selectPeerValues(c, "priceBook"), []);
  const bare = company("holdco.facts");
  assert.deepEqual(selectBands(bare, "evEbit").band5y, { low: null, high: null });
  assert.deepEqual(selectPeerValues(bare, "evEbit"), []);
});

test("reverse dcf inputs hold the base period's ratios with capex and D&A as positive shares", () => {
  const c = company("acme.facts");
  const s = selectReverseDcf(c, 0.085, DEFAULT_REVERSE_DCF_OPTIONS);
  assert.equal(s.kind, "ready");
  if (s.kind !== "ready") return;
  assert.deepEqual(s.basePeriod, { kind: "ltm", fy: null, endDate: "2026-06-30" });
  assert.equal(s.inputs.targetValuePerShare, 212);
  assert.equal(s.inputs.revenueBase, 11400);
  assert.equal(s.inputs.ebitMargin, 1380 / 11400);
  assert.equal(s.inputs.capexPctRevenue, 450 / 11400);
  assert.equal(s.inputs.daPctRevenue, 370 / 11400);
  assert.equal(s.inputs.taxRate, 0.21, "cash flows are taxed at the effective rate");
  assert.equal(s.inputs.wacc, 0.085);
  assert.equal(s.inputs.netDebt, 2000);
  assert.equal(s.inputs.shares, 115);
  assert.equal(s.inputs.horizonYears, 10);
  assert.equal(s.inputs.terminalGrowth, 0.02);
});

test("a company with no row carrying revenue, ebit, capex and D&A has no reverse dcf", () => {
  const s = selectReverseDcf(company("holdco.facts"), 0.08, DEFAULT_REVERSE_DCF_OPTIONS);
  assert.deepEqual(s, { kind: "unavailable", reason: "noUsableBasePeriod" });
  const zeroRevenue = company("acme.facts", (d) =>
    mutate(mutate(d, "financials.ltm.revenue", 0), "financials.fiscalYears.4.revenue", 0),
  );
  const partial = selectReverseDcf(zeroRevenue, 0.08, DEFAULT_REVERSE_DCF_OPTIONS);
  assert.equal(partial.kind, "ready");
  if (partial.kind !== "ready") return;
  assert.deepEqual(partial.basePeriod, { kind: "fiscalYear", fy: 2024, endDate: "2024-12-31" });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test src/select/facts-only.test.ts`
Expected: FAIL, cannot find module `./base-period.ts`.

- [ ] **Step 3: Write the five selectors**

`src/select/base-period.ts`:

```ts
/**
 * Which period stands for "now". The LTM row when there is one, else the
 * latest fiscal year; for a use that needs particular figures, the newest
 * row that has them. Total over OperatingFinancials, because fiscalYears is
 * NonEmpty; nullable over reported rows, because a holding company may have
 * no row with revenue at all.
 */

import type {
  Financials,
  OperatingFinancials,
  Period,
  ReportedPeriod,
} from "../domain/financials.ts";
import type { IsoDate } from "../domain/types.ts";

export type BasePeriodRef =
  | { readonly kind: "ltm"; readonly fy: null; readonly endDate: IsoDate }
  | { readonly kind: "fiscalYear"; readonly fy: number; readonly endDate: IsoDate };

export type OperatingBasePeriod = { readonly ref: BasePeriodRef; readonly period: Period };
export type ReportedBasePeriod = { readonly ref: BasePeriodRef; readonly period: ReportedPeriod };

export function selectOperatingBasePeriod(f: OperatingFinancials): OperatingBasePeriod {
  if (f.ltm !== null) {
    return { ref: { kind: "ltm", fy: null, endDate: f.ltm.endDate }, period: f.ltm };
  }
  const latest = f.fiscalYears[f.fiscalYears.length - 1] ?? f.fiscalYears[0];
  return {
    ref: { kind: "fiscalYear", fy: latest.fy, endDate: latest.endDate },
    period: latest,
  };
}

/** Candidates newest first: the LTM row, then fiscal years from the latest back. */
function candidates(f: Financials): readonly ReportedBasePeriod[] {
  const years = [...f.fiscalYears].reverse().map((y) => ({
    ref: { kind: "fiscalYear" as const, fy: y.fy, endDate: y.endDate },
    period: y,
  }));
  if (f.ltm === null) return years;
  return [{ ref: { kind: "ltm", fy: null, endDate: f.ltm.endDate }, period: f.ltm }, ...years];
}

export function selectLatestReportedPeriod(f: Financials): ReportedBasePeriod {
  const first = candidates(f)[0];
  if (first === undefined) throw new Error("unreachable: fiscalYears is NonEmpty");
  return first;
}

export function selectUsableReportedPeriod(
  f: Financials,
  usable: (p: ReportedPeriod) => boolean,
): ReportedBasePeriod | null {
  return candidates(f).find((c) => usable(c.period)) ?? null;
}
```

`src/select/wacc.ts`:

```ts
import type { CostOfCapital } from "../domain/company.ts";
import type { WaccInputs } from "../math/wacc.ts";

/** The discount rate's tax shield uses the discounting rate; cash flows use the other one. */
export function selectWacc(c: CostOfCapital): WaccInputs {
  return {
    riskFree: c.riskFree,
    erp: c.erp,
    beta: c.beta,
    countryPremium: c.countryPremium,
    preTaxCostOfDebt: c.preTaxCostOfDebt,
    taxRate: c.taxRateForDiscounting,
    equityWeight: c.equityWeight,
    debtWeight: c.debtWeight,
  };
}
```

`src/select/derived.ts`:

```ts
import type { Company, OtherClaims } from "../domain/company.ts";

/** Price is reporting currency per share and shares are millions, so the product is millions. */
export type Derived = {
  readonly marketCap: number;
  readonly enterpriseValue: number;
  readonly netDebt: number;
  readonly otherClaims: OtherClaims;
};

export function selectDerived(company: Company): Derived {
  const marketCap = company.market.price * company.market.shares;
  return {
    marketCap,
    enterpriseValue: marketCap + company.netDebt,
    netDebt: company.netDebt,
    otherClaims: company.otherClaims,
  };
}
```

`src/select/multiples.ts`:

```ts
import type { Company, Peer, RangeBand } from "../domain/company.ts";
import type { ReportedPeriod } from "../domain/financials.ts";
import type { Metric, MultipleInputs } from "../math/multiples.ts";
import type { Derived } from "./derived.ts";

export type Band = { readonly low: number | null; readonly high: number | null };

const NO_BAND: RangeBand = { y5Low: null, y5High: null, y10Low: null, y10High: null };

export function selectMultipleInputs(
  derived: Derived,
  period: ReportedPeriod,
  bookValue: number | null,
): MultipleInputs {
  return {
    marketCap: derived.marketCap,
    enterpriseValue: derived.enterpriseValue,
    netIncome: period.netIncome,
    ebit: period.ebit,
    ebitda: period.ebitda,
    revenue: period.revenue,
    bookValue,
  };
}

/** Facts carry no EV/revenue band, so that metric has none. */
function bandFor(company: Company, metric: Metric): RangeBand {
  const ranges = company.historicalRanges;
  if (ranges === null || metric === "evRevenue") return NO_BAND;
  return ranges[metric];
}

export function selectBands(
  company: Company,
  metric: Metric,
): { readonly band5y: Band; readonly band10y: Band } {
  const b = bandFor(company, metric);
  return {
    band5y: { low: b.y5Low, high: b.y5High },
    band10y: { low: b.y10Low, high: b.y10High },
  };
}

/** Peers carry no price-to-book, so that metric has no peer set. */
export function selectPeerValues(company: Company, metric: Metric): readonly number[] {
  if (metric === "priceBook") return [];
  const key: keyof Peer = metric;
  return company.peers.flatMap((p) => {
    const v = p[key];
    return typeof v === "number" ? [v] : [];
  });
}
```

`src/select/reverse-dcf.ts`:

```ts
/**
 * The reverse DCF prices the company from facts alone: the newest period
 * with revenue, EBIT, capex and D&A supplies the ratios. Facts report capex
 * and D&A as the cash-flow statement does, so the absolute value turns an
 * outflow into a share of revenue whichever sign the researcher used.
 */

import type { Company } from "../domain/company.ts";
import type { ReportedPeriod } from "../domain/financials.ts";
import type { ReverseDcfInputs } from "../math/reverse-dcf.ts";
import { type BasePeriodRef, selectUsableReportedPeriod } from "./base-period.ts";

export type ReverseDcfOptions = {
  readonly horizonYears: number;
  readonly terminalGrowth: number;
};

export const DEFAULT_REVERSE_DCF_OPTIONS: ReverseDcfOptions = {
  horizonYears: 10,
  terminalGrowth: 0.02,
};

export type ReverseDcfSelection =
  | {
      readonly kind: "ready";
      readonly inputs: ReverseDcfInputs;
      readonly basePeriod: BasePeriodRef;
    }
  | { readonly kind: "unavailable"; readonly reason: "noUsableBasePeriod" };

type Usable = ReportedPeriod & {
  readonly revenue: number;
  readonly ebit: number;
  readonly capex: number;
  readonly depreciationAmortization: number;
};

function isUsable(p: ReportedPeriod): p is Usable {
  return (
    p.revenue !== null &&
    p.revenue > 0 &&
    p.ebit !== null &&
    p.capex !== null &&
    p.depreciationAmortization !== null
  );
}

export function selectReverseDcf(
  company: Company,
  wacc: number,
  options: ReverseDcfOptions,
): ReverseDcfSelection {
  const base = selectUsableReportedPeriod(company.financials, isUsable);
  if (base === null || !isUsable(base.period)) {
    return { kind: "unavailable", reason: "noUsableBasePeriod" };
  }
  const p = base.period;
  return {
    kind: "ready",
    basePeriod: base.ref,
    inputs: {
      targetValuePerShare: company.market.price,
      revenueBase: p.revenue,
      ebitMargin: p.ebit / p.revenue,
      capexPctRevenue: Math.abs(p.capex) / p.revenue,
      daPctRevenue: Math.abs(p.depreciationAmortization) / p.revenue,
      taxRate: company.costOfCapital.taxRateForCashFlows,
      wacc,
      netDebt: company.netDebt,
      shares: company.market.shares,
      horizonYears: options.horizonYears,
      terminalGrowth: options.terminalGrowth,
    },
  };
}
```

The second `isUsable` call after `selectUsableReportedPeriod` is there because the generic selector returns a `ReportedPeriod`; the guard narrows it without a cast.

In `src/input/errors.ts`, change the last resolution kind to:

```ts
  | {
      readonly kind: "reverseDcfUnavailable";
      readonly reason:
        | "noUsableBasePeriod"
        | "terminalGrowthNotBelowWacc"
        | "noGrowthInBracketMatchesPrice";
    };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test src/select/facts-only.test.ts && npm run check`
Expected: 8 pass; check clean. If a plan-1 test constructs a `reverseDcfUnavailable` with a free-form reason, change its reason to one of the three.

- [ ] **Step 5: Commit**

```bash
git add src/select src/input/errors.ts
git commit -m "feat(select): base period, wacc, derived, multiples and reverse dcf selectors"
```

---

### Task 12: Selectors for the case-driven sections

**Files:**
- Create: `src/select/dcf.ts`, `src/select/normalised-earnings.ts`, `src/select/nav.ts`, `src/select/fx.ts`
- Create: `src/select/valuation.test.ts`

**Interfaces:**
- Consumes: `Valuation`, `SensitivityAxes` from the domain; `DcfInputs`, `computeDcf` (Task 3); `WaccResult`, `computeWacc` (Task 2); `SensitivityInputs` (Task 6); `NormalisedEarningsInputs` (Task 8); `NavInputs` (Task 9); `FxExposure`, `FxShock` (Task 10); `selectOperatingBasePeriod`, `BasePeriodRef`, `selectWacc` (Task 11); `Resolution`.
- Produces:

```ts
// dcf.ts
export type DcfValuation = Extract<Valuation, { method: "dcf" }>;
export type DcfSelection = {
  readonly inputs: DcfInputs;
  readonly wacc: WaccResult & { readonly overridden: boolean };
  readonly basePeriod: BasePeriodRef;
  readonly basePeriodEbit: number;
  readonly resolutions: readonly Resolution[];
};
export function selectDcf(valuation: DcfValuation, company: Company): DcfSelection;
export function selectSensitivity(inputs: DcfInputs, axes: SensitivityAxes): SensitivityInputs;
// normalised-earnings.ts
export type NormalisedValuation = Extract<Valuation, { method: "normalisedEarnings" }>;
export type RevenueBaseSummary = { readonly kind: "ltm" | "averageFy"; readonly value: number; readonly window: readonly number[] | null };
export type NormalisedSelection = { readonly inputs: NormalisedEarningsInputs; readonly revenueBase: RevenueBaseSummary; readonly ltmEbitMargin: number | null };
export function selectNormalisedEarnings(valuation: NormalisedValuation, company: Company): NormalisedSelection;
// nav.ts
export type NavValuation = Extract<Valuation, { method: "nav" }>;
export function selectNav(valuation: NavValuation, company: Company): NavInputs;
// fx.ts
export type FxBase = { readonly inputs: DcfInputs; readonly baseEbit: number };
export type FxSelection =
  | { readonly kind: "ready"; readonly exposures: readonly FxExposure[]; readonly revalue: (shock: FxShock) => number | null }
  | { readonly kind: "unavailable"; readonly reason: "noDcfValuation" };
export function selectFx(fx: Fx, currency: Currency, dcf: FxBase | null): FxSelection;
```

- [ ] **Step 1: Write the failing tests**

`src/select/valuation.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Company } from "../domain/company.ts";
import type { Valuation } from "../domain/valuation.ts";
import { decode } from "../input/decode.ts";
import { computeDcf } from "../math/dcf.ts";
import { assertClose } from "../test-utils.ts";
import { loadFixture, mutate } from "../test-fixtures.ts";
import { selectDcf, selectSensitivity } from "./dcf.ts";
import { selectFx } from "./fx.ts";
import { selectNav } from "./nav.ts";
import { selectNormalisedEarnings } from "./normalised-earnings.ts";

function pair(facts: unknown, c: unknown): { company: Company; valuation: Valuation } {
  const r = decode(facts, c);
  assert.ok(r.success, JSON.stringify(r.error));
  assert.notEqual(r.data.valuation, null);
  if (r.data.valuation === null) throw new Error("unreachable");
  return { company: r.data.company, valuation: r.data.valuation };
}

const acme = () => loadFixture("acme.facts");
const dcfCase = () => loadFixture("acme-dcf.case");

test("dcf inputs zip the four paths, take the cash-flow tax rate and the ltm base", () => {
  const { company, valuation } = pair(acme(), dcfCase());
  assert.equal(valuation.method, "dcf");
  if (valuation.method !== "dcf") return;
  const s = selectDcf(valuation, company);
  assert.equal(s.inputs.years.length, 10);
  assert.deepEqual(s.inputs.years[0], {
    revenueGrowth: 0.07,
    ebitMargin: 0.12,
    capexPctRevenue: 0.04,
    daPctRevenue: 0.033,
  });
  assert.equal(s.inputs.revenueBase, 11400);
  assert.equal(s.basePeriodEbit, 1380);
  assert.equal(s.inputs.taxRate, 0.21);
  assert.equal(s.inputs.netDebt, 2000);
  assert.equal(s.inputs.shares, 115);
  assert.equal(s.inputs.workingCapitalPctRevenue, 0.1);
  assert.deepEqual(s.inputs.terminal, { kind: "perpetuityGrowth", growth: 0.02 });
  assert.deepEqual(s.basePeriod, { kind: "ltm", fy: null, endDate: "2026-06-30" });
  assert.equal(s.wacc.overridden, false);
  assertClose(s.inputs.wacc, s.wacc.wacc, 1e-15);
  assertClose(s.wacc.costOfEquity, 0.025 + 1.1 * 0.055, 1e-12);
  assert.deepEqual(s.resolutions, []);
});

test("without an ltm row the latest fiscal year is the base and a resolution says so", () => {
  const { company, valuation } = pair(mutate(acme(), "financials.ltm", null), dcfCase());
  if (valuation.method !== "dcf") throw new Error("unreachable");
  const s = selectDcf(valuation, company);
  assert.deepEqual(s.basePeriod, { kind: "fiscalYear", fy: 2025, endDate: "2025-12-31" });
  assert.equal(s.inputs.revenueBase, 11000);
  assert.deepEqual(s.resolutions, [{ kind: "dcfBasePeriodFromFiscalYear", fy: 2025 }]);
});

test("a wacc override replaces the discount rate and is flagged; the components stay computed", () => {
  const overridden = mutate(
    mutate(dcfCase(), "overrides.wacc", 0.07),
    "overrides.rationale",
    "sector convention",
  );
  const { company, valuation } = pair(acme(), overridden);
  if (valuation.method !== "dcf") throw new Error("unreachable");
  const s = selectDcf(valuation, company);
  assert.equal(s.inputs.wacc, 0.07);
  assert.equal(s.wacc.wacc, 0.07);
  assert.equal(s.wacc.overridden, true);
  assertClose(s.wacc.costOfEquity, 0.025 + 1.1 * 0.055, 1e-12);
});

test("sensitivity inputs carry the case's axes around the selected dcf", () => {
  const { company, valuation } = pair(acme(), dcfCase());
  if (valuation.method !== "dcf") throw new Error("unreachable");
  const s = selectDcf(valuation, company);
  const sens = selectSensitivity(s.inputs, valuation.sensitivity);
  assert.equal(sens.base, s.inputs);
  assert.deepEqual(sens.waccSteps, [-0.01, -0.005, 0, 0.005, 0.01]);
});

test("normalised earnings average the window's revenue and report the ltm margin", () => {
  const { company, valuation } = pair(acme(), loadFixture("acme-normalised.case"));
  if (valuation.method !== "normalisedEarnings") throw new Error("unreachable");
  const s = selectNormalisedEarnings(valuation, company);
  assertClose(s.inputs.revenueBase, (9800 + 10400 + 11000) / 3, 1e-9);
  assert.deepEqual(s.revenueBase, {
    kind: "averageFy",
    value: s.inputs.revenueBase,
    window: [2023, 2024, 2025],
  });
  assertClose(s.ltmEbitMargin ?? 0, 1380 / 11400, 1e-12);
  assert.equal(s.inputs.netDebt, 2000);
  assert.equal(s.inputs.shares, 115);
  assert.deepEqual(s.inputs.ebitMargin, { bear: 0.09, base: 0.12, bull: 0.14 });
});

test("an ltm revenue base has no window and a company without ltm has no ltm margin", () => {
  const ltmPolicy = mutate(loadFixture("acme-normalised.case"), "method.revenueBase", { kind: "ltm" });
  const { company, valuation } = pair(acme(), ltmPolicy);
  if (valuation.method !== "normalisedEarnings") throw new Error("unreachable");
  const s = selectNormalisedEarnings(valuation, company);
  assert.deepEqual(s.revenueBase, { kind: "ltm", value: 11400, window: null });

  const noLtm = pair(mutate(acme(), "financials.ltm", null), loadFixture("acme-normalised.case"));
  if (noLtm.valuation.method !== "normalisedEarnings") throw new Error("unreachable");
  assert.equal(selectNormalisedEarnings(noLtm.valuation, noLtm.company).ltmEbitMargin, null);
});

test("nav inputs are the holdings, parent net debt, discount and shares", () => {
  const { company, valuation } = pair(loadFixture("holdco.facts"), loadFixture("holdco-nav.case"));
  if (valuation.method !== "nav") throw new Error("unreachable");
  assert.deepEqual(selectNav(valuation, company), {
    holdings: [
      { name: "Listed Industrial AB", fairValue: 18000 },
      { name: "Listed Bank AB", fairValue: 9500 },
      { name: "Private Software Group", fairValue: 4200 },
    ],
    parentNetDebt: 300,
    warrantedDiscount: 0.2,
    shares: 280,
  });
});

test("fx needs a dcf; with one, a move shifts base revenue and every year's margin", () => {
  const dualCase = mutate(dcfCase(), "ticker", "DUAL");
  const { company, valuation } = pair(loadFixture("dual.facts"), dualCase);
  if (valuation.method !== "dcf" || company.fx === null) throw new Error("unreachable");
  assert.deepEqual(selectFx(company.fx, company.currency, null), {
    kind: "unavailable",
    reason: "noDcfValuation",
  });

  const s = selectDcf(valuation, company);
  const fx = selectFx(company.fx, company.currency, { inputs: s.inputs, baseEbit: s.basePeriodEbit });
  assert.equal(fx.kind, "ready");
  if (fx.kind !== "ready") return;
  assert.deepEqual(fx.exposures, [{ pair: "USDEUR", revenueShare: 0.4, costShare: 0 }]);

  const unmoved = fx.revalue({ revenueFactor: 1, costFactor: 1 });
  const plain = computeDcf(s.inputs);
  assert.equal(plain.kind, "value");
  if (plain.kind !== "value") return;
  assertClose(unmoved ?? Number.NaN, plain.valuePerShare, 1e-9);

  const up = fx.revalue({ revenueFactor: 1.04, costFactor: 1 });
  assert.ok(up !== null && up > plain.valuePerShare, "more revenue at the same costs is worth more");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test src/select/valuation.test.ts`
Expected: FAIL, cannot find module `./dcf.ts`.

- [ ] **Step 3: Write the four selectors**

`src/select/dcf.ts`:

```ts
/**
 * From the dcf branch of a Valuation to the math's inputs. The base period is
 * ltm ?? latest fiscal year, resolved here rather than in decode because the
 * fallback always lands. The WACC is computed from the branch's cost of
 * capital (the beta override already applied) and replaced outright by the
 * case's override when there is one.
 */

import type { Company } from "../domain/company.ts";
import { isNonEmpty } from "../domain/types.ts";
import type { SensitivityAxes, Valuation } from "../domain/valuation.ts";
import type { Resolution } from "../input/errors.ts";
import type { DcfInputs, YearAssumptions } from "../math/dcf.ts";
import type { SensitivityInputs } from "../math/sensitivity.ts";
import { computeWacc, type WaccResult } from "../math/wacc.ts";
import { type BasePeriodRef, selectOperatingBasePeriod } from "./base-period.ts";
import { selectWacc } from "./wacc.ts";

export type DcfValuation = Extract<Valuation, { method: "dcf" }>;

export type DcfSelection = {
  readonly inputs: DcfInputs;
  readonly wacc: WaccResult & { readonly overridden: boolean };
  readonly basePeriod: BasePeriodRef;
  readonly basePeriodEbit: number;
  readonly resolutions: readonly Resolution[];
};

function entry(path: readonly number[], i: number): number {
  const v = path[i];
  if (v === undefined) throw new Error("unreachable: the schema requires ten entries");
  return v;
}

function zipYears(a: DcfValuation["assumptions"]): DcfInputs["years"] {
  const years: YearAssumptions[] = a.revenueGrowthPath.map((revenueGrowth, i) => ({
    revenueGrowth,
    ebitMargin: entry(a.ebitMarginPath, i),
    capexPctRevenue: entry(a.capexPctRevenuePath, i),
    daPctRevenue: entry(a.daPctRevenuePath, i),
  }));
  if (!isNonEmpty(years)) throw new Error("unreachable: the schema requires ten entries");
  return years;
}

export function selectDcf(valuation: DcfValuation, company: Company): DcfSelection {
  const base = selectOperatingBasePeriod(valuation.financials);
  const resolutions: Resolution[] =
    base.ref.kind === "fiscalYear" ? [{ kind: "dcfBasePeriodFromFiscalYear", fy: base.ref.fy }] : [];
  const computed = computeWacc(selectWacc(valuation.costOfCapital));
  const wacc =
    valuation.waccOverride === null
      ? { ...computed, overridden: false }
      : { ...computed, wacc: valuation.waccOverride, overridden: true };
  return {
    inputs: {
      revenueBase: base.period.revenue,
      taxRate: valuation.costOfCapital.taxRateForCashFlows,
      wacc: wacc.wacc,
      netDebt: company.netDebt,
      shares: company.market.shares,
      years: zipYears(valuation.assumptions),
      workingCapitalPctRevenue: valuation.assumptions.workingCapitalPctRevenue,
      terminal: valuation.assumptions.terminal,
    },
    wacc,
    basePeriod: base.ref,
    basePeriodEbit: base.period.ebit,
    resolutions,
  };
}

export function selectSensitivity(inputs: DcfInputs, axes: SensitivityAxes): SensitivityInputs {
  return { base: inputs, waccSteps: axes.waccSteps, terminalGrowthSteps: axes.terminalGrowthSteps };
}
```

`src/select/normalised-earnings.ts`:

```ts
import type { Company } from "../domain/company.ts";
import type { Valuation } from "../domain/valuation.ts";
import { assertNever } from "../exhaustive.ts";
import type { NormalisedEarningsInputs } from "../math/normalised-earnings.ts";

export type NormalisedValuation = Extract<Valuation, { method: "normalisedEarnings" }>;

export type RevenueBaseSummary = {
  readonly kind: "ltm" | "averageFy";
  readonly value: number;
  readonly window: readonly number[] | null;
};

export type NormalisedSelection = {
  readonly inputs: NormalisedEarningsInputs;
  readonly revenueBase: RevenueBaseSummary;
  readonly ltmEbitMargin: number | null;
};

function summarise(base: NormalisedValuation["revenueBase"]): RevenueBaseSummary {
  switch (base.kind) {
    case "ltm":
      return { kind: "ltm", value: base.period.revenue, window: null };
    case "averageFy": {
      const total = base.window.reduce((sum, y) => sum + y.revenue, 0);
      return {
        kind: "averageFy",
        value: total / base.window.length,
        window: base.window.map((y) => y.fy),
      };
    }
    default:
      return assertNever(base);
  }
}

export function selectNormalisedEarnings(
  valuation: NormalisedValuation,
  company: Company,
): NormalisedSelection {
  const revenueBase = summarise(valuation.revenueBase);
  const ltm = valuation.financials.ltm;
  return {
    inputs: {
      revenueBase: revenueBase.value,
      netDebt: company.netDebt,
      shares: company.market.shares,
      ebitMargin: valuation.assumptions.ebitMargin,
      evEbitMultiple: valuation.assumptions.evEbitMultiple,
    },
    revenueBase,
    ltmEbitMargin: ltm === null || ltm.revenue === 0 ? null : ltm.ebit / ltm.revenue,
  };
}
```

`src/select/nav.ts`:

```ts
import type { Company } from "../domain/company.ts";
import type { Valuation } from "../domain/valuation.ts";
import type { NavInputs } from "../math/nav.ts";

export type NavValuation = Extract<Valuation, { method: "nav" }>;

export function selectNav(valuation: NavValuation, company: Company): NavInputs {
  return {
    holdings: valuation.holdings.map((h) => ({ name: h.name, fairValue: h.fairValue })),
    parentNetDebt: valuation.parentNetDebt,
    warrantedDiscount: valuation.assumptions.warrantedDiscount,
    shares: company.market.shares,
  };
}
```

`src/select/fx.ts`:

```ts
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
      : [{ pair: `${e.currency}${currency}`, revenueShare: e.revenueShare, costShare: e.costShare ?? 0 }],
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test src/select/valuation.test.ts && npm run check`
Expected: 8 pass; check clean. The dual fixture reports in thousands with revenue in all rows and no LTM row, so the FX test runs the DCF off fiscal year 2025.

- [ ] **Step 5: Commit**

```bash
git add src/select
git commit -m "feat(select): dcf, sensitivity, normalised earnings, nav and fx selectors"
```

---

### Task 13: `results/` and `valuate()`

**Files:**
- Create: `src/results/types.ts`, `src/results/priced-in.ts`, `src/results/assemble.ts`, `src/valuate.ts`
- Create: `src/results/assemble.test.ts`, `src/valuate.test.ts`
- Modify: `src/input/errors.ts` (two resolution kinds)
- Modify: `src/test-utils.ts` (`assertAllFinite`)
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: everything from Tasks 2 to 12; `Decoded`, `decode`; `DecodeResult`, `decoded`, `failed`.
- Produces:

```ts
// results/types.ts
export type ValuatorOptions = { readonly reverseDcf: ReverseDcfOptions; readonly fxMoves: readonly number[] };
export const DEFAULT_VALUATOR_OPTIONS: ValuatorOptions;   // { reverseDcf: DEFAULT_REVERSE_DCF_OPTIONS, fxMoves: [-0.1, -0.05, 0.05, 0.1] }
export type MultipleRow = { metric: Metric; current: number | null; band5y: Band; band10y: Band; position: Position | null; peerMedian: number | null };
export type ReverseDcfSection = { impliedGrowth: number; basePeriod: BasePeriodRef; horizonYears: number; terminalGrowth: number };
export type DcfSection = { method: "dcf"; basePeriod: BasePeriodRef; wacc: WaccResult & { overridden: boolean }; valuePerShare; enterpriseValue; equityValue; terminalValue; pvTerminalValue; terminalValuePctOfEv; pvExplicitPeriod; projection: readonly YearRow[]; terminal: Terminal; notes: readonly DcfNote[] };
export type NormalisedEarningsSection = { method: "normalisedEarnings"; revenueBase: RevenueBaseSummary; scenarios: NormalisedEarningsResult; ltmEbitMargin: number | null };
export type NavSection = { method: "nav"; grossAssetValue; parentNetDebt; nav; discountApplied; equityValue; valuePerShare; lookThroughNav: number | null; holdings: readonly Holding[] };
export type ValuationSection = DcfSection | NormalisedEarningsSection | NavSection;
export type Results = {
  schemaVersion: "1.0";
  inputs: { ticker: string; factsAsOf: IsoDate; caseFactsAsOf: IsoDate | null; classification: Classification | null; theses: readonly string[]; company: Company };
  derived: Derived & { multiples: Multiples; wacc: WaccResult };
  pricedIn: { reverseDcf: ReverseDcfSection | null; multiples: readonly MultipleRow[] };
  valuation: ValuationSection | null;
  sensitivity: SensitivityResult | null;
  fx: readonly FxPairResult[] | null;
  resolutions: readonly Resolution[];
  warnings: readonly Warning[];
};
// results/priced-in.ts
export function multipleRows(company: Company, multiples: Multiples): readonly MultipleRow[];
export function reverseDcfSection(company: Company, wacc: number, options: ReverseDcfOptions): { section: ReverseDcfSection | null; resolutions: readonly Resolution[] };
// results/assemble.ts
export function assemble(decoded: Decoded, options?: ValuatorOptions): Results;
// valuate.ts
export function valuate(factsJson: unknown, caseJson?: unknown, options?: ValuatorOptions): DecodeResult<Results>;
// test-utils.ts
export function assertAllFinite(value: unknown, path?: string): void;
// errors.ts, two new kinds
| { kind: "dcfUnavailable"; reason: "terminalGrowthNotBelowWacc" }
| { kind: "fxUnavailable"; reason: "noDcfValuation" }
```

Every number in `Results` is a plain `number`; the `null`s are typed. `assertAllFinite` is the test-side guard that no `NaN` or `Infinity` reached the object `JSON.stringify` will quietly rewrite.

- [ ] **Step 1: Write the failing tests**

Add to `src/test-utils.ts`:

```ts
/** Walks any JSON-like value; fails on the first NaN or infinite number, naming its path. */
export function assertAllFinite(value: unknown, path = "$"): void {
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), `${path} is ${value}`);
  } else if (Array.isArray(value)) {
    for (const [i, v] of value.entries()) assertAllFinite(v, `${path}[${i}]`);
  } else if (typeof value === "object" && value !== null) {
    for (const [k, v] of Object.entries(value)) assertAllFinite(v, `${path}.${k}`);
  }
}
```

`src/results/assemble.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { decode, type Decoded } from "../input/decode.ts";
import { assertAllFinite, assertClose } from "../test-utils.ts";
import { loadFixture, mutate, VALID_FIXTURES } from "../test-fixtures.ts";
import { assemble } from "./assemble.ts";

function decoded(facts: unknown, c?: unknown): Decoded {
  const r = decode(facts, c);
  assert.ok(r.success, JSON.stringify(r.error));
  return r.data;
}

const acme = () => loadFixture("acme.facts");
const dcfCase = () => loadFixture("acme-dcf.case");

const SECTIONS = [
  "schemaVersion",
  "inputs",
  "derived",
  "pricedIn",
  "valuation",
  "sensitivity",
  "fx",
  "resolutions",
  "warnings",
];

for (const f of VALID_FIXTURES.facts) {
  test(`${f} alone: every section present, valuation null, every number finite`, () => {
    const r = assemble(decoded(loadFixture(f)));
    assert.deepEqual(Object.keys(r), SECTIONS);
    assert.equal(r.valuation, null);
    assert.equal(r.sensitivity, null);
    assert.equal(r.inputs.classification, null);
    assert.deepEqual(r.inputs.theses, []);
    assert.equal(r.inputs.caseFactsAsOf, null);
    assert.equal(r.pricedIn.multiples.length, 5);
    assertAllFinite(r);
  });
}

test("inputs echo the case and the decoded company", () => {
  const d = decoded(acme(), dcfCase());
  const r = assemble(d);
  assert.equal(r.inputs.ticker, "ACME");
  assert.equal(r.inputs.factsAsOf, "2026-10-01");
  assert.equal(r.inputs.caseFactsAsOf, "2026-10-01");
  assert.equal(r.inputs.classification, "garp");
  assert.deepEqual(r.inputs.theses, ["ai-disruption-overreaction", "eu-digital-sovereignty"]);
  assert.equal(r.inputs.company, d.company);
  assert.equal(r.warnings, d.warnings);
});

test("derived carries market cap, EV, net debt, other claims, multiples and the facts' wacc", () => {
  const r = assemble(decoded(acme()));
  assert.equal(r.derived.marketCap, 24380);
  assert.equal(r.derived.enterpriseValue, 26380);
  assert.equal(r.derived.netDebt, 2000);
  assertClose(r.derived.multiples.peTrailing ?? 0, 24380 / 1020, 1e-9);
  assertClose(r.derived.multiples.priceBook ?? 0, 24380 / 6200, 1e-9);
  assertClose(r.derived.wacc.costOfEquity, 0.025 + 1.1 * 0.055, 1e-12);
});

test("priced-in multiples: position against the 5y band, peer median, nulls where facts are silent", () => {
  const r = assemble(decoded(acme()));
  const byMetric = new Map(r.pricedIn.multiples.map((m) => [m.metric, m]));
  const pe = byMetric.get("peTrailing");
  assert.equal(pe?.position, "within");
  assert.equal(pe?.peerMedian, 20.5);
  assert.deepEqual(pe?.band10y, { low: 11, high: 28 });
  const evRevenue = byMetric.get("evRevenue");
  assert.equal(evRevenue?.position, null);
  assertClose(evRevenue?.peerMedian ?? 0, 1.95, 1e-12);
  assert.equal(byMetric.get("priceBook")?.peerMedian, null);
  assert.equal(byMetric.get("evEbitda")?.position, null, "band is all null");
});

test("the reverse dcf prices the current share price and names its base period", () => {
  const r = assemble(decoded(acme()));
  assert.notEqual(r.pricedIn.reverseDcf, null);
  assert.deepEqual(r.pricedIn.reverseDcf?.basePeriod, { kind: "ltm", fy: null, endDate: "2026-06-30" });
  assert.equal(r.pricedIn.reverseDcf?.horizonYears, 10);
  assert.equal(r.pricedIn.reverseDcf?.terminalGrowth, 0.02);
  assert.ok(Number.isFinite(r.pricedIn.reverseDcf?.impliedGrowth));
});

test("a company with no usable base period has no reverse dcf and a resolution saying why", () => {
  const r = assemble(decoded(loadFixture("holdco.facts")));
  assert.equal(r.pricedIn.reverseDcf, null);
  assert.ok(
    r.resolutions.some((x) => x.kind === "reverseDcfUnavailable" && x.reason === "noUsableBasePeriod"),
  );
  assert.notEqual(r.derived.multiples.peTrailing, null, "net income is reported");
  assert.equal(r.derived.multiples.evEbit, null, "ebit is not");
});

test("a dcf case fills valuation and sensitivity; fx is null when facts carry none", () => {
  const r = assemble(decoded(acme(), dcfCase()));
  assert.equal(r.valuation?.method, "dcf");
  if (r.valuation?.method !== "dcf") return;
  assert.equal(r.valuation.wacc.overridden, false);
  assert.equal(r.valuation.projection.length, 10);
  assertClose(r.valuation.pvExplicitPeriod + r.valuation.pvTerminalValue, r.valuation.enterpriseValue, 1e-9);
  assert.deepEqual(r.valuation.terminal, { kind: "perpetuityGrowth", growth: 0.02 });
  assert.deepEqual(r.sensitivity?.base, [2, 2]);
  assert.equal(r.sensitivity?.grid.length, 5);
  assert.equal(r.fx, null);
  assert.ok(!r.resolutions.some((x) => x.kind === "fxUnavailable"));
  assertAllFinite(r);
});

test("terminal growth at or above wacc: valuation and sensitivity null, dcfUnavailable recorded", () => {
  const r = assemble(decoded(acme(), mutate(dcfCase(), "method.terminal.growth", 0.5)));
  assert.equal(r.valuation, null);
  assert.equal(r.sensitivity, null);
  assert.deepEqual(
    r.resolutions.filter((x) => x.kind === "dcfUnavailable"),
    [{ kind: "dcfUnavailable", reason: "terminalGrowthNotBelowWacc" }],
  );
  assertAllFinite(r);
});

test("fx runs off the dcf when facts carry exposures, and is unavailable without a dcf", () => {
  const dual = loadFixture("dual.facts");
  const withDcf = assemble(decoded(dual, mutate(dcfCase(), "ticker", "DUAL")));
  assert.equal(withDcf.fx?.length, 1);
  assert.equal(withDcf.fx?.[0]?.pair, "USDEUR");
  assert.deepEqual(withDcf.fx?.[0]?.moves.map((m) => m.pct), [-0.1, -0.05, 0.05, 0.1]);
  assertAllFinite(withDcf);

  const alone = assemble(decoded(dual));
  assert.equal(alone.fx, null);
  assert.ok(alone.resolutions.some((x) => x.kind === "fxUnavailable" && x.reason === "noDcfValuation"));
});

test("a normalised earnings case fills its section and nothing dcf-specific", () => {
  const r = assemble(decoded(acme(), loadFixture("acme-normalised.case")));
  assert.equal(r.valuation?.method, "normalisedEarnings");
  if (r.valuation?.method !== "normalisedEarnings") return;
  assert.deepEqual(r.valuation.revenueBase.window, [2023, 2024, 2025]);
  assert.ok(r.valuation.scenarios.bear.valuePerShare <= r.valuation.scenarios.bull.valuePerShare);
  assert.equal(r.sensitivity, null);
  assert.equal(r.fx, null);
  assertAllFinite(r);
});

test("a nav case fills its section with the holdings and look-through NAV beside it", () => {
  const r = assemble(decoded(loadFixture("holdco.facts"), loadFixture("holdco-nav.case")));
  assert.equal(r.valuation?.method, "nav");
  if (r.valuation?.method !== "nav") return;
  assert.equal(r.valuation.grossAssetValue, 31700);
  assert.equal(r.valuation.nav, 31400);
  assert.equal(r.valuation.lookThroughNav, 31400);
  assert.equal(r.valuation.holdings.length, 3);
  assertClose(r.valuation.valuePerShare, (31400 * 0.8) / 280, 1e-9);
  assertAllFinite(r);
});

test("resolutions are decode's first, then the assembler's, in order", () => {
  const r = assemble(decoded(mutate(acme(), "financials.ltm", null), dcfCase()));
  const kinds = r.resolutions.map((x) => x.kind);
  assert.deepEqual(kinds.slice(0, 2), ["betaFromSector", "netDebtDerived"]);
  assert.ok(kinds.includes("dcfBasePeriodFromFiscalYear"));
});
```

`src/valuate.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFixture, mutate } from "./test-fixtures.ts";
import { valuate } from "./valuate.ts";

test("valuate runs decode and assemble in-process", () => {
  const r = valuate(loadFixture("acme.facts"), loadFixture("acme-dcf.case"));
  assert.ok(r.success);
  assert.equal(r.data.valuation?.method, "dcf");
});

test("decode errors come back unchanged", () => {
  const r = valuate(mutate(loadFixture("acme.facts"), "market.price", -1));
  assert.equal(r.success, false);
  assert.equal(r.error?.[0]?.path, "market.price");
});

test("options reach the reverse dcf", () => {
  const r = valuate(loadFixture("acme.facts"), undefined, {
    reverseDcf: { horizonYears: 5, terminalGrowth: 0.01 },
    fxMoves: [0.1],
  });
  assert.equal(r.data?.pricedIn.reverseDcf?.horizonYears, 5);
  assert.equal(r.data?.pricedIn.reverseDcf?.terminalGrowth, 0.01);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test src/results/assemble.test.ts src/valuate.test.ts`
Expected: FAIL, cannot find module `./assemble.ts` / `./valuate.ts`.

- [ ] **Step 3: Add the two resolution kinds**

In `src/input/errors.ts`, after `reverseDcfUnavailable`:

```ts
  | { readonly kind: "dcfUnavailable"; readonly reason: "terminalGrowthNotBelowWacc" }
  | { readonly kind: "fxUnavailable"; readonly reason: "noDcfValuation" };
```

- [ ] **Step 4: Write the results types**

`src/results/types.ts`:

```ts
/**
 * results.json. One shape regardless of what ran; a section that could not
 * run is null, and when it had inputs and still could not run, a resolution
 * says why. Nothing here is a formatted sentence.
 */

import type { Company } from "../domain/company.ts";
import type { Classification, IsoDate } from "../domain/types.ts";
import type { Holding, Terminal } from "../domain/valuation.ts";
import type { Resolution, Warning } from "../input/errors.ts";
import type { DcfNote, YearRow } from "../math/dcf.ts";
import type { FxPairResult } from "../math/fx.ts";
import type { Metric, Multiples, Position } from "../math/multiples.ts";
import type { NormalisedEarningsResult } from "../math/normalised-earnings.ts";
import type { SensitivityResult } from "../math/sensitivity.ts";
import type { WaccResult } from "../math/wacc.ts";
import type { BasePeriodRef } from "../select/base-period.ts";
import type { Derived } from "../select/derived.ts";
import type { Band } from "../select/multiples.ts";
import type { RevenueBaseSummary } from "../select/normalised-earnings.ts";
import { DEFAULT_REVERSE_DCF_OPTIONS, type ReverseDcfOptions } from "../select/reverse-dcf.ts";

export type ValuatorOptions = {
  readonly reverseDcf: ReverseDcfOptions;
  readonly fxMoves: readonly number[];
};

export const DEFAULT_VALUATOR_OPTIONS: ValuatorOptions = {
  reverseDcf: DEFAULT_REVERSE_DCF_OPTIONS,
  fxMoves: [-0.1, -0.05, 0.05, 0.1],
};

export type MultipleRow = {
  readonly metric: Metric;
  readonly current: number | null;
  readonly band5y: Band;
  readonly band10y: Band;
  readonly position: Position | null;
  readonly peerMedian: number | null;
};

export type ReverseDcfSection = {
  readonly impliedGrowth: number;
  readonly basePeriod: BasePeriodRef;
  readonly horizonYears: number;
  readonly terminalGrowth: number;
};

export type DcfSection = {
  readonly method: "dcf";
  readonly basePeriod: BasePeriodRef;
  readonly wacc: WaccResult & { readonly overridden: boolean };
  readonly valuePerShare: number;
  readonly enterpriseValue: number;
  readonly equityValue: number;
  readonly terminalValue: number;
  readonly pvTerminalValue: number;
  readonly terminalValuePctOfEv: number;
  readonly pvExplicitPeriod: number;
  readonly projection: readonly YearRow[];
  readonly terminal: Terminal;
  readonly notes: readonly DcfNote[];
};

export type NormalisedEarningsSection = {
  readonly method: "normalisedEarnings";
  readonly revenueBase: RevenueBaseSummary;
  readonly scenarios: NormalisedEarningsResult;
  readonly ltmEbitMargin: number | null;
};

export type NavSection = {
  readonly method: "nav";
  readonly grossAssetValue: number;
  readonly parentNetDebt: number;
  readonly nav: number;
  readonly discountApplied: number;
  readonly equityValue: number;
  readonly valuePerShare: number;
  readonly lookThroughNav: number | null;
  readonly holdings: readonly Holding[];
};

export type ValuationSection = DcfSection | NormalisedEarningsSection | NavSection;

export type Results = {
  readonly schemaVersion: "1.0";
  readonly inputs: {
    readonly ticker: string;
    readonly factsAsOf: IsoDate;
    readonly caseFactsAsOf: IsoDate | null;
    readonly classification: Classification | null;
    readonly theses: readonly string[];
    readonly company: Company;
  };
  /** From facts alone; the wacc here is never overridden. */
  readonly derived: Derived & { readonly multiples: Multiples; readonly wacc: WaccResult };
  readonly pricedIn: {
    readonly reverseDcf: ReverseDcfSection | null;
    readonly multiples: readonly MultipleRow[];
  };
  readonly valuation: ValuationSection | null;
  readonly sensitivity: SensitivityResult | null;
  readonly fx: readonly FxPairResult[] | null;
  readonly resolutions: readonly Resolution[];
  readonly warnings: readonly Warning[];
};
```

- [ ] **Step 5: Write `priced-in.ts`**

`src/results/priced-in.ts`:

```ts
import type { Company } from "../domain/company.ts";
import type { Resolution } from "../input/errors.ts";
import { METRICS, median, type Multiples, positionInBand } from "../math/multiples.ts";
import { solveImpliedGrowth } from "../math/reverse-dcf.ts";
import { selectBands, selectPeerValues } from "../select/multiples.ts";
import { type ReverseDcfOptions, selectReverseDcf } from "../select/reverse-dcf.ts";
import type { MultipleRow, ReverseDcfSection } from "./types.ts";

/** Position is judged against the five-year band; the ten-year one is reported beside it. */
export function multipleRows(company: Company, multiples: Multiples): readonly MultipleRow[] {
  return METRICS.map((metric) => {
    const current = multiples[metric];
    const { band5y, band10y } = selectBands(company, metric);
    return {
      metric,
      current,
      band5y,
      band10y,
      position: positionInBand(current, band5y.low, band5y.high),
      peerMedian: median(selectPeerValues(company, metric)),
    };
  });
}

export function reverseDcfSection(
  company: Company,
  wacc: number,
  options: ReverseDcfOptions,
): { readonly section: ReverseDcfSection | null; readonly resolutions: readonly Resolution[] } {
  const selection = selectReverseDcf(company, wacc, options);
  if (selection.kind === "unavailable") {
    return {
      section: null,
      resolutions: [{ kind: "reverseDcfUnavailable", reason: selection.reason }],
    };
  }
  const outcome = solveImpliedGrowth(selection.inputs);
  if (outcome.kind === "unsolvable") {
    return {
      section: null,
      resolutions: [{ kind: "reverseDcfUnavailable", reason: outcome.reason }],
    };
  }
  return {
    section: {
      impliedGrowth: outcome.impliedGrowth,
      basePeriod: selection.basePeriod,
      horizonYears: options.horizonYears,
      terminalGrowth: options.terminalGrowth,
    },
    resolutions: [],
  };
}
```

- [ ] **Step 6: Write `assemble.ts` and `valuate.ts`**

`src/results/assemble.ts`:

```ts
/**
 * Decoded plus options to Results. The order of work is the order of the
 * sections; resolutions are decode's first, then each section's as it runs.
 */

import type { Company } from "../domain/company.ts";
import type { Valuation } from "../domain/valuation.ts";
import { assertNever } from "../exhaustive.ts";
import type { Decoded } from "../input/decode.ts";
import type { Resolution } from "../input/errors.ts";
import { computeDcf } from "../math/dcf.ts";
import { computeFxSensitivity, type FxPairResult } from "../math/fx.ts";
import { computeMultiples } from "../math/multiples.ts";
import { computeNav } from "../math/nav.ts";
import { computeNormalisedEarnings } from "../math/normalised-earnings.ts";
import { computeSensitivity, type SensitivityResult } from "../math/sensitivity.ts";
import { computeWacc } from "../math/wacc.ts";
import { selectLatestReportedPeriod } from "../select/base-period.ts";
import { selectDcf, selectSensitivity } from "../select/dcf.ts";
import { selectDerived } from "../select/derived.ts";
import { type FxBase, selectFx } from "../select/fx.ts";
import { selectMultipleInputs } from "../select/multiples.ts";
import { selectNav } from "../select/nav.ts";
import { selectNormalisedEarnings } from "../select/normalised-earnings.ts";
import { selectWacc } from "../select/wacc.ts";
import { multipleRows, reverseDcfSection } from "./priced-in.ts";
import {
  DEFAULT_VALUATOR_OPTIONS,
  type Results,
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
    },
    sensitivity: computeSensitivity(selectSensitivity(s.inputs, valuation.sensitivity)),
    fxBase: { inputs: s.inputs, baseEbit: s.basePeriodEbit },
    resolutions: s.resolutions,
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
    default:
      return assertNever(valuation);
  }
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
  return { fx: computeFxSensitivity(s.exposures, moves, s.revalue), resolutions: [] };
}

export function assemble(decoded: Decoded, options: ValuatorOptions = DEFAULT_VALUATOR_OPTIONS): Results {
  const { company } = decoded;
  const derived = selectDerived(company);
  const wacc = computeWacc(selectWacc(company.costOfCapital));
  const base = selectLatestReportedPeriod(company.financials);
  const multiples = computeMultiples(
    selectMultipleInputs(derived, base.period, company.balanceSheet.totalEquity),
  );
  const reverse = reverseDcfSection(company, wacc.wacc, options.reverseDcf);
  const valued = decoded.valuation === null ? NOTHING : value(decoded.valuation, company);
  const fx = fxSection(company, valued.fxBase, options.fxMoves);
  return {
    schemaVersion: "1.0",
    inputs: {
      ticker: company.identity.ticker,
      factsAsOf: company.asOf,
      caseFactsAsOf: decoded.caseFactsAsOf,
      classification: decoded.classification,
      theses: decoded.theses,
      company,
    },
    derived: { ...derived, multiples, wacc },
    pricedIn: { reverseDcf: reverse.section, multiples: multipleRows(company, multiples) },
    valuation: valued.valuation,
    sensitivity: valued.sensitivity,
    fx: fx.fx,
    resolutions: [
      ...decoded.resolutions,
      ...reverse.resolutions,
      ...valued.resolutions,
      ...fx.resolutions,
    ],
    warnings: decoded.warnings,
  };
}
```

`src/valuate.ts`:

```ts
/** The whole valuator in one call, for tests, the CLI and anything in-process. */

import { decode } from "./input/decode.ts";
import { type DecodeResult, decoded, failed } from "./input/errors.ts";
import { assemble } from "./results/assemble.ts";
import { DEFAULT_VALUATOR_OPTIONS, type Results, type ValuatorOptions } from "./results/types.ts";

export function valuate(
  factsJson: unknown,
  caseJson?: unknown,
  options: ValuatorOptions = DEFAULT_VALUATOR_OPTIONS,
): DecodeResult<Results> {
  const d = decode(factsJson, caseJson);
  if (!d.success) return failed(d.error);
  return decoded(assemble(d.data, options));
}
```

Add to `src/index.ts`:

```ts
export { assemble } from "./results/assemble.ts";
export {
  DEFAULT_VALUATOR_OPTIONS,
  type Results,
  type ValuationSection,
  type ValuatorOptions,
} from "./results/types.ts";
export { valuate } from "./valuate.ts";
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm run check`
Expected: clean; the new suites pass. The `evRevenue` peer median of 1.95 is the median of 1.8 and 2.1 from the acme peers. If the `Object.keys` order test fails, the literal in `assemble` is out of order; fix the literal, the shape is the contract.

- [ ] **Step 8: Commit**

```bash
git add src/results src/valuate.ts src/valuate.test.ts src/input/errors.ts src/test-utils.ts src/index.ts
git commit -m "feat(results): assemble results.json from decode, selectors and math

One shape on every run. A section that had inputs and could not run is null
with a resolution naming why: dcfUnavailable, fxUnavailable and the three
reverseDcfUnavailable reasons. valuate() is the in-process entry point."
```

---

### Task 14: `kosing value` and the end-to-end run

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/cli.test.ts`
- Create: `src/cli.e2e.test.ts`

**Interfaces:**
- Consumes: `valuate` (Task 13); `DecodeError`.
- Produces: `CliIo` gains `readFile: (path: string) => string`; `runCli(["value", "--facts", F, "--case", C], io)` writes `results.json` to stdout and returns 0, or `DecodeError[]` as JSON to stderr and returns 1; missing `--facts` or an unknown flag prints usage and returns 2. A file that cannot be read is a `DecodeError` with rule `file.unreadable`; a file that is not JSON is `json.invalid`; both carry `layer: "schema"`, `path: ""`, and `file` set to which document.

- [ ] **Step 1: Write the failing tests**

Replace `capture` in `src/cli.test.ts` with one that takes an in-memory filesystem, and add the value tests:

```ts
import { loadFixture, mutate } from "./test-fixtures.ts";

function capture(files: Record<string, string> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: {
      stdout: (s: string) => out.push(s),
      stderr: (s: string) => err.push(s),
      readFile: (path: string) => {
        const text = files[path];
        if (text === undefined) throw new Error(`ENOENT: ${path}`);
        return text;
      },
    },
    out,
    err,
  };
}

const fixture = (name: string) => JSON.stringify(loadFixture(name));

test("value --facts F --case C writes results.json and exits 0", () => {
  const { io, out, err } = capture({ "f.json": fixture("acme.facts"), "c.json": fixture("acme-dcf.case") });
  assert.equal(runCli(["value", "--facts", "f.json", "--case", "c.json"], io), 0);
  assert.deepEqual(err, []);
  const results = JSON.parse(out.join(""));
  assert.equal(results.schemaVersion, "1.0");
  assert.equal(results.valuation.method, "dcf");
});

test("value --facts F alone is the screen, in either flag order", () => {
  const { io, out } = capture({ "f.json": fixture("acme.facts") });
  assert.equal(runCli(["value", "--facts", "f.json"], io), 0);
  assert.equal(JSON.parse(out.join("")).valuation, null);
  const swapped = capture({ "f.json": fixture("acme.facts"), "c.json": fixture("acme-dcf.case") });
  assert.equal(runCli(["value", "--case", "c.json", "--facts", "f.json"], swapped.io), 0);
});

test("decode errors go to stderr as JSON with exit 1", () => {
  const broken = JSON.stringify(mutate(loadFixture("acme.facts"), "market.price", -1));
  const { io, out, err } = capture({ "f.json": broken });
  assert.equal(runCli(["value", "--facts", "f.json"], io), 1);
  assert.deepEqual(out, []);
  const errors = JSON.parse(err.join(""));
  assert.equal(errors[0].path, "market.price");
});

test("an unreadable or non-JSON file is an error naming the document, exit 1", () => {
  const missing = capture({});
  assert.equal(runCli(["value", "--facts", "nope.json"], missing.io), 1);
  assert.deepEqual(JSON.parse(missing.err.join(""))[0], {
    file: "facts",
    layer: "schema",
    rule: "file.unreadable",
    path: "",
    message: JSON.parse(missing.err.join(""))[0].message,
  });
  const garbage = capture({ "f.json": fixture("acme.facts"), "c.json": "{not json" });
  assert.equal(runCli(["value", "--facts", "f.json", "--case", "c.json"], garbage.io), 1);
  const [e] = JSON.parse(garbage.err.join(""));
  assert.equal(e.file, "case");
  assert.equal(e.rule, "json.invalid");
});

test("value without --facts, or with an unknown flag, is a usage error", () => {
  for (const argv of [["value"], ["value", "--case", "c.json"], ["value", "--facts", "f.json", "--x"]]) {
    const { io, err } = capture({ "f.json": fixture("acme.facts") });
    assert.equal(runCli(argv, io), 2, argv.join(" "));
    assert.ok(err.join("").includes("usage"));
  }
});
```

Update the existing usage test's list so `["value"]` is no longer expected there (it moved above), and the existing `schema` tests to call `capture()` with no files.

`src/cli.e2e.test.ts`:

```ts
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { assertAllFinite } from "./test-utils.ts";

function kosing(...args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    encoding: "utf8",
  });
}

test("end to end: the real process values the acme pair", () => {
  const r = kosing(
    "value",
    "--facts",
    "tests/fixtures/valid/acme.facts.json",
    "--case",
    "tests/fixtures/valid/acme-dcf.case.json",
  );
  assert.equal(r.status, 0, r.stderr);
  const results = JSON.parse(r.stdout);
  assert.equal(results.inputs.ticker, "ACME");
  assert.equal(results.valuation.method, "dcf");
  assert.equal(results.sensitivity.grid.length, 5);
  assertAllFinite(results);
});

test("end to end: a missing file exits 1 with JSON on stderr", () => {
  const r = kosing("value", "--facts", "tests/fixtures/valid/missing.json");
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stderr)[0].rule, "file.unreadable");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test src/cli.test.ts src/cli.e2e.test.ts`
Expected: the value tests fail (usage, exit 2) and `tsc` reports `readFile` is not in `CliIo`.

- [ ] **Step 3: Write the CLI**

`src/cli.ts`:

```ts
/**
 * The only file that knows about processes, files and streams. `runCli` is
 * pure over its arguments and the io it is handed, which is how the tests
 * call it.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { DecodeError } from "./input/errors.ts";
import { emitJsonSchema } from "./input/schema.ts";
import { valuate } from "./valuate.ts";

export type CliIo = {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  /** Throws when the file cannot be read. */
  readonly readFile: (path: string) => string;
};

const USAGE = `usage:
  kosing value --facts F [--case C]   results.json on stdout, exit 0; DecodeError[] on stderr, exit 1
  kosing schema facts | case          print the JSON Schema for that document
`;

function isDocument(name: string | undefined): name is "facts" | "case" {
  return name === "facts" || name === "case";
}

type ValueArgs = { readonly facts: string; readonly investmentCase: string | null };

function parseValueArgs(rest: readonly string[]): ValueArgs | null {
  let facts: string | null = null;
  let investmentCase: string | null = null;
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    const path = rest[i + 1];
    if (path === undefined) return null;
    if (flag === "--facts") facts = path;
    else if (flag === "--case") investmentCase = path;
    else return null;
  }
  return facts === null ? null : { facts, investmentCase };
}

type Loaded = { readonly ok: true; readonly json: unknown } | { readonly ok: false; readonly error: DecodeError };

function loadJson(io: CliIo, file: DecodeError["file"], path: string): Loaded {
  let text: string;
  try {
    text = io.readFile(path);
  } catch (e) {
    return { ok: false, error: fileError(file, "file.unreadable", `${path}: ${message(e)}`) };
  }
  try {
    return { ok: true, json: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: fileError(file, "json.invalid", `${path}: ${message(e)}`) };
  }
}

function fileError(file: DecodeError["file"], rule: string, text: string): DecodeError {
  return { file, layer: "schema", rule, path: "", message: text };
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function runValue(args: ValueArgs, io: CliIo): number {
  const facts = loadJson(io, "facts", args.facts);
  const investmentCase =
    args.investmentCase === null ? null : loadJson(io, "case", args.investmentCase);
  const loadErrors = [facts, investmentCase].flatMap((l) => (l !== null && !l.ok ? [l.error] : []));
  if (!facts.ok || (investmentCase !== null && !investmentCase.ok)) {
    io.stderr(`${JSON.stringify(loadErrors, null, 2)}\n`);
    return 1;
  }
  const result = valuate(facts.json, investmentCase === null ? undefined : investmentCase.json);
  if (!result.success) {
    io.stderr(`${JSON.stringify(result.error, null, 2)}\n`);
    return 1;
  }
  io.stdout(`${JSON.stringify(result.data, null, 2)}\n`);
  return 0;
}

export function runCli(argv: readonly string[], io: CliIo): number {
  const [command, ...rest] = argv;
  if (command === "schema" && isDocument(rest[0]) && rest.length === 1) {
    io.stdout(`${JSON.stringify(emitJsonSchema(rest[0]), null, 2)}\n`);
    return 0;
  }
  if (command === "value") {
    const args = parseValueArgs(rest);
    if (args !== null) return runValue(args, io);
  }
  io.stderr(USAGE);
  return 2;
}

/**
 * Whether this module is the process entry point. import.meta.url is
 * percent-encoded, so the path from argv has to go through pathToFileURL
 * rather than a template string, or a directory with a space never matches.
 */
export function isMain(importMetaUrl: string, argv1: string | undefined): boolean {
  return argv1 !== undefined && importMetaUrl === pathToFileURL(argv1).href;
}

if (isMain(import.meta.url, process.argv[1])) {
  process.exitCode = runCli(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    readFile: (path) => readFileSync(path, "utf8"),
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run check`
Expected: clean. The end-to-end test spawns a real Node process with tsx and takes a second or two; that is the point of it.

- [ ] **Step 5: Try it by hand and commit**

Run: `npm run kosing -- value --facts tests/fixtures/valid/holdco.facts.json --case tests/fixtures/valid/holdco-nav.case.json | head -40`
Expected: `results.json` begins with `schemaVersion`, `inputs`, and the holdco's `derived` block.

```bash
git add src/cli.ts src/cli.test.ts src/cli.e2e.test.ts
git commit -m "feat(cli): kosing value, with the real process exercised end to end"
```

---

### Task 15: Spec and documentation catch-up

**Files:**
- Modify: `docs/superpowers/specs/2026-10-07-valuator-design.md`
- Modify: `CLAUDE.md`

No code. The spec is the authority the next plan argues from, so what this plan ruled is written back where a reader would look for it.

- [ ] **Step 1: Update the spec's Math table and selectors paragraph**

In the Math table:
- `reverse-dcf` row, Computes column: append "; horizon and terminal growth are selector options echoed in results; unsolvable with a reason when the bracket [-0.5, 1.0] does not straddle the price";
- `fx` row, Inputs column: change to "`Company` + the `dcf` valuation's inputs"; Computes column: "value per share under spot moves of ±5 %, ±10 % on each exposure in a currency other than the reporting one, as a translation shock through the DCF; `null` with `fxUnavailable` when there is no DCF valuation";
- `dcf` row: replace "the existing `computeDcf`" with "terminal value reported both undiscounted and at present value; a typed `undefined` outcome when terminal growth is not below WACC";
- `sensitivity` row: append "; cells the Gordon formula cannot define are `null`; with an exit-multiple terminal the growth axis is `null` and the grid is n × 1".

Replace the sentence "`linearFade(from, to, years)` remains a shared helper for building paths." with "No shared path helper exists yet; the case supplies ten-number paths and the reverse DCF uses constant growth."

- [ ] **Step 2: Update the results shape**

In the `results.json` block:
- under `pricedIn.reverseDcf`, change to `{ impliedGrowth, basePeriod: { kind: "ltm"|"fiscalYear", fy: number|null, endDate }, horizonYears, terminalGrowth } | null`;
- under `valuation`, dcf branch: add `basePeriod` after `method`, add `pvTerminalValue` after `terminalValue`;
- under `sensitivity`: `{ axes: { wacc: [...], terminalGrowth: [...] | null }, grid: [[number | null]], base: [i, j] } | null`;
- under `fx`: `[{ pair, moves: [{ pct, valuePerShare: number | null }, ...] }, ...] | null — null without fx or without a DCF valuation; [] with fx but no relevant exposure`.

- [ ] **Step 3: Update the Resolutions table and the layout**

Add rows:

```
| `dcfUnavailable` | the case's terminal growth is not below the WACC that applies; carries the reason |
| `fxUnavailable` | facts carry `fx` but there is no DCF valuation to revalue |
```

and change the `reverseDcfUnavailable` row's "carries the reason" to "carries one of `noUsableBasePeriod`, `terminalGrowthNotBelowWacc`, `noGrowthInBracketMatchesPrice`".

In Repository layout, replace the `select/` and `math/` lines with the file structure from this plan's "File structure" section, add `valuate.ts` and `cli.e2e.test.ts`, and drop `linear-fade.ts`.

In "What survives", change the DCF sentence to past tense: "The arithmetic in `dcf.ts` and `wacc.ts` moved to `src/math/` and lost its parse layers (plan 2)."

In "Plans", mark both as done with their plan files.

- [ ] **Step 4: Update CLAUDE.md**

Replace "The valuator is the first piece." with "The valuator is built (plans 1 and 2); the researcher, analyst and advisor skills are next."

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-10-07-valuator-design.md CLAUDE.md
git commit -m "docs(spec): record plan 2's rulings in the design and mark both plans done"
```

**Checkpoint 3.** Dispatch the whole-branch review, fix Critical and Important findings test-first, then present: what was built, every ruling (planning rulings above plus any made while executing), deferred minors, and the test count. Wait for the go-ahead before deleting the plan's workspace.

---

## Self-review

**Spec coverage.** Math table: wacc (2), reverse-dcf (5, 11), multiples (7, 11, 13), fx (10, 12, 13), dcf (3, 12), sensitivity (6, 12), normalised-earnings (8, 12), nav (9, 12). Selectors (11, 12), `results.json` (13), CLI (14). Test strategy: types are carried over from plan 1; properties in 2, 3, 5, 6, 8, 9, 10 cover every bullet except the two plan 1 already covers (unit rescaling, price conversion identity); worked examples in 2, 3, 9; boundary tests carried over; end to end in 14 with the ruling about the real name. "What survives / deleted": Task 4. Spec write-back: Tasks 1 and 15.

**Placeholders.** None: every step has its code, its command and its expected output.

**Type consistency.** `DcfInputs.years: NonEmpty<YearAssumptions>` (3) is what `dcfInputsAtGrowth` (5), `computeSensitivity` (6), `zipYears` (12) and `shocked` (12) build. `BasePeriodRef` (11) is what `DcfSelection` (12), `ReverseDcfSelection` (11) and the results sections (13) carry. `WaccResult & { overridden }` is built in 12 and typed in 13. `Metric` (7) drives `selectBands`, `selectPeerValues` (11) and `MultipleRow` (13). `Resolution` gains `reverseDcfUnavailable`'s closed reasons in 11 and the two new kinds in 13, matching what `priced-in.ts` and `assemble.ts` construct. `CliIo.readFile` (14) is what both CLI tests supply.

**Review Focus.** 1: `dcf.test.ts` "terminal growth at or above wacc", `sensitivity.test.ts` "a cell whose growth meets its wacc", `assemble.test.ts` "terminal growth at or above wacc". 2: `reverse-dcf.test.ts` "a negative-margin base period". 3: `decode-company.test.ts` "zero is a share count, and a zero share count is an error". 4: `multiples.test.ts` "a null, zero or negative denominator". 5: `nav.test.ts` "parent net debt above the gross asset value". The finite walk runs in `assemble.test.ts` on every fixture and in `cli.e2e.test.ts`.
