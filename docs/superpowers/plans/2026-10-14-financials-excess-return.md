# Banks and Insurers (Excess Return) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Value banks and insurers in Kosing with one excess-return method on tangible book, so `bankInsurer` gets an entry price like every other valued classification.

**Architecture:** Facts gain a `financialInstitution` block (null for other companies) whose presence fixes debt at zero and switches the facts-only screen from EV multiples and the reverse DCF to price-to-tangible-book, dividend yield and an implied ROTE. The case gains an `excessReturn` method (ten-year ROTE path, payout, terminal growth, bear and bull paths). A new pure module computes value, its sensitivity grid and the implied ROTE; the assembler, hurdle and warnings wire it in.

**Tech Stack:** TypeScript 7 strict, Zod 4, `node:test`, Biome, tsx. `npm run check` runs all three.

**Spec:** `docs/superpowers/specs/2026-10-14-financials-excess-return-design.md`

## Global Constraints

- One method, `excessReturn`, for banks and insurers; `kind` is `bank` or `insurer`.
- The classification stays `bankInsurer`; its required discount is 30%, plus the AI-exposure add-on.
- Tangible book excludes goodwill, other intangibles and AT1 and other hybrid capital.
- When `financialInstitution` is present: `balanceSheet.totalDebt` is 0, `costOfCapital.debtWeight` is 0, `equityWeight` is 1, `pretaxCostOfDebt` is 0. Decode enforces this.
- Cost of equity = risk-free + beta × (equity risk premium + country premium); no WACC.
- `excessReturn` is allowed for `bankInsurer` only. Overrides and `sensitivity` stay dcf-only.
- Reverse reading: `r* = g + (P / TBV) × (ke − g)`, `g` the reverse DCF's default terminal growth (0.02).
- Sensitivity: cost of equity ±1pp in 0.5pp steps against a parallel ROTE shift ±2pp in 1pp steps.
- `capitalNearRequirement` warns when capital ratio < requirement + the company's buffer, or + 1pp when none is stated.
- No new dependencies. Relative imports carry `.ts`. Hoisted `function` declarations. No emojis.
- Commit directly on `main` with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Rulings made while planning

1. **`capitalTarget` is a buffer, not a ratio.** The spec says "own target or management buffer above the requirement"; the field holds the buffer in fraction points (0.015 for 150bp), so the warning reads `ratio < requirement + buffer`. Cost if wrong: one description and one comparison.
2. **The excess-return grid lives inside its valuation section.** Top-level `sensitivity` is typed for the DCF's WACC × growth axes; it stays null for `excessReturn`. Cost if wrong: a reader looks in one place for the grid.
3. **P/TBV and dividend yield join the multiples for every company.** `priceTangibleBook` is null without a `financialInstitution` block; `dividendYield` is computed from `dividendsPaid` for everyone. Neither has a history band or peers yet. Cost if wrong: two null rows on operating companies.
4. **The terminal's share is of equity value**, which includes tangible book: `pvTerminal / equityValue`.
5. **Existing facts need `"financialInstitution": null`.** Every key is present in facts, so the three fixtures and the five companies in kosing-data gain the key (Task 6).

## Review Focus

1. A bank with negative or zero tangible book: value per share still computes; P/TBV and implied ROTE are null, not division by zero. Pinned in Task 2 and Task 5.
2. Cost of equity at or below terminal growth, or at or below zero: `excessReturn` reports `excessReturnUnavailable` with the reason, valuation null, hurdle null. Pinned in Task 2 and Task 5.
3. A facts file with the block but a non-zero `totalDebt` (a researcher copying a bank's deposits or bonds): decode rejects it with the path. Pinned in Task 1.
4. A `bankInsurer` case on facts without the block: decode rejects it naming `financialInstitution`, not a crash in the selector. Pinned in Task 4.
5. Bear and bull ROTE paths that value in the wrong order: `scenarioOrderInverted`, as for the DCF. Pinned in Task 5.

---

### Task 1: The `financialInstitution` facts block

**Files:**
- Modify: `src/input/facts.ts`, `src/domain/company.ts`, `src/input/decode-company.ts`, `src/input/schema.test.ts`, `src/input/facts.test.ts`
- Modify: `tests/fixtures/valid/acme.facts.json`, `holdco.facts.json`, `dual.facts.json` (add `"financialInstitution": null`)
- Create: `tests/fixtures/valid/nordbank.facts.json`, `tests/fixtures/valid/safeins.facts.json`
- Modify: `src/test-fixtures.ts`

**Interfaces:**
- Produces: `FINANCIAL_KINDS`, `FinancialInstitution` (Zod) in `facts.ts`; domain `FinancialInstitution` type and `Company.financialInstitution: FinancialInstitution | null` in `company.ts`, aggregates scaled to millions.

- [ ] **Step 1: Add the key to the three existing fixtures, create the two new ones, and register them**

```bash
node -e '
const fs=require("fs");const p=n=>`tests/fixtures/valid/${n}.json`;
for (const n of ["acme.facts","holdco.facts","dual.facts"]) {
  const d=JSON.parse(fs.readFileSync(p(n)));d.financialInstitution=null;
  fs.writeFileSync(p(n),JSON.stringify(d,null,2)+"\n");
}
function financial(kind, ticker, name, block){
  const d=JSON.parse(fs.readFileSync(p("acme.facts")));
  d.company={...d.company,ticker,name};
  d.balanceSheet.totalDebt=0;d.balanceSheet.shortTermDebt=null;d.balanceSheet.longTermDebt=null;
  d.costOfCapital={...d.costOfCapital,equityWeight:1,debtWeight:0,pretaxCostOfDebt:0};
  d.financialInstitution={kind,...block,sourceRefs:["S4"]};
  return d;
}
const none={riskWeightedAssets:null,netInterestIncome:null,niiSensitivity:null,loanLossRatio:null,costIncomeRatio:null,combinedRatio:null,contractualServiceMargin:null};
fs.writeFileSync(p("nordbank.facts"),JSON.stringify(financial("bank","NORD","Nordbank",{tangibleBookEquity:9000,at1Capital:1200,at1Coupons:80,capitalRatio:0.175,capitalRequirement:0.135,capitalTarget:0.015,...none,riskWeightedAssets:60000,netInterestIncome:4200,niiSensitivity:350,loanLossRatio:0.0005,costIncomeRatio:0.42}),null,2)+"\n");
fs.writeFileSync(p("safeins.facts"),JSON.stringify(financial("insurer","SAFE","Safe Insurance",{tangibleBookEquity:5200,at1Capital:null,at1Coupons:null,capitalRatio:1.9,capitalRequirement:1.0,capitalTarget:null,...none,combinedRatio:0.86,contractualServiceMargin:null}),null,2)+"\n");
'
npx biome check --write tests
```

In `src/test-fixtures.ts`, extend `VALID_FIXTURES.facts`:

```ts
  facts: ["acme.facts", "holdco.facts", "dual.facts", "nordbank.facts", "safeins.facts"],
```

- [ ] **Step 2: Write the failing tests**

Append to `src/input/facts.test.ts` (it already imports `FactsSchema`, `loadFixture` and `mutate`; add any missing import):

```ts
test("a financial institution carries no debt and an all-equity cost of capital", () => {
  assert.equal(FactsSchema.safeParse(loadFixture("nordbank.facts")).success, true);
  for (const [path, value] of [
    ["balanceSheet.totalDebt", 100],
    ["costOfCapital.pretaxCostOfDebt", 0.03],
  ] as const) {
    const r = FactsSchema.safeParse(mutate(loadFixture("nordbank.facts"), path, value));
    assert.equal(r.success, false, path);
    assert.deepEqual(r.error?.issues[0]?.path, path.split("."));
  }
  const weights = mutate(
    mutate(loadFixture("nordbank.facts"), "costOfCapital.equityWeight", 0.8),
    "costOfCapital.debtWeight",
    0.2,
  );
  assert.equal(FactsSchema.safeParse(weights).success, false);
});

test("bank-only and insurer-only fields are null for the other kind", () => {
  const bank = mutate(loadFixture("nordbank.facts"), "financialInstitution.combinedRatio", 0.9);
  const r = FactsSchema.safeParse(bank);
  assert.equal(r.success, false);
  assert.deepEqual(r.error?.issues[0]?.path, ["financialInstitution", "combinedRatio"]);
  const insurer = mutate(loadFixture("safeins.facts"), "financialInstitution.netInterestIncome", 1);
  assert.equal(FactsSchema.safeParse(insurer).success, false);
});

test("the block's source refs must resolve", () => {
  const bad = mutate(loadFixture("nordbank.facts"), "financialInstitution.sourceRefs", ["S99"]);
  assert.equal(FactsSchema.safeParse(bad).success, false);
});
```

Append to `src/input/decode-company.test.ts` (or `decode.test.ts` if that is where company decode is tested; both import `decode`):

```ts
test("a bank's block is decoded with aggregates scaled to millions", () => {
  const thousands = mutate(
    mutate(loadFixture("nordbank.facts"), "unit", "thousands"),
    "financialInstitution.tangibleBookEquity",
    9_000_000,
  );
  const r = decode(thousands);
  assert.ok(r.success, JSON.stringify(r.error));
  assert.equal(r.data.company.financialInstitution?.tangibleBookEquity, 9000);
  assert.equal(r.data.company.financialInstitution?.capitalRatio, 0.175, "ratios are not scaled");
  assert.equal(decode(loadFixture("acme.facts")).data?.company.financialInstitution, null);
});
```

In `src/input/schema.test.ts`, add to `DESCRIBED_FIELDS.facts`:

```ts
    "financialInstitution",
    "financialInstitution.tangibleBookEquity",
    "financialInstitution.capitalTarget",
    "financialInstitution.niiSensitivity",
```

and append:

```ts
test("a financial institution's fixed debt values are a rule the schema cannot carry", () => {
  const bad = mutate(loadFixture("nordbank.facts"), "balanceSheet.totalDebt", 100);
  assert.equal(FactsSchema.safeParse(bad).success, false);
  assert.equal(validator("facts")(bad), true);
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `node --import tsx --test src/input/facts.test.ts src/input/schema.test.ts src/input/decode*.test.ts 2>&1 | grep -E "^# (pass|fail)|^not ok"`
Expected: FAIL, including every fixture test, because the strict schema rejects the unknown `financialInstitution` key.

- [ ] **Step 4: Implement**

In `src/input/facts.ts`, before `FactsShape`:

```ts
export const FINANCIAL_KINDS = ["bank", "insurer"] as const;

const BANK_ONLY = [
  "riskWeightedAssets",
  "netInterestIncome",
  "niiSensitivity",
  "loanLossRatio",
  "costIncomeRatio",
] as const;
const INSURER_ONLY = ["combinedRatio", "contractualServiceMargin"] as const;

export const FinancialInstitution = z
  .strictObject({
    kind: z.enum(FINANCIAL_KINDS),
    tangibleBookEquity: z
      .number()
      .describe(
        "Equity attributable to ordinary shareholders less goodwill and other intangibles, excluding AT1 and other hybrid capital.",
      ),
    at1Capital: nullableNonNegative.describe("AT1 and other hybrid capital carried in equity; null when none."),
    at1Coupons: nullableNumber.describe("AT1 coupons for the base period, as a positive amount."),
    capitalRatio: z
      .number()
      .min(0)
      .describe("CET1 ratio for a bank, Solvency II ratio for an insurer, as a fraction (1.9 for 190%)."),
    capitalRequirement: z
      .number()
      .min(0)
      .describe("The regulatory requirement including buffers, as a fraction; 1.0 for an insurer's 100% SCR."),
    capitalTarget: nullableNonNegative.describe(
      "The company's own management buffer above the requirement, in fraction points (0.015 for 150bp); null when not stated.",
    ),
    riskWeightedAssets: nullableNonNegative.describe("Bank only."),
    netInterestIncome: nullableNumber.describe("Bank only, the base period."),
    niiSensitivity: nullableNumber.describe(
      "Bank only: the disclosed change in annual net interest income for a one percentage point parallel rise in rates; null when not disclosed.",
    ),
    loanLossRatio: nullableNumber.describe("Bank only: credit losses over loans, as reported, as a fraction."),
    costIncomeRatio: nullableNumber.describe("Bank only, as reported, as a fraction."),
    combinedRatio: nullableNumber.describe("Insurer only, non-life, as reported; null for a pure life insurer."),
    contractualServiceMargin: nullableNonNegative.describe(
      "Insurer only: the IFRS 17 CSM. Recorded for the analyst; not added to book.",
    ),
    sourceRefs: SourceRefs,
  })
  .describe(
    "Banks and insurers only; null for every other company. When present, balanceSheet.totalDebt is 0, costOfCapital.debtWeight is 0, equityWeight is 1 and pretaxCostOfDebt is 0. research.md records net interest income through the zero-rate years (2015-2021) and since.",
  );
```

Add to `FactsShape`, after `fx`:

```ts
  financialInstitution: FinancialInstitution.nullable(),
```

In `collectSourceRefs`, before `return refs;`:

```ts
  if (facts.financialInstitution) {
    many("financialInstitution.sourceRefs", facts.financialInstitution.sourceRefs);
  }
```

At the end of the `FactsSchema` `superRefine` body:

```ts
  const fi = facts.financialInstitution;
  if (fi !== null) {
    const fixed: readonly [readonly (string | number)[], number, number][] = [
      [["balanceSheet", "totalDebt"], facts.balanceSheet.totalDebt, 0],
      [["costOfCapital", "debtWeight"], facts.costOfCapital.debtWeight, 0],
      [["costOfCapital", "equityWeight"], facts.costOfCapital.equityWeight, 1],
      [["costOfCapital", "pretaxCostOfDebt"], facts.costOfCapital.pretaxCostOfDebt, 0],
    ];
    for (const [path, actual, expected] of fixed) {
      if (actual !== expected) {
        ctx.addIssue({
          code: "custom",
          path: [...path],
          message: `${path.join(".")} is ${expected} for a financial institution`,
        });
      }
    }
    const otherKindOnly = fi.kind === "bank" ? INSURER_ONLY : BANK_ONLY;
    for (const key of otherKindOnly) {
      if (fi[key] !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["financialInstitution", key],
          message: `${key} is null for a ${fi.kind}`,
        });
      }
    }
  }
```

Update the `FactsSchema` `.describe(...)` text to append: ` A financialInstitution block fixes debt at zero and the cost of capital at all equity, and its kind-specific fields are null for the other kind.`

In `src/domain/company.ts`, add and wire into `Company` (after `fx`):

```ts
/** Banks and insurers only. Aggregates in millions of the reporting currency; ratios as fractions. */
export type FinancialInstitution = {
  readonly kind: "bank" | "insurer";
  readonly tangibleBookEquity: number;
  readonly at1Capital: number | null;
  readonly at1Coupons: number | null;
  readonly capitalRatio: number;
  readonly capitalRequirement: number;
  readonly capitalTarget: number | null;
  readonly riskWeightedAssets: number | null;
  readonly netInterestIncome: number | null;
  readonly niiSensitivity: number | null;
  readonly loanLossRatio: number | null;
  readonly costIncomeRatio: number | null;
  readonly combinedRatio: number | null;
  readonly contractualServiceMargin: number | null;
};
```

```ts
  readonly financialInstitution: FinancialInstitution | null;
```

In `src/input/decode-company.ts`, add to the `company` object after `fx`:

```ts
    financialInstitution: facts.financialInstitution
      ? decodeFinancialInstitution(facts.financialInstitution, scale)
      : null,
```

and above `decodeCompany`:

```ts
function decodeFinancialInstitution(
  fi: NonNullable<Facts["financialInstitution"]>,
  scale: ReturnType<typeof scaleBy>,
): FinancialInstitution {
  const { sourceRefs: _s, ...rest } = fi;
  return {
    ...rest,
    tangibleBookEquity: scale.required(fi.tangibleBookEquity),
    at1Capital: scale.nullable(fi.at1Capital),
    at1Coupons: scale.nullable(fi.at1Coupons),
    riskWeightedAssets: scale.nullable(fi.riskWeightedAssets),
    netInterestIncome: scale.nullable(fi.netInterestIncome),
    niiSensitivity: scale.nullable(fi.niiSensitivity),
    contractualServiceMargin: scale.nullable(fi.contractualServiceMargin),
  };
}
```

(import `FinancialInstitution` from `../domain/company.ts`; if `scaleBy` is not exported under that name, use the local helper's actual name.)

- [ ] **Step 5: Run the full check**

Run: `npx biome check --write src tests && npm run check`
Expected: PASS. Fix any test that counted fixtures or facts keys (for example a test listing `VALID_FIXTURES.facts` that assumes three) by updating its expectation, never by removing the new fixtures.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(input): the financialInstitution facts block

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The excess-return math

**Files:**
- Create: `src/math/excess-return.ts`, `src/math/excess-return.test.ts`

**Interfaces:**
- Produces:
  - `type ExcessReturnInputs = { tangibleBook: number; shares: number; costOfEquity: number; rotePath: NonEmpty<number>; payoutRatio: number; terminalGrowth: number }`
  - `type ExcessReturnYear = { year: number; openingBook: number; rote: number; earnings: number; excessReturn: number; discountFactor: number; pvExcessReturn: number; closingBook: number }`
  - `type ExcessReturnOutcome = { kind: "value"; valuePerShare: number; equityValue: number; priceToTangibleBook: number | null; terminalValue: number; pvTerminalValue: number; terminalPctOfValue: number | null; projection: readonly ExcessReturnYear[] } | { kind: "undefined"; reason: "costOfEquityNotPositive" | "costOfEquityNotAboveGrowth" }`
  - `computeExcessReturn(inputs: ExcessReturnInputs): ExcessReturnOutcome`
  - `impliedSteadyStateRote(priceToTangibleBook: number, costOfEquity: number, growth: number): number`
  - `COST_OF_EQUITY_STEPS`, `ROTE_SHIFTS` (`NonEmpty<number>`), `type ExcessReturnSensitivity = { axes: { costOfEquity: readonly number[]; roteShift: readonly number[] }; grid: readonly (readonly (number | null)[])[] }`, `computeExcessReturnSensitivity(base: ExcessReturnInputs): ExcessReturnSensitivity`

- [ ] **Step 1: Write the failing tests**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { assertClose } from "../test-utils.ts";
import {
  computeExcessReturn,
  computeExcessReturnSensitivity,
  type ExcessReturnInputs,
  impliedSteadyStateRote,
} from "./excess-return.ts";

const ten = (r: number) => [r, r, r, r, r, r, r, r, r, r] as const;

/**
 * AnalystPrep, CFA Level II, single-stage residual income valuation: book
 * value per share 25.25, long-term ROE 12%, cost of equity 8%, growth 6.5%,
 * value 92.58. With the payout set so book grows at g every year, the
 * ten-year model is the single-stage model exactly.
 * https://analystprep.com/study-notes/cfa-level-2/single-stage-residual-income-valuation/
 */
test("worked example: AnalystPrep single-stage residual income", () => {
  const r = computeExcessReturn({
    tangibleBook: 25.25,
    shares: 1,
    costOfEquity: 0.08,
    rotePath: ten(0.12),
    payoutRatio: 1 - 0.065 / 0.12,
    terminalGrowth: 0.065,
  });
  assert.equal(r.kind, "value");
  if (r.kind !== "value") return;
  assertClose(r.valuePerShare, 92.58, 0.005);
  assertClose(r.priceToTangibleBook ?? 0, 92.58 / 25.25, 0.001);
});

const base: ExcessReturnInputs = {
  tangibleBook: 9000,
  shares: 100,
  costOfEquity: 0.09,
  rotePath: ten(0.13),
  payoutRatio: 0.6,
  terminalGrowth: 0.02,
};

test("earning exactly the cost of equity is worth tangible book", () => {
  const r = computeExcessReturn({ ...base, rotePath: ten(0.09) });
  assert.ok(r.kind === "value");
  assertClose(r.valuePerShare, 90, 1e-9);
  assertClose(r.terminalValue, 0, 1e-9);
});

test("book grows by retained earnings and each year's excess is charged on opening book", () => {
  const r = computeExcessReturn(base);
  assert.ok(r.kind === "value");
  const y1 = r.projection[0];
  assert.ok(y1);
  assertClose(y1.earnings, 0.13 * 9000, 1e-9);
  assertClose(y1.excessReturn, (0.13 - 0.09) * 9000, 1e-9);
  assertClose(y1.closingBook, 9000 + 0.13 * 9000 * 0.4, 1e-9);
  assert.equal(r.projection.length, 10);
});

test("value rises with ROTE and falls with the cost of equity", () => {
  const v = (i: ExcessReturnInputs) => {
    const r = computeExcessReturn(i);
    if (r.kind !== "value") throw new Error("unreachable");
    return r.valuePerShare;
  };
  assert.ok(v({ ...base, rotePath: ten(0.15) }) > v(base));
  assert.ok(v({ ...base, costOfEquity: 0.1 }) < v(base));
});

test("a cost of equity at or below growth, or at or below zero, has no value", () => {
  assert.deepEqual(computeExcessReturn({ ...base, costOfEquity: 0.02 }), {
    kind: "undefined",
    reason: "costOfEquityNotAboveGrowth",
  });
  assert.deepEqual(computeExcessReturn({ ...base, costOfEquity: 0, terminalGrowth: -0.01 }), {
    kind: "undefined",
    reason: "costOfEquityNotPositive",
  });
});

test("non-positive tangible book still values, with no price-to-book ratio", () => {
  const r = computeExcessReturn({ ...base, tangibleBook: 0 });
  assert.ok(r.kind === "value");
  assert.equal(r.priceToTangibleBook, null);
});

test("the implied steady-state ROTE inverts the single-stage value", () => {
  const ptb = 92.58 / 25.25;
  assertClose(impliedSteadyStateRote(ptb, 0.08, 0.065), 0.12, 0.0001);
});

test("the sensitivity grid reads low to high and its centre is the base value", () => {
  const s = computeExcessReturnSensitivity(base);
  assert.deepEqual(s.axes.costOfEquity.map((x) => Math.round(x * 1000) / 1000), [0.08, 0.085, 0.09, 0.095, 0.1]);
  assert.deepEqual(s.axes.roteShift, [-0.02, -0.01, 0, 0.01, 0.02]);
  const r = computeExcessReturn(base);
  assert.ok(r.kind === "value");
  assertClose(s.grid[2]?.[2] ?? 0, r.valuePerShare, 1e-9);
  for (const row of s.grid) {
    for (let j = 1; j < row.length; j++) assert.ok((row[j] ?? 0) > (row[j - 1] ?? 0));
  }
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --import tsx --test src/math/excess-return.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `./excess-return.ts`.

- [ ] **Step 3: Implement**

```ts
/**
 * Excess return on tangible book, for banks and insurers: book plus the
 * present value of what the company earns on it above the cost of equity.
 * Book grows by retained earnings; year ten's excess return is held steady
 * and grows at the terminal rate.
 */

import { isNonEmpty, type NonEmpty } from "../domain/types.ts";

export type ExcessReturnInputs = {
  readonly tangibleBook: number;
  readonly shares: number;
  readonly costOfEquity: number;
  readonly rotePath: NonEmpty<number>;
  readonly payoutRatio: number;
  readonly terminalGrowth: number;
};

export type ExcessReturnYear = {
  readonly year: number;
  readonly openingBook: number;
  readonly rote: number;
  readonly earnings: number;
  readonly excessReturn: number;
  readonly discountFactor: number;
  readonly pvExcessReturn: number;
  readonly closingBook: number;
};

export type ExcessReturnOutcome =
  | {
      readonly kind: "value";
      readonly valuePerShare: number;
      readonly equityValue: number;
      /** Value over tangible book; null when book is not positive. */
      readonly priceToTangibleBook: number | null;
      readonly terminalValue: number;
      readonly pvTerminalValue: number;
      /** Share of equity value from the terminal; null when equity value is not positive. */
      readonly terminalPctOfValue: number | null;
      readonly projection: readonly ExcessReturnYear[];
    }
  | {
      readonly kind: "undefined";
      readonly reason: "costOfEquityNotPositive" | "costOfEquityNotAboveGrowth";
    };

/** The same float guard the DCF's Gordon terminal uses. */
const MIN_SPREAD = 1e-9;

function project(inputs: ExcessReturnInputs): readonly ExcessReturnYear[] {
  const rows: ExcessReturnYear[] = [];
  let book = inputs.tangibleBook;
  for (const [i, rote] of inputs.rotePath.entries()) {
    const year = i + 1;
    const earnings = rote * book;
    const excessReturn = (rote - inputs.costOfEquity) * book;
    const discountFactor = 1 / (1 + inputs.costOfEquity) ** year;
    const closingBook = book + earnings * (1 - inputs.payoutRatio);
    rows.push({
      year,
      openingBook: book,
      rote,
      earnings,
      excessReturn,
      discountFactor,
      pvExcessReturn: excessReturn * discountFactor,
      closingBook,
    });
    book = closingBook;
  }
  return rows;
}

export function computeExcessReturn(inputs: ExcessReturnInputs): ExcessReturnOutcome {
  const ke = inputs.costOfEquity;
  if (ke <= 0) return { kind: "undefined", reason: "costOfEquityNotPositive" };
  if (ke - inputs.terminalGrowth < MIN_SPREAD) {
    return { kind: "undefined", reason: "costOfEquityNotAboveGrowth" };
  }
  const projection = project(inputs);
  const last = projection.at(-1);
  if (last === undefined) throw new Error("unreachable: the ROTE path is NonEmpty");
  const terminalValue =
    ((last.rote - ke) * last.closingBook) / (ke - inputs.terminalGrowth);
  const pvTerminalValue = terminalValue * last.discountFactor;
  const equityValue =
    inputs.tangibleBook +
    projection.reduce((sum, y) => sum + y.pvExcessReturn, 0) +
    pvTerminalValue;
  return {
    kind: "value",
    valuePerShare: equityValue / inputs.shares,
    equityValue,
    priceToTangibleBook: inputs.tangibleBook > 0 ? equityValue / inputs.tangibleBook : null,
    terminalValue,
    pvTerminalValue,
    terminalPctOfValue: equityValue > 0 ? pvTerminalValue / equityValue : null,
    projection,
  };
}

/** From P/TBV = (r − g) / (ke − g): the steady ROTE that justifies a price-to-tangible-book. */
export function impliedSteadyStateRote(
  priceToTangibleBook: number,
  costOfEquity: number,
  growth: number,
): number {
  return growth + priceToTangibleBook * (costOfEquity - growth);
}

export const COST_OF_EQUITY_STEPS: NonEmpty<number> = [-0.01, -0.005, 0, 0.005, 0.01];
export const ROTE_SHIFTS: NonEmpty<number> = [-0.02, -0.01, 0, 0.01, 0.02];

export type ExcessReturnSensitivity = {
  readonly axes: { readonly costOfEquity: readonly number[]; readonly roteShift: readonly number[] };
  /** grid[i][j]: cost-of-equity axis i, ROTE shift j; null where the value is undefined. */
  readonly grid: readonly (readonly (number | null)[])[];
};

function shifted(path: NonEmpty<number>, shift: number): NonEmpty<number> {
  const moved = path.map((r) => r + shift);
  if (!isNonEmpty(moved)) throw new Error("unreachable: mapping a NonEmpty");
  return moved;
}

export function computeExcessReturnSensitivity(base: ExcessReturnInputs): ExcessReturnSensitivity {
  const costOfEquity = COST_OF_EQUITY_STEPS.map((d) => base.costOfEquity + d);
  const grid = costOfEquity.map((ke) =>
    ROTE_SHIFTS.map((shift) => {
      const r = computeExcessReturn({ ...base, costOfEquity: ke, rotePath: shifted(base.rotePath, shift) });
      return r.kind === "value" ? r.valuePerShare : null;
    }),
  );
  return { axes: { costOfEquity, roteShift: [...ROTE_SHIFTS] }, grid };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx biome check --write src/math && node --import tsx --test src/math/excess-return.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/math && git commit -m "feat(math): excess return on tangible book

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The `excessReturn` case method

**Files:**
- Modify: `src/input/case.ts`, `src/input/case.test.ts`, `src/input/schema.test.ts`
- Create: `tests/fixtures/valid/nordbank-excess.case.json`
- Modify: `src/test-fixtures.ts`

**Interfaces:**
- Produces: `ExcessReturnMethod` in the case `Method` union, wire shape `{ kind: "excessReturn"; rotePath: number[10]; payoutRatio: number; terminal: { growth: number; basis: string }; scenarios: { bear: { rotePath; rationale }; bull: { rotePath; rationale } } | null; rationale: string; sourceRefs: string[] }`.

- [ ] **Step 1: Create the case fixture and register it**

`tests/fixtures/valid/nordbank-excess.case.json`:

```json
{
  "schemaVersion": "1.0",
  "ticker": "NORD",
  "factsAsOf": "2026-10-01",
  "classification": "bankInsurer",
  "aiExposure": "secondOrderOnly",
  "method": {
    "kind": "excessReturn",
    "rotePath": [0.14, 0.135, 0.13, 0.13, 0.125, 0.125, 0.12, 0.12, 0.12, 0.12],
    "payoutRatio": 0.6,
    "terminal": { "growth": 0.02, "basis": "nominal growth of the home economy" },
    "scenarios": {
      "bear": { "rotePath": [0.12, 0.11, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1], "rationale": "rates back near zero" },
      "bull": { "rotePath": [0.16, 0.155, 0.15, 0.15, 0.145, 0.145, 0.14, 0.14, 0.14, 0.14], "rationale": "deposit margins hold" }
    },
    "rationale": "normalised over the rate regimes since 2015",
    "sourceRefs": ["S4"]
  },
  "overrides": { "beta": null, "wacc": null, "taxRate": null, "rationale": null },
  "sensitivity": null
}
```

In `src/test-fixtures.ts`, add `"nordbank-excess.case"` to `VALID_FIXTURES.cases`.

- [ ] **Step 2: Write the failing tests**

Append to `src/input/case.test.ts`:

```ts
test("an excess-return case parses and is for bankInsurer only", () => {
  const c = loadFixture("nordbank-excess.case");
  assert.equal(CaseSchema.safeParse(c).success, true);
  const wrong = CaseSchema.safeParse(mutate(c, "classification", "garp"));
  assert.equal(wrong.success, false);
  assert.deepEqual(wrong.error?.issues[0]?.path, ["method", "kind"]);
  assert.equal(CaseSchema.safeParse(mutate(c, "method.payoutRatio", 1.2)).success, false);
  assert.equal(CaseSchema.safeParse(mutate(c, "method.rotePath", [0.1])).success, false);
});
```

(add `import { loadFixture, mutate } from "../test-fixtures.ts";` if not present)

In `src/input/schema.test.ts`, add to `DESCRIBED_FIELDS.case`: `"method.rotePath"`, `"method.payoutRatio"`; and append:

```ts
test("excessReturn for bankInsurer only is a rule the schema cannot carry", () => {
  const bad = mutate(loadFixture("nordbank-excess.case"), "classification", "garp");
  assert.equal(CaseSchema.safeParse(bad).success, false);
  assert.equal(validator("case")(bad), true);
});
```

Note: `descriptionAt` walks `oneOf` options in order and returns the first match, so `method.rotePath` resolves inside the excessReturn option only if no earlier option has a `rotePath` key, which holds.

- [ ] **Step 3: Run to verify they fail**

Run: `node --import tsx --test src/input/case.test.ts src/input/schema.test.ts 2>&1 | grep -E "^# (pass|fail)|^not ok"`
Expected: FAIL: the method union has no `excessReturn`.

- [ ] **Step 4: Implement**

In `src/input/case.ts`, after `NavMethod`:

```ts
export const ExcessReturnScenario = z.strictObject({
  rotePath: TenNumberPath,
  rationale: z.string().min(1),
});

export const ExcessReturnMethod = z.strictObject({
  kind: z.literal("excessReturn"),
  rotePath: TenNumberPath.describe(
    "Return on tangible equity for each of ten years, as fractions, normalised across the rate regimes the company has lived through rather than extrapolated from the latest year.",
  ),
  payoutRatio: z
    .number()
    .min(0)
    .max(1)
    .describe("Share of earnings paid out as dividends or buybacks; book grows by the rest."),
  terminal: z.strictObject({
    growth: z.number(),
    basis: z.string().min(1),
  }),
  /** Bear and bull replace the ROTE path; everything else is shared. */
  scenarios: z
    .strictObject({ bear: ExcessReturnScenario, bull: ExcessReturnScenario })
    .nullable(),
  rationale: z.string().min(1),
  sourceRefs: SourceRefs,
});
```

Add `ExcessReturnMethod` to the `Method` discriminated union. Update the `classification` description to: `"Decides the method: qualityCompounder and garp take dcf, valueCyclical takes normalisedEarnings, holdingCompany takes nav, bankInsurer takes excessReturn, specialSituation any of dcf, normalisedEarnings or nav. reitUtility, saasPreProfit and commodityProducer have no method and get no case."`

At the start of the `CaseSchema` `superRefine` body:

```ts
  if (c.method.kind === "excessReturn" && c.classification !== "bankInsurer") {
    ctx.addIssue({
      code: "custom",
      path: ["method", "kind"],
      message: "excessReturn is for bankInsurer only",
    });
  }
```

Append to the `CaseSchema` `.describe(...)` text: ` excessReturn is for bankInsurer only.`

- [ ] **Step 5: Run the case and schema tests**

Run: `npx biome check --write src tests && node --import tsx --test src/input/case.test.ts src/input/schema.test.ts 2>&1 | grep -E "^# (pass|fail)|^not ok"`
Expected: PASS. `npm run check` will still fail on the exhaustive switches in decode and assemble; Task 4 closes them, so commit after Task 4's Step 5.

---

### Task 4: Decode the method into the domain

**Files:**
- Modify: `src/domain/valuation.ts`, `src/input/decode-valuation.ts`, `src/input/decode-valuation.test.ts`

**Interfaces:**
- Consumes: `Company.financialInstitution` (Task 1), `ExcessReturnMethod` (Task 3).
- Produces: `Valuation` member `{ method: "excessReturn"; tangibleBook: number; costOfCapital: CostOfCapital; assumptions: ExcessReturnAssumptions }` with `type ExcessReturnAssumptions = { rotePath: readonly number[]; payoutRatio: number; terminalGrowth: number; scenarios: { bear: { rotePath: readonly number[] }; bull: { rotePath: readonly number[] } } | null }`.

- [ ] **Step 1: Write the failing tests**

Append to `src/input/decode-valuation.test.ts` (it imports `decode`, `loadFixture`, `mutate`):

```ts
test("an excess-return case decodes against a bank's facts", () => {
  const r = decode(loadFixture("nordbank.facts"), loadFixture("nordbank-excess.case"));
  assert.ok(r.success, JSON.stringify(r.error));
  const v = r.data.valuation;
  assert.equal(v?.method, "excessReturn");
  if (v?.method !== "excessReturn") return;
  assert.equal(v.tangibleBook, 9000);
  assert.equal(v.assumptions.payoutRatio, 0.6);
  assert.equal(v.assumptions.terminalGrowth, 0.02);
  assert.equal(v.assumptions.scenarios?.bear.rotePath[0], 0.12);
});

test("an excess-return case on facts without the block names the block", () => {
  const c = mutate(loadFixture("nordbank-excess.case"), "ticker", "ACME");
  const r = decode(loadFixture("acme.facts"), c);
  assert.equal(r.success, false);
  assert.deepEqual(
    r.error?.map((e) => [e.file, e.rule, e.path]),
    [["facts", "semantic.excessReturnNeedsFinancialInstitution", "financialInstitution"]],
  );
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --import tsx --test src/input/decode-valuation.test.ts 2>&1 | grep -E "^# (pass|fail)|^not ok"`
Expected: FAIL (typecheck aside, tsx runs it: the switch falls to `assertNever` and throws).

- [ ] **Step 3: Implement**

In `src/domain/valuation.ts`:

```ts
export type ExcessReturnAssumptions = {
  readonly rotePath: readonly number[];
  readonly payoutRatio: number;
  readonly terminalGrowth: number;
  readonly scenarios: {
    readonly bear: { readonly rotePath: readonly number[] };
    readonly bull: { readonly rotePath: readonly number[] };
  } | null;
};
```

and the `Valuation` member:

```ts
  | {
      readonly method: "excessReturn";
      /** Tangible book to ordinary shareholders, millions of the reporting currency. */
      readonly tangibleBook: number;
      /** The facts' cost of capital; only the cost of equity is used. */
      readonly costOfCapital: CostOfCapital;
      readonly assumptions: ExcessReturnAssumptions;
    };
```

In `decodeValuation`'s switch, before `default`:

```ts
    case "excessReturn": {
      const fi = company.financialInstitution;
      if (fi === null) {
        return failed([
          decodeError(
            "facts",
            "semantic.excessReturnNeedsFinancialInstitution",
            "financialInstitution",
            "an excessReturn case needs the financialInstitution block in the facts",
          ),
        ]);
      }
      return decoded({
        valuation: {
          method: "excessReturn",
          tangibleBook: fi.tangibleBookEquity,
          costOfCapital: company.costOfCapital,
          assumptions: {
            rotePath: method.rotePath,
            payoutRatio: method.payoutRatio,
            terminalGrowth: method.terminal.growth,
            scenarios:
              method.scenarios === null
                ? null
                : {
                    bear: { rotePath: method.scenarios.bear.rotePath },
                    bull: { rotePath: method.scenarios.bull.rotePath },
                  },
          },
        },
        resolutions,
      });
    }
```

- [ ] **Step 4: Close the other exhaustive switches with a temporary stop**

`npx tsc --noEmit` now names every `switch (valuation.method)` without the new case (`src/results/assemble.ts` `value`, `src/results/hurdle.ts` `baseValue`). Task 5 implements them; for now add to each:

```ts
    case "excessReturn":
      throw new Error("excessReturn is valued in Task 5");
```

- [ ] **Step 5: Run the full check and commit Tasks 3 and 4 together**

Run: `npx biome check --write src tests && npm run check`
Expected: PASS (no test exercises assemble with the excess-return case yet).

```bash
git add -A && git commit -m "feat(input): the excessReturn case method, decoded for bankInsurer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Results, hurdle, multiples and warnings

**Files:**
- Create: `src/select/excess-return.ts`
- Modify: `src/results/types.ts`, `src/results/assemble.ts`, `src/results/hurdle.ts`, `src/results/priced-in.ts`, `src/math/hurdle.ts`, `src/math/hurdle.test.ts`, `src/math/multiples.ts`, `src/math/multiples.test.ts`, `src/select/derived.ts`, `src/select/multiples.ts`, `src/select/facts-only.test.ts`, `src/input/errors.ts`, `src/input/warnings.ts`, `src/results/assemble.test.ts`

**Interfaces:**
- Consumes: `computeExcessReturn`, `computeExcessReturnSensitivity`, `impliedSteadyStateRote`, `ExcessReturnYear`, `ExcessReturnSensitivity` (Task 2); `Valuation` excessReturn member (Task 4).
- Produces:
  - `ExcessReturnSection` in `ValuationSection`: `{ method: "excessReturn"; costOfEquity; tangibleBook; payoutRatio; terminalGrowth; valuePerShare; equityValue; priceToTangibleBook: number | null; terminalValue; pvTerminalValue; terminalPctOfValue: number | null; projection: readonly ExcessReturnYear[]; scenarios: { bear: ExcessReturnScenarioValue | null; bull: ExcessReturnScenarioValue | null } | null; sensitivity: ExcessReturnSensitivity }`, `ExcessReturnScenarioValue = { valuePerShare; equityValue; priceToTangibleBook: number | null }`.
  - `Results.pricedIn.impliedRote: ImpliedRoteSection | null`, `ImpliedRoteSection = { impliedRote: number; priceToTangibleBook: number; costOfEquity: number; terminalGrowth: number }`.
  - `Derived.enterpriseValue: number | null`; metrics `priceTangibleBook` and `dividendYield`.
  - Resolutions `excessReturnUnavailable { reason }` and `reverseDcfUnavailable` reason `"financialInstitution"`; warning `capitalNearRequirement`.

- [ ] **Step 1: Write the failing tests**

In `src/math/hurdle.test.ts`, in "every valued classification has a discount…", add `["bankInsurer", 0.3]` to `expected`; in "a classification Kosing cannot value…", remove `"bankInsurer"` from the list.

Append to `src/results/assemble.test.ts`:

```ts
const bank = () => loadFixture("nordbank.facts");
const bankCase = () => loadFixture("nordbank-excess.case");

test("an excess-return case values the bank and fills its section", () => {
  const r = assemble(decoded(bank(), bankCase()));
  assert.equal(r.valuation?.method, "excessReturn");
  if (r.valuation?.method !== "excessReturn") return;
  assert.equal(r.valuation.tangibleBook, 9000);
  assertClose(r.valuation.costOfEquity, r.derived.wacc.costOfEquity, 1e-12);
  assert.equal(r.valuation.projection.length, 10);
  assert.ok(r.valuation.scenarios?.bear && r.valuation.scenarios.bull);
  assert.ok(r.valuation.scenarios.bear.valuePerShare < r.valuation.valuePerShare);
  assert.equal(r.valuation.sensitivity.grid.length, 5);
  assert.equal(r.sensitivity, null, "the dcf grid stays null");
  assert.equal(r.fx, null);
  assertAllFinite(r);
});

test("a bank's hurdle takes the 30% bankInsurer discount on the excess-return value", () => {
  const r = assemble(decoded(bank(), bankCase()));
  if (r.valuation?.method !== "excessReturn" || r.hurdle === null) throw new Error("unreachable");
  assertClose(r.hurdle.requiredDiscount, 0.3, 1e-12);
  assert.equal(r.hurdle.baseValue, r.valuation.valuePerShare);
});

test("a bank's priced-in section is the implied ROTE, not the reverse dcf", () => {
  const r = assemble(decoded(bank()));
  assert.equal(r.pricedIn.reverseDcf, null);
  assert.ok(
    r.resolutions.some((x) => x.kind === "reverseDcfUnavailable" && x.reason === "financialInstitution"),
  );
  const ir = r.pricedIn.impliedRote;
  assert.ok(ir);
  assertClose(ir.priceToTangibleBook, r.derived.marketCap / 9000, 1e-9);
  assertClose(ir.impliedRote, 0.02 + ir.priceToTangibleBook * (ir.costOfEquity - 0.02), 1e-12);
  assert.equal(assemble(decoded(acme())).pricedIn.impliedRote, null);
  const noBook = mutate(bank(), "financialInstitution.tangibleBookEquity", 0);
  assert.equal(assemble(decoded(noBook)).pricedIn.impliedRote, null, "no ratio on zero book");
});

test("a bank has no enterprise value; its multiples are P/E, P/TBV and dividend yield", () => {
  const r = assemble(decoded(bank()));
  assert.equal(r.derived.enterpriseValue, null);
  const m = new Map(r.pricedIn.multiples.map((x) => [x.metric, x.current]));
  assert.equal(m.get("evEbit"), null);
  assert.equal(m.get("evRevenue"), null);
  assertClose(m.get("priceTangibleBook") ?? 0, r.derived.marketCap / 9000, 1e-9);
  assert.notEqual(m.get("peTrailing"), null);
  assert.equal(assemble(decoded(acme())).pricedIn.multiples.length, 7);
});

test("a capital ratio inside the company's buffer is a warning", () => {
  const thin = mutate(bank(), "financialInstitution.capitalRatio", 0.145);
  const w = assemble(decoded(thin)).warnings.filter((x) => x.rule === "capitalNearRequirement");
  assert.deepEqual(w.map((x) => x.path), ["financialInstitution.capitalRatio"]);
  assert.ok(!assemble(decoded(bank())).warnings.some((x) => x.rule === "capitalNearRequirement"));
  const noTarget = mutate(
    mutate(bank(), "financialInstitution.capitalTarget", null),
    "financialInstitution.capitalRatio",
    0.14,
  );
  assert.ok(
    assemble(decoded(noTarget)).warnings.some((x) => x.rule === "capitalNearRequirement"),
    "without a stated buffer, 1pp applies",
  );
});

test("an undefined excess-return value is a resolution, with no valuation and no hurdle", () => {
  const c = mutate(bankCase(), "method.terminal.growth", 0.5);
  const r = assemble(decoded(bank(), c));
  assert.equal(r.valuation, null);
  assert.equal(r.hurdle, null);
  assert.ok(
    r.resolutions.some(
      (x) => x.kind === "excessReturnUnavailable" && x.reason === "costOfEquityNotAboveGrowth",
    ),
  );
});

test("excess-return scenarios that value in the wrong order raise the warning", () => {
  const inverted = mutate(bankCase(), "method.scenarios", {
    bear: { rotePath: Array(10).fill(0.2), rationale: "labelled bear" },
    bull: { rotePath: Array(10).fill(0.05), rationale: "labelled bull" },
  });
  assert.ok(
    assemble(decoded(bank(), inverted)).warnings.some((w) => w.rule === "scenarioOrderInverted"),
  );
});
```

In `src/select/facts-only.test.ts`, the test "multiple inputs come from the base period and book value" builds the inputs object; update its expected object to the new `MultipleInputs` shape from Step 3 (`tangibleBook: null`, `dividends: null` for acme, whose LTM `dividendsPaid` is null).

- [ ] **Step 2: Run to verify they fail**

Run: `node --import tsx --test src/results/assemble.test.ts src/math/hurdle.test.ts 2>&1 | grep -E "^# (pass|fail)|^not ok"`
Expected: FAIL on every new test and the hurdle table.

- [ ] **Step 3: Implement**

`src/math/hurdle.ts`: `bankInsurer: 0.3,`.

`src/input/errors.ts`: add `| "financialInstitution"` to the `reverseDcfUnavailable` reason union; add the resolution

```ts
  | {
      readonly kind: "excessReturnUnavailable";
      readonly reason: "costOfEquityNotPositive" | "costOfEquityNotAboveGrowth";
    }
```

and `| "capitalNearRequirement"` to `Warning["rule"]`.

`src/input/warnings.ts`, add and include in `collectWarnings`:

```ts
/** Without a stated management buffer, one percentage point stands in for it. */
const DEFAULT_CAPITAL_BUFFER = 0.01;

function capitalNearRequirement(facts: Facts): Warning[] {
  const fi = facts.financialInstitution;
  if (fi === null) return [];
  const floor = fi.capitalRequirement + (fi.capitalTarget ?? DEFAULT_CAPITAL_BUFFER);
  if (fi.capitalRatio >= floor) return [];
  return [
    {
      rule: "capitalNearRequirement",
      path: "financialInstitution.capitalRatio",
      message: `capital ratio ${fi.capitalRatio} is below requirement ${fi.capitalRequirement} plus buffer`,
    },
  ];
}
```

```ts
  return [
    ...casePredatesFacts(facts, investmentCase),
    ...ltmOlderThanFiscalYear(company),
    ...capitalNearRequirement(facts),
  ];
```

`src/math/multiples.ts`:

```ts
export type MultipleInputs = {
  readonly marketCap: number;
  /** null for a financial institution, whose debt is its raw material. */
  readonly enterpriseValue: number | null;
  readonly netIncome: number | null;
  readonly ebit: number | null;
  readonly ebitda: number | null;
  readonly revenue: number | null;
  readonly bookValue: number | null;
  readonly tangibleBook: number | null;
  /** Dividends paid in the base period, as a positive amount. */
  readonly dividends: number | null;
};

export const METRICS = [
  "peTrailing",
  "evEbit",
  "evEbitda",
  "evRevenue",
  "priceBook",
  "priceTangibleBook",
  "dividendYield",
] as const;

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return numerator / denominator;
}

export function computeMultiples(inputs: MultipleInputs): Multiples {
  return {
    peTrailing: ratio(inputs.marketCap, inputs.netIncome),
    evEbit: ratio(inputs.enterpriseValue, inputs.ebit),
    evEbitda: ratio(inputs.enterpriseValue, inputs.ebitda),
    evRevenue: ratio(inputs.enterpriseValue, inputs.revenue),
    priceBook: ratio(inputs.marketCap, inputs.bookValue),
    priceTangibleBook: ratio(inputs.marketCap, inputs.tangibleBook),
    dividendYield: ratio(inputs.dividends, inputs.marketCap),
  };
}
```

Update every `computeMultiples` call in `src/math/multiples.test.ts` to pass `tangibleBook: null, dividends: null` and its expected objects to include `priceTangibleBook: null, dividendYield: null`.

`src/select/derived.ts`: `enterpriseValue: number | null` in `Derived`, and

```ts
    enterpriseValue:
      company.financialInstitution === null ? marketCap + company.netDebt + leases : null,
```

with the doc comment extended: "A bank or insurer has no enterprise value: its debt is its raw material."

`src/select/multiples.ts`:

```ts
export function selectMultipleInputs(
  derived: Derived,
  period: ReportedPeriod,
  company: Company,
): MultipleInputs {
  return {
    marketCap: derived.marketCap,
    enterpriseValue: derived.enterpriseValue,
    netIncome: period.netIncome,
    ebit: period.ebit,
    ebitda: period.ebitda,
    revenue: period.revenue,
    bookValue: company.balanceSheet.totalEquity,
    tangibleBook: company.financialInstitution?.tangibleBookEquity ?? null,
    dividends: period.dividendsPaid === null ? null : Math.abs(period.dividendsPaid),
  };
}

/** Facts carry bands for P/E, EV/EBIT, EV/EBITDA and P/B only. */
function bandFor(company: Company, metric: Metric): RangeBand {
  const ranges = company.historicalRanges;
  if (
    ranges === null ||
    metric === "evRevenue" ||
    metric === "priceTangibleBook" ||
    metric === "dividendYield"
  ) {
    return NO_BAND;
  }
  return ranges[metric];
}

/** Peers carry P/E and the EV multiples only. */
export function selectPeerValues(company: Company, metric: Metric): readonly number[] {
  if (metric === "priceBook" || metric === "priceTangibleBook" || metric === "dividendYield") {
    return [];
  }
  const key: keyof Peer = metric;
  return company.peers.flatMap((p) => {
    const v = p[key];
    return typeof v === "number" ? [v] : [];
  });
}
```

Update the caller in `assemble` to `selectMultipleInputs(derived, base.period, company)` and the `facts-only.test.ts` callers likewise.

`src/select/excess-return.ts`:

```ts
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
```

`src/results/types.ts`: add `ExcessReturnScenarioValue`, `ExcessReturnSection` (shape in Interfaces above; import `ExcessReturnYear`, `ExcessReturnSensitivity` from `../math/excess-return.ts`), add it to `ValuationSection`, and

```ts
export type ImpliedRoteSection = {
  readonly impliedRote: number;
  readonly priceToTangibleBook: number;
  readonly costOfEquity: number;
  readonly terminalGrowth: number;
};
```

with `pricedIn` gaining `readonly impliedRote: ImpliedRoteSection | null;`.

`src/results/assemble.ts`, replace the Task 4 stop in `value` with `return valueExcessReturn(valuation, company);` and add:

```ts
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
    return { ...NOTHING, resolutions: [{ kind: "excessReturnUnavailable", reason: outcome.reason }] };
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
```

Generalise `scenarioWarnings` so it reads the excess-return section too:

```ts
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
```

In `assemble`, set `pricedIn` to:

```ts
    pricedIn: {
      reverseDcf: reverse.section,
      impliedRote: impliedRoteSection(company, derived.marketCap, wacc.costOfEquity, options.reverseDcf.terminalGrowth),
      multiples: multipleRows(company, multiples),
    },
```

`src/results/priced-in.ts`: at the top of `reverseDcfSection`,

```ts
  if (company.financialInstitution !== null) {
    return {
      section: null,
      resolutions: [{ kind: "reverseDcfUnavailable", reason: "financialInstitution" }],
    };
  }
```

and add:

```ts
/** For a bank or insurer, the steady ROTE today's price-to-tangible-book justifies. */
export function impliedRoteSection(
  company: Company,
  marketCap: number,
  costOfEquity: number,
  terminalGrowth: number,
): ImpliedRoteSection | null {
  const tbv = company.financialInstitution?.tangibleBookEquity ?? null;
  if (tbv === null || tbv <= 0) return null;
  const priceToTangibleBook = marketCap / tbv;
  return {
    impliedRote: impliedSteadyStateRote(priceToTangibleBook, costOfEquity, terminalGrowth),
    priceToTangibleBook,
    costOfEquity,
    terminalGrowth,
  };
}
```

`src/results/hurdle.ts` `baseValue`: replace the Task 4 stop with `case "excessReturn": return valuation.valuePerShare;`.

- [ ] **Step 4: Run the full check**

Run: `npx biome check --write src tests && npm run check`
Expected: PASS. Existing tests that assert `pricedIn` keys or `multiples.length === 5` are updated to the new shape (7 metrics, `impliedRote` key), never deleted.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(results): value banks and insurers by excess return

results.json carries the excess-return section with its own grid, the
implied ROTE in place of the reverse dcf, P/TBV and dividend yield among the
multiples, no enterprise value for a financial, the 30% bankInsurer hurdle,
and a warning when capital sits inside the company's buffer.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Skill, investor table, spec status, data migration

**Files:**
- Modify: `.claude/skills/analysing-company/SKILL.md`, `docs/superpowers/specs/2026-10-14-financials-excess-return-design.md`
- Modify (data repo): `standing/INVESTOR.md`, `companies/*/facts.json`

- [ ] **Step 1: Skill line.** In `analysing-company` step 2, after the sentence on bear and bull scenarios, add: `For a bank or insurer (classification bankInsurer, method excessReturn) the base ROTE path spans the rate regimes the company has lived through, using the net interest income history and sensitivity in the facts.`

- [ ] **Step 2: Investor table.** In kosing-data `standing/INVESTOR.md`, add the row `| \`bankInsurer\` | 30% |` to the required-discount table and change "Classifications Kosing cannot value (banks and insurers, REITs and utilities, pre-profit SaaS, commodity producers)" to "Classifications Kosing cannot value (REITs and utilities, pre-profit SaaS, commodity producers)".

- [ ] **Step 3: Migrate the data repo's facts.**

```bash
DATA="$(npm run --silent kosing -- where)"
for f in "$DATA"/companies/*/facts.json; do
  node -e 'const fs=require("fs");const p=process.argv[1];const d=JSON.parse(fs.readFileSync(p));if(!("financialInstitution" in d)){d.financialInstitution=null;fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n");}' "$f"
done
for d in "$DATA"/companies/*/; do npm run --silent kosing -- value "$(basename "$d")" >/dev/null || echo "FAILED $d"; done
```

Expected: no `FAILED` line. Values are unchanged; `results.json` gains the two new multiple rows and `impliedRote: null`.

- [ ] **Step 4: Spec status.** Change the spec's `Status: draft, 2026-10-14.` to `Status: implemented, 2026-10-14.`

- [ ] **Step 5: Commit both repos**

```bash
npm run check && git add -A && git commit -m "docs(skills): banks and insurers take the excessReturn method

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git -C "$DATA" add -A && git -C "$DATA" commit -m "standing: bankInsurer takes a 30% discount; facts gain the financialInstitution key"
```

---

### Task 7: SEB end to end

Not code. Run `researching-company` then `analysing-company` on `SEB.A.STO` (the A share on Nasdaq Stockholm), in a background agent, as for the earlier companies. Check:

- `kosing value SEB.A.STO` exits 0 with the `financialInstitution` block, debt fixed at 0.
- The implied price-to-tangible-book and implied ROTE in `results.json` sit near what the market and brokers state for SEB; a large gap is a finding about the inputs or the model, reported before the advice is trusted.
- `research.md` records net interest income through 2015-2021 and since, and the disclosed sensitivity.
- Every place the schema descriptions were unclear goes into the report.

Report the run to the user as for the other companies.
