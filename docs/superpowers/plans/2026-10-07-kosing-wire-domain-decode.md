# Kosing Wire, Domain and Decode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `decodeCompany(json) → Result<{ company, resolutions, warnings }, DecodeError[]>`, which accepts all 46 real dossiers from the `invest` repo and rejects the 13 invalid fixtures, producing a domain model in which the eight cross-field schema rules are unrepresentable rather than enforced.

**Architecture:** Three layers with one-way dependencies. `src/dossier/` holds Zod schemas mirroring the dossier JSON exactly, plus every dossier rule including research bookkeeping. `src/domain/` holds plain TypeScript types with no optionality beyond real domain states and no knowledge of JSON. `decode()` sits between them, applying fixed fallbacks and recording each as a `Resolution`. `src/math/` is untouched by this plan.

**Tech Stack:** TypeScript 7, Zod 4.6.5, Node 22.18+, tsx, `node:test` + `node:assert/strict`, Biome.

**Spec:** `docs/superpowers/specs/2026-10-07-kosing-decode-and-math-design.md`

**Scope:** This is plan 1 of 2. Plan 2 covers the math modules, the selectors, and the differential corpus. Nothing in `src/math/`, `src/select/`, `result.ts`, `validate.ts` or `dcf-parse.ts` is touched here; those files keep working untouched until plan 2 migrates them.

## Global Constraints

- Node `>=22.18`. TypeScript `strict`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters` — all already set in `tsconfig.json`, none to be relaxed.
- Relative imports carry the `.ts` extension. Filenames are kebab-case (Biome `useFilenamingConvention`).
- Tests live next to the code as `*.test.ts`, using `node:test` and `node:assert/strict`.
- `npm run check` (typecheck + Biome + tests) must pass before every commit.
- Line width 100, double quotes, semicolons, trailing commas — Biome enforces.
- No `as` casts except where Zod's `.brand<>()` requires one. The old hand-rolled brand casts in `validate.ts` are not a precedent to extend.
- Every wire object uses `z.strictObject()`, not `z.object()`. All 46 real dossiers were checked and carry no keys outside the schema, so stripping is pure loss: a misspelled field must be an error the research model can see, not silently discarded data.
- Closed sets of string values are declared once as `as const` arrays in `src/domain/types.ts`; the wire layer builds `z.enum()` from those constants. Zod never appears in `src/domain/`.
- Union discriminants are never given a named type alias.
- Commit directly on `main` (kosing is solo; this overrides the global branch-and-PR rule).

### Transcription rule

Tasks 2–6 transcribe `$defs` from `../invest/workbench/schema/dossier.schema.json`. Where a code block shows a comment such as `// Remaining 13 properties transcribed from $defs.financialRow`, that is an instruction to open the schema and write those properties out, not a gap to leave. The mapping is mechanical and has no judgement in it:

| Schema | Zod |
| --- | --- |
| listed in the def's `required` array | no modifier |
| absent from `required` | `.optional()` |
| `"type": ["number", "null"]` | `.nullable()` |
| both of the above | `.nullable().optional()` |
| `"enum": [...]` | `z.enum(VALUES)` with `VALUES` an `as const` array in `src/domain/types.ts` |
| `"pattern"` | `.regex()` with the same expression |
| `"minimum"` / `"maximum"` | `.min()` / `.max()` |
| `"minItems"` / `"maxItems"` | `.min()` / `.max()` / `.length()` |
| `"format": "date"` | `IsoDateString` from `./primitives.ts` |
| `"$ref"` | the schema that def was transcribed into |
| `"additionalProperties": false` | already covered: every object is `z.strictObject()` |

A schema left with an empty body fails Task 7's "every real dossier parses" test immediately, so an unfinished transcription cannot reach a commit.

## Review Focus

Five input classes the spec implies, that no real dossier exercises, and that would break the program if they arrived. Each has a test pinned to the task owning the code.

1. **A dossier whose only `financials_annual` row is the LTM row.** The schema sets `minItems: 1` on the array but does not require a fiscal-year row, so `fiscalYears` would be empty and violate `NonEmpty<FiscalYear>`. Must be a decode error naming the problem, not a crash. (Task 11)
2. **More than one row with `is_ltm: true`.** The schema permits it; `adapters.py` silently takes `[0]`. `ltm: Period | null` cannot hold two. Must be a decode error. (Task 11)
3. **`unit` of `thousands` or `ones`.** All 247 rows in existence are `millions`, so the rescaling path has no natural coverage, yet the domain guarantees everything is in millions. (Task 11)
4. **`average_fy` with `revenue_base_years` exceeding the available fiscal rows.** EQNR, the only `average_fy` cyclical, asks for 3 and has 5, so the failing branch is never taken. (Task 13)
5. **`trading_currency` differing from `reporting_currency`.** No dossier has it, and the valuation engine assumes a single currency throughout. Decode must reject rather than silently price in a mixture. (Task 10)

---

### Task 1: Toolchain and the domain's shared vocabulary

**Files:**
- Modify: `package.json`
- Create: `src/domain/types.ts`
- Test: `src/domain/types.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `NonEmpty<T>`, `Currency`, `IsoDate`, `BASIS_VALUES`/`Basis`, `CLASSIFICATIONS`/`Classification`, `DeferredClassification`, `UNIT_VALUES`/`Unit`, `isNonEmpty`.

- [ ] **Step 1: Install Zod**

```bash
npm install zod@^4.6.5
```

- [ ] **Step 2: Write the failing test**

Create `src/domain/types.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { BASIS_VALUES, CLASSIFICATIONS, isNonEmpty, UNIT_VALUES } from "./types.ts";

test("closed sets carry their members at runtime", () => {
  assert.deepEqual([...BASIS_VALUES], ["listed", "unlisted"]);
  assert.deepEqual([...UNIT_VALUES], ["millions", "thousands", "ones"]);
  assert.equal(CLASSIFICATIONS.length, 9);
  assert.ok(CLASSIFICATIONS.includes("special_situation"));
});

test("isNonEmpty narrows an array", () => {
  const empty: readonly number[] = [];
  const full: readonly number[] = [1, 2];
  assert.equal(isNonEmpty(empty), false);
  assert.equal(isNonEmpty(full), true);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './types.ts'`

- [ ] **Step 4: Write the implementation**

Create `src/domain/types.ts`:

```ts
/**
 * Vocabulary shared by the domain model. Closed sets of string values live
 * here as `as const` arrays so the wire layer can build `z.enum()` from the
 * same constant without Zod reaching into the domain.
 */

declare const brand: unique symbol;
export type Brand<T, Name extends string> = T & { readonly [brand]: Name };

/** An ISO 4217 code, three uppercase letters. Only a wire parser produces one. */
export type Currency = Brand<string, "Currency">;

/** A calendar date in YYYY-MM-DD form. Only a wire parser produces one. */
export type IsoDate = Brand<string, "IsoDate">;

/** An array the type system knows has at least one element. */
export type NonEmpty<T> = readonly [T, ...T[]];

export function isNonEmpty<T>(values: readonly T[]): values is NonEmpty<T> {
  return values.length > 0;
}

export const BASIS_VALUES = ["listed", "unlisted"] as const;
export type Basis = (typeof BASIS_VALUES)[number];

export const UNIT_VALUES = ["millions", "thousands", "ones"] as const;
export type Unit = (typeof UNIT_VALUES)[number];

export const CLASSIFICATIONS = [
  "quality_compounder",
  "garp",
  "value_cyclical",
  "holding_company",
  "bank_insurer",
  "reit_utility",
  "saas_pre_profit",
  "commodity_producer",
  "special_situation",
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

/** The classifications this application cannot price. Computed, so it cannot drift. */
export type DeferredClassification = Exclude<
  Classification,
  "quality_compounder" | "garp" | "value_cyclical" | "holding_company"
>;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/domain/types.ts src/domain/types.test.ts
git commit -m "feat(domain): add zod and the domain's shared vocabulary"
```

---

### Task 2: Wire primitives

**Files:**
- Create: `src/dossier/primitives.ts`
- Test: `src/dossier/primitives.test.ts`

**Interfaces:**
- Consumes: `Currency`, `IsoDate` from `src/domain/types.ts`.
- Produces: `Iso4217`, `IsoDateString`, `TenNumberPath`, `ScenarioTriple`, `RangePair`, `SourceEntry`, `RevisionEntry` — all Zod schemas. Types via `z.infer`.

Transcribed from `$defs` in `../invest/workbench/schema/dossier.schema.json`: `iso4217`, `isoDate`, `tenNumberPath`, `scenarioTriple`, `rangePair`, `source`, `revision`.

- [ ] **Step 1: Write the failing test**

Create `src/dossier/primitives.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { Iso4217, IsoDateString, ScenarioTriple, TenNumberPath } from "./primitives.ts";

test("iso4217 accepts three uppercase letters only", () => {
  assert.equal(Iso4217.safeParse("SEK").success, true);
  assert.equal(Iso4217.safeParse("sek").success, false);
  assert.equal(Iso4217.safeParse("SEKK").success, false);
});

test("isoDate accepts YYYY-MM-DD only", () => {
  assert.equal(IsoDateString.safeParse("2026-10-07").success, true);
  assert.equal(IsoDateString.safeParse("2026-10-07T00:00:00Z").success, false);
  assert.equal(IsoDateString.safeParse("07/10/2026").success, false);
});

test("tenNumberPath requires exactly ten numbers", () => {
  const ten = Array.from({ length: 10 }, (_, i) => i);
  assert.equal(TenNumberPath.safeParse(ten).success, true);
  assert.equal(TenNumberPath.safeParse(ten.slice(1)).success, false);
});

test("scenarioTriple rejects unknown keys", () => {
  assert.equal(ScenarioTriple.safeParse({ bear: 1, base: 2, bull: 3 }).success, true);
  assert.equal(
    ScenarioTriple.safeParse({ bear: 1, base: 2, bull: 3, baseline: 2 }).success,
    false,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './primitives.ts'`

- [ ] **Step 3: Write the implementation**

Create `src/dossier/primitives.ts`:

```ts
/**
 * Wire primitives, mirroring the small $defs of dossier.schema.json one for
 * one. This layer knows field names and JSON shapes and nothing else.
 */

import { z } from "zod";
import type { Currency, IsoDate } from "../domain/types.ts";

export const Iso4217 = z
  .string()
  .regex(/^[A-Z]{3}$/, "must be a three-letter ISO 4217 code")
  .transform((value) => value as Currency);

export const IsoDateString = z.iso.date().transform((value) => value as IsoDate);

export const TenNumberPath = z.array(z.number()).length(10);

export const ScenarioTriple = z.strictObject({
  bear: z.number(),
  base: z.number(),
  bull: z.number(),
});

export const RangePair = z.strictObject({
  "5y_low": z.number().nullable().optional(),
  "5y_high": z.number().nullable().optional(),
  "10y_low": z.number().nullable().optional(),
  "10y_high": z.number().nullable().optional(),
});

export const SourceEntry = z.strictObject({
  ref: z.string().min(1),
  // Remaining eight properties transcribed from $defs.source.
});

export const RevisionEntry = z.strictObject({
  revision: z.number(),
  kind: z.string(),
  fields_changed: z.array(z.string()).optional(),
  // Remaining two properties transcribed from $defs.revision.
});

export type ScenarioTriple = z.infer<typeof ScenarioTriple>;
export type RangePair = z.infer<typeof RangePair>;
export type SourceEntry = z.infer<typeof SourceEntry>;
export type RevisionEntry = z.infer<typeof RevisionEntry>;
```

Transcribe the elided properties of `source` (9 properties) and `revision` (5 properties) directly from the schema file. Required properties get no `.optional()`; properties typed `["X", "null"]` get `.nullable()`; properties absent from the def's `required` array get `.optional()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dossier/primitives.ts src/dossier/primitives.test.ts
git commit -m "feat(dossier): transcribe the wire primitives"
```

---

### Task 3: Wire financial rows

**Files:**
- Create: `src/dossier/financials.ts`
- Test: `src/dossier/financials.test.ts`

**Interfaces:**
- Consumes: `Iso4217`, `IsoDateString` from `./primitives.ts`; `UNIT_VALUES` from `../domain/types.ts`.
- Produces: `FinancialRow`, `QuarterlyRow` Zod schemas and their inferred types.

Transcribed from `$defs.financialRow` (22 properties, required: `is_ltm`, `fy_end_date`, `currency`, `unit`, `source_ref`) and `$defs.quarterlyRow` (12 properties).

Note the two `if`/`then` blocks inside `$defs.financialRow` tying `is_ltm` to `fy`. **Transcribe them as a `superRefine` on this schema**, so a malformed row is caught at the wire with a correct JSON path. The domain model removes the pairing entirely in Task 8, but the wire still has to reject the bad shape to give the research model an actionable error.

- [ ] **Step 1: Write the failing test**

Create `src/dossier/financials.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { FinancialRow } from "./financials.ts";

const fiscal = {
  is_ltm: false,
  fy: 2025,
  fy_end_date: "2025-12-31",
  currency: "SEK",
  unit: "millions",
  revenue: 1000,
  ebit: 120,
  net_income: 90,
  source_ref: "S1",
};

test("a fiscal row parses", () => {
  assert.equal(FinancialRow.safeParse(fiscal).success, true);
});

test("an ltm row carrying an fy is rejected", () => {
  const bad = { ...fiscal, is_ltm: true, fy: 2025 };
  const result = FinancialRow.safeParse(bad);
  assert.equal(result.success, false);
  assert.ok(result.error?.issues.some((i) => i.path.includes("fy")));
});

test("a fiscal row without an fy is rejected", () => {
  const { fy: _fy, ...bad } = fiscal;
  assert.equal(FinancialRow.safeParse(bad).success, false);
});

test("a row without a unit is rejected", () => {
  const { unit: _unit, ...bad } = fiscal;
  assert.equal(FinancialRow.safeParse(bad).success, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './financials.ts'`

- [ ] **Step 3: Write the implementation**

Create `src/dossier/financials.ts`:

```ts
import { z } from "zod";
import { UNIT_VALUES } from "../domain/types.ts";
import { Iso4217, IsoDateString } from "./primitives.ts";

export const FinancialRow = z
  .strictObject({
    is_ltm: z.boolean(),
    fy: z.number().int().nullable().optional(),
    fy_end_date: IsoDateString,
    currency: Iso4217,
    unit: z.enum(UNIT_VALUES),
    revenue: z.number().optional(),
    ebit: z.number().optional(),
    net_income: z.number().optional(),
    source_ref: z.string(),
    // Remaining 13 nullable-optional properties transcribed from $defs.financialRow:
    // cogs, gross_profit, opex, ebitda, depreciation_amortization, interest_expense,
    // tax_expense, ocf, capex, fcf, shares_basic_m, shares_diluted_m, dividends_paid.
  })
  .superRefine((row, ctx) => {
    if (row.is_ltm && row.fy !== null && row.fy !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["fy"],
        message: "an LTM row must not carry an fy",
      });
    }
    if (!row.is_ltm && (row.fy === null || row.fy === undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["fy"],
        message: "a fiscal-year row requires an integer fy",
      });
    }
  });

export const QuarterlyRow = z.strictObject({
  // 12 properties transcribed from $defs.quarterlyRow.
});

export type FinancialRow = z.infer<typeof FinancialRow>;
export type QuarterlyRow = z.infer<typeof QuarterlyRow>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dossier/financials.ts src/dossier/financials.test.ts
git commit -m "feat(dossier): transcribe financial and quarterly rows"
```

---

### Task 4: Wire market data and cost-of-capital inputs

**Files:**
- Create: `src/dossier/market.ts`
- Test: `src/dossier/market.test.ts`

**Interfaces:**
- Consumes: `Iso4217`, `IsoDateString`, `RangePair` from `./primitives.ts`.
- Produces: `MarketData`, `WaccRawInputs`, `Multiples`, `HistoricalPriceRanges`, `BalanceSheetItems`, `FxLayer` Zod schemas and inferred types.

Transcribed from `$defs`: `marketData` (11 props, 8 required), `waccRawInputs` (11 props, 7 required), `multiples` (11), `historicalPriceRanges` (7), `balanceSheetItems` (14), `fxLayer` (6).

- [ ] **Step 1: Write the failing test**

Create `src/dossier/market.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { MarketData, WaccRawInputs } from "./market.ts";

const market = {
  as_of: "2026-10-01",
  share_price: 212,
  currency: "SEK",
  market_cap: 24000,
  enterprise_value: 26000,
  net_debt: 2000,
  shares_outstanding_m: 113.2,
  shares_diluted_m: null,
  source_ref: "S2",
};

test("market data parses with a null diluted share count", () => {
  assert.equal(MarketData.safeParse(market).success, true);
});

test("market data without net_debt is rejected", () => {
  const { net_debt: _nd, ...bad } = market;
  assert.equal(MarketData.safeParse(bad).success, false);
});

test("wacc raw inputs accept a null company beta", () => {
  const wacc = {
    risk_free_rate: 0.025,
    risk_free_basis: "Swedish 10-year government bond",
    erp: 0.055,
    beta_company: null,
    beta_sector: 1.1,
    tax_rate_effective: 0.21,
    tax_rate_statutory: 0.206,
    pretax_cost_of_debt: 0.04,
    capital_structure: { equity_weight_market: 0.9, debt_weight_market: 0.1 },
    source_refs: ["S3"],
  };
  assert.equal(WaccRawInputs.safeParse(wacc).success, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './market.ts'`

- [ ] **Step 3: Write the implementation**

Create `src/dossier/market.ts`, transcribing each `$def` listed above. The shape for `marketData`:

```ts
import { z } from "zod";
import { Iso4217, IsoDateString, RangePair } from "./primitives.ts";

export const MarketData = z.strictObject({
  as_of: IsoDateString,
  share_price: z.number(),
  currency: Iso4217,
  market_cap: z.number(),
  enterprise_value: z.number().nullable(),
  net_debt: z.number(),
  shares_outstanding_m: z.number(),
  shares_diluted_m: z.number().nullable().optional(),
  "52w_high": z.number().nullable().optional(),
  "52w_low": z.number().nullable().optional(),
  source_ref: z.string(),
});

export const WaccRawInputs = z.strictObject({
  risk_free_rate: z.number(),
  risk_free_basis: z.string(),
  erp: z.number(),
  country_premium: z.number().optional(),
  beta_sector: z.number().nullable().optional(),
  beta_company: z.number().nullable().optional(),
  tax_rate_effective: z.number(),
  tax_rate_statutory: z.number().nullable().optional(),
  pretax_cost_of_debt: z.number(),
  capital_structure: z.strictObject({
    equity_weight_market: z.number(),
    debt_weight_market: z.number(),
  }),
  source_refs: z.array(z.string()).min(1),
});

// Multiples, HistoricalPriceRanges, BalanceSheetItems, FxLayer follow the same
// transcription rules. HistoricalPriceRanges uses RangePair for each band.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dossier/market.ts src/dossier/market.test.ts
git commit -m "feat(dossier): transcribe market data and cost-of-capital inputs"
```

---

### Task 5: Wire descriptive context

**Files:**
- Create: `src/dossier/context.ts`
- Test: `src/dossier/context.test.ts`

**Interfaces:**
- Consumes: `IsoDateString`, `Iso4217` from `./primitives.ts`; `BASIS_VALUES` from `../domain/types.ts`.
- Produces: `Identity`, `Business`, `Sentiment`, `GovernanceFlags`, `ForwardEstimates`, `ResearcherNotes`, `SpecialtyMetrics` Zod schemas and inferred types.

Transcribed from `$defs`: `identity` (12), `business` (5), `sentiment` (7), `governanceFlags` (8), `forwardEstimates` (6), `researcherNotes` (4), `specialtyMetrics` (5 blocks: `bank`, `reit`, `holding_company` and two more — the largest def at 3,265 characters).

Only `specialty_metrics.holding_company` is ever read by the domain. The other blocks still need transcribing so that a dossier carrying them parses and so `bad_specialty_block.json` is rejected, but nothing downstream consumes them.

- [ ] **Step 1: Write the failing test**

Create `src/dossier/context.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { ResearcherNotes, SpecialtyMetrics } from "./context.ts";

test("holding company metrics parse", () => {
  const block = {
    holding_company: {
      holdings: [{ name: "Investor AB", fair_value: 1200, value_basis: "listed" }],
      parent_net_debt: -300,
      look_through_nav: 1500,
    },
  };
  assert.equal(SpecialtyMetrics.safeParse(block).success, true);
});

test("a holding with an unknown value_basis is rejected", () => {
  const block = {
    holding_company: {
      holdings: [{ name: "X", fair_value: 1, value_basis: "guessed" }],
    },
  };
  assert.equal(SpecialtyMetrics.safeParse(block).success, false);
});

test("researcher notes carry free-text missing_data entries", () => {
  const notes = {
    missing_data: [{ field: "financials_annual (LTM row)", reason: "not reported" }],
  };
  assert.equal(ResearcherNotes.safeParse(notes).success, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './context.ts'`

- [ ] **Step 3: Write the implementation**

Create `src/dossier/context.ts`, transcribing each `$def`. The holdings block, which is the only part the domain consumes:

```ts
import { z } from "zod";
import { BASIS_VALUES } from "../domain/types.ts";

export const HoldingEntry = z.strictObject({
  name: z.string(),
  fair_value: z.number().nullable().optional(),
  value_basis: z.enum(BASIS_VALUES),
});

export const HoldingCompanyMetrics = z.strictObject({
  holdings: z.array(HoldingEntry),
  parent_net_debt: z.number().nullable().optional(),
  look_through_nav: z.number().nullable().optional(),
});

export const SpecialtyMetrics = z.strictObject({
  holding_company: HoldingCompanyMetrics.optional(),
  // bank, reit and the remaining blocks transcribed from $defs.specialtyMetrics.
});

export const ResearcherNotes = z.strictObject({
  missing_data: z
    .array(z.strictObject({ field: z.string(), reason: z.string() }))
    .optional(),
  // source_conflicts and the remaining two properties transcribed from the schema.
});
```

`fair_value` is nullable here because the wire allows it. The domain requires it, and Task 13 turns a null into a decode error naming the holding.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dossier/context.ts src/dossier/context.test.ts
git commit -m "feat(dossier): transcribe descriptive context and specialty metrics"
```

---

### Task 6: Wire assessment inputs

**Files:**
- Create: `src/dossier/assessment.ts`
- Test: `src/dossier/assessment.test.ts`

**Interfaces:**
- Consumes: `ScenarioTriple`, `TenNumberPath` from `./primitives.ts`; `CLASSIFICATIONS` from `../domain/types.ts`.
- Produces: `AssessmentInputs`, `AssessmentClassification`, `AssessmentQualitative`, `BaseDcfAssumptions`, `BaseHoldcoAssumptions`, `BaseCyclicalAssumptions`, `AssessmentSummary` Zod schemas and inferred types.

`$defs.baseCyclicalAssumptions` carries an `if`/`then` requiring `revenue_base_years` when `revenue_base_policy` is `average_fy`. **Transcribe it as a `superRefine` here.** The domain replaces it with a tagged union in Task 8, but the wire must still produce an actionable error.

The three `base_*` blocks remain independently optional at the wire. The rules tying them to `classification.primary_type` are enforced in Task 13, where the union is constructed.

- [ ] **Step 1: Write the failing test**

Create `src/dossier/assessment.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { BaseCyclicalAssumptions, BaseHoldcoAssumptions } from "./assessment.ts";

const cyclical = {
  revenue_base_policy: "ltm",
  ebit_margin: { bear: 0.05, base: 0.08, bull: 0.11 },
  ev_ebit_multiple: { bear: 6, base: 8, bull: 10 },
  multiple_ceiling: 12,
  rationale: "mid-cycle",
  source_refs: ["S1"],
};

test("an ltm policy needs no revenue_base_years", () => {
  assert.equal(BaseCyclicalAssumptions.safeParse(cyclical).success, true);
});

test("average_fy without revenue_base_years is rejected", () => {
  const bad = { ...cyclical, revenue_base_policy: "average_fy" };
  const result = BaseCyclicalAssumptions.safeParse(bad);
  assert.equal(result.success, false);
  assert.ok(result.error?.issues.some((i) => i.path.includes("revenue_base_years")));
});

test("warranted_discount above 0.9 is rejected", () => {
  const bad = { warranted_discount: 0.95, rationale: "x", source_refs: ["S1"] };
  assert.equal(BaseHoldcoAssumptions.safeParse(bad).success, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './assessment.ts'`

- [ ] **Step 3: Write the implementation**

Create `src/dossier/assessment.ts`:

```ts
import { z } from "zod";
import { CLASSIFICATIONS } from "../domain/types.ts";
import { ScenarioTriple, TenNumberPath } from "./primitives.ts";

export const REVENUE_BASE_POLICIES = ["ltm", "average_fy"] as const;

export const BaseCyclicalAssumptions = z
  .strictObject({
    revenue_base_policy: z.enum(REVENUE_BASE_POLICIES),
    revenue_base_years: z.number().int().positive().optional(),
    ebit_margin: ScenarioTriple,
    ev_ebit_multiple: ScenarioTriple,
    multiple_ceiling: z.number().optional(),
    rationale: z.string().min(1),
    source_refs: z.array(z.string()).min(1),
  })
  .superRefine((block, ctx) => {
    if (block.revenue_base_policy === "average_fy" && block.revenue_base_years === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["revenue_base_years"],
        message: "revenue_base_policy 'average_fy' requires revenue_base_years",
      });
    }
  });

export const BaseHoldcoAssumptions = z.strictObject({
  warranted_discount: z.number().min(0).max(0.9),
  rationale: z.string().min(1),
  source_refs: z.array(z.string()).min(1),
});

export const BaseDcfAssumptions = z.strictObject({
  revenue_growth_path: TenNumberPath,
  ebit_margin_path: TenNumberPath,
  capex_pct_revenue_path: TenNumberPath,
  da_pct_revenue_path: TenNumberPath,
  working_capital_pct_revenue: z.number(),
  terminal_growth: z.number(),
  terminal_growth_basis: z.string(),
  rationale: z.string().min(1),
  source_refs: z.array(z.string()).min(1),
});

export const AssessmentClassification = z.strictObject({
  primary_type: z.enum(CLASSIFICATIONS),
  rationale: z.string().min(1),
  source_refs: z.array(z.string()).min(1),
  // Remaining two properties transcribed from $defs.assessmentClassification.
});

export const AssessmentQualitative = z.strictObject({
  // 8 properties transcribed from $defs.assessmentQualitative.
});

export const AssessmentInputs = z.strictObject({
  classification: AssessmentClassification,
  base_dcf: BaseDcfAssumptions.optional(),
  base_holdco: BaseHoldcoAssumptions.optional(),
  base_cyclical: BaseCyclicalAssumptions.optional(),
  qualitative: AssessmentQualitative,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dossier/assessment.ts src/dossier/assessment.test.ts
git commit -m "feat(dossier): transcribe assessment inputs and the base blocks"
```

---

### Task 7: Assemble the document and its cross-field refinements

**Files:**
- Create: `src/dossier/schema.ts`
- Create: `src/dossier/refine.ts`
- Create: `tests/fixtures/invalid/` (13 files copied from `invest`)
- Test: `src/dossier/schema.test.ts`

**Interfaces:**
- Consumes: every schema from Tasks 2–6.
- Produces: `DossierSchema` (the whole document), `type Dossier = z.infer<typeof DossierSchema>`, and `loadRealDossiers()` / `loadInvalidFixture()` test helpers in `src/test-fixtures.ts`.

The real dossiers are **not** copied. They are refreshed in `invest` and a copy here would go stale. They are read from `process.env.INVEST_DOSSIERS ?? "../invest/dossiers"`, and a missing directory is a loud failure, not a skip. The 13 invalid fixtures **are** copied: they are purpose-built test data and part of this suite's contract.

Two refinements go in `refine.ts`, both from `semantic.py`:

- `cyclical_inputs` — `bear <= base <= bull` for `ebit_margin` and `ev_ebit_multiple`, and no multiple above `multiple_ceiling`.
- `co_invalidation` — a `price_refresh` revision must list every field a price refresh touches. This is research bookkeeping; it stays at the wire and never reaches the domain.

- [ ] **Step 1: Copy the invalid fixtures**

```bash
mkdir -p tests/fixtures/invalid
cp ../invest/tests/fixtures/dossiers/invalid/*.json tests/fixtures/invalid/
git add tests/fixtures/invalid
```

- [ ] **Step 2: Write the failing test**

Create `src/dossier/schema.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadInvalidFixture, loadRealDossiers } from "../test-fixtures.ts";
import { DossierSchema } from "./schema.ts";

test("every real dossier parses", () => {
  const dossiers = loadRealDossiers();
  assert.ok(dossiers.length >= 40, `expected the invest dossiers, found ${dossiers.length}`);
  for (const { name, json } of dossiers) {
    const result = DossierSchema.safeParse(json);
    assert.ok(result.success, `${name}: ${JSON.stringify(result.error?.issues.slice(0, 3))}`);
  }
});

for (const fixture of [
  "missing_schema_version",
  "superseded_schema_version",
  "bad_currency_code",
  "bad_segment_share",
  "bad_specialty_block",
  "ltm_with_fy_set",
  "financials_missing_unit",
  "co_invalidation_price_only",
]) {
  test(`${fixture} is rejected at the wire`, () => {
    assert.equal(DossierSchema.safeParse(loadInvalidFixture(fixture)).success, false);
  });
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './schema.ts'`

- [ ] **Step 4: Write the fixture loader**

Create `src/test-fixtures.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const INVEST_DOSSIERS = process.env.INVEST_DOSSIERS ?? "../invest/dossiers";

export function loadRealDossiers(): { name: string; json: unknown }[] {
  let names: string[];
  try {
    names = readdirSync(INVEST_DOSSIERS).filter((n) => n.endsWith(".dossier.json"));
  } catch (cause) {
    throw new Error(
      `cannot read dossiers from ${INVEST_DOSSIERS}; set INVEST_DOSSIERS to the invest repo's dossiers directory`,
      { cause },
    );
  }
  return names.map((name) => ({
    name,
    json: JSON.parse(readFileSync(join(INVEST_DOSSIERS, name), "utf8")),
  }));
}

export function loadInvalidFixture(stem: string): unknown {
  return JSON.parse(readFileSync(join("tests/fixtures/invalid", `${stem}.json`), "utf8"));
}
```

- [ ] **Step 5: Write the refinements and the document schema**

Create `src/dossier/refine.ts`:

```ts
import type { z } from "zod";

const SCENARIOS = ["bear", "base", "bull"] as const;
const PRICE_REFRESH_REQUIRED = ["market_data", "multiples", "data_as_of"] as const;

type Ctx = z.RefinementCtx;

export function checkCyclicalInputs(block: unknown, ctx: Ctx, path: string[]): void {
  // bear <= base <= bull for ebit_margin and ev_ebit_multiple; no multiple above
  // multiple_ceiling. Transcribed from semantic.py check_cyclical_inputs.
}

export function checkCoInvalidation(revisions: unknown, ctx: Ctx): void {
  // A price_refresh revision whose fields_changed is non-empty must contain every
  // member of PRICE_REFRESH_REQUIRED. Transcribed from semantic.py
  // check_co_invalidation; confirm the exact field set against that file.
}
```

Create `src/dossier/schema.ts` assembling the 27 top-level properties, required per the schema's `required` array, with `schema_version: z.literal("2.1")`, and both refinements applied via `.superRefine()`.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run check`
Expected: PASS, with all 46 dossiers parsing

- [ ] **Step 7: Commit**

```bash
git add src/dossier/ src/test-fixtures.ts tests/fixtures/invalid
git commit -m "feat(dossier): assemble the document schema and its refinements"
```

---

### Task 8: The domain model

**Files:**
- Create: `src/domain/company.ts`
- Create: `src/domain/financials.ts`
- Create: `src/domain/valuation.ts`
- Test: `src/domain/valuation.test.ts`

**Interfaces:**
- Consumes: `NonEmpty`, `Currency`, `IsoDate`, `Basis`, `Classification`, `DeferredClassification` from `./types.ts`.
- Produces: `Company`, `Identity`, `Market`, `Qualitative`, `CostOfCapital`, `OperatingFinancials`, `Period`, `FiscalYear`, `Valuation`, `CyclicalRevenueBase`, `Holding`, `DcfAssumptions`, `CyclicalAssumptions`, `NavAssumptions`.

This task is types plus a test that proves the impossible states are impossible. `@ts-expect-error` is the test instrument: a line that fails to compile is the assertion, and if it ever starts compiling, `tsc` reports the unused directive and the build breaks.

- [ ] **Step 1: Write the failing test**

Create `src/domain/valuation.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Valuation } from "./valuation.ts";

test("a nav valuation carries holdings and no financials", () => {
  const nav: Valuation = {
    method: "nav",
    holdings: [{ name: "Investor AB", fairValue: 1200, basis: "listed" }],
    parentNetDebt: -300,
    lookThroughNav: 1500,
    assumptions: { warrantedDiscount: 0.25 },
  };
  assert.equal(nav.method, "nav");
});

test("base blocks cannot coexist", () => {
  const bad = {
    method: "dcf",
    // @ts-expect-error a dcf valuation has no cyclical assumptions
    assumptions: { ebitMargin: { bear: 1, base: 2, bull: 3 } },
  } satisfies Partial<Valuation>;
  assert.ok(bad);
});

test("a deferred valuation carries no assumptions", () => {
  const deferred: Valuation = { method: "deferred", classification: "bank_insurer" };
  // @ts-expect-error deferred has no financials to read
  assert.equal(deferred.financials, undefined);
});

test("a priceable classification is not a DeferredClassification", () => {
  // @ts-expect-error garp is priceable, so it cannot be deferred
  const bad: Valuation = { method: "deferred", classification: "garp" };
  assert.ok(bad);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './valuation.ts'`

- [ ] **Step 3: Write the domain types**

Create `src/domain/financials.ts`:

```ts
import type { IsoDate, NonEmpty } from "./types.ts";

/** A reporting period's figures, in reporting currency, millions. */
export type Period = {
  readonly revenue: number;
  readonly ebit: number;
  readonly netIncome: number | null;
  readonly ebitda: number | null;
  readonly depreciationAmortization: number | null;
  readonly ocf: number | null;
  readonly capex: number | null;
  readonly fcf: number | null;
};

export type FiscalYear = Period & {
  readonly fy: number;
  readonly endDate: IsoDate;
};

/**
 * `ltm` is null when the dossier reports no trailing-twelve-month row. That is a
 * real domain state: the DCF method falls back to the latest fiscal year, and
 * the cyclical method reads it only for an optional margin reference.
 */
export type OperatingFinancials = {
  readonly ltm: Period | null;
  readonly fiscalYears: NonEmpty<FiscalYear>;
};
```

Create `src/domain/valuation.ts`:

```ts
import type { FiscalYear, OperatingFinancials, Period } from "./financials.ts";
import type { Basis, DeferredClassification, NonEmpty } from "./types.ts";

export type Holding = {
  readonly name: string;
  readonly fairValue: number;
  readonly basis: Basis;
};

export type ScenarioTriple = {
  readonly bear: number;
  readonly base: number;
  readonly bull: number;
};

export type DcfAssumptions = {
  readonly revenueGrowthPath: readonly number[];
  readonly ebitMarginPath: readonly number[];
  readonly capexPercentOfRevenuePath: readonly number[];
  readonly daPercentOfRevenuePath: readonly number[];
  readonly workingCapitalPercentOfRevenue: number;
  readonly terminalGrowth: number;
};

export type CyclicalAssumptions = {
  readonly ebitMargin: ScenarioTriple;
  readonly evEbitMultiple: ScenarioTriple;
  readonly multipleCeiling: number | null;
};

export type NavAssumptions = { readonly warrantedDiscount: number };

/** Carries the evidence that the dossier's stated policy was satisfiable. */
export type CyclicalRevenueBase =
  | { readonly kind: "ltm"; readonly period: Period }
  | { readonly kind: "averageFy"; readonly window: NonEmpty<FiscalYear> };

export type CostOfCapital = {
  readonly riskFree: number;
  readonly erp: number;
  readonly beta: number;
  readonly countryPremium: number;
  readonly preTaxCostOfDebt: number;
  readonly equityWeight: number;
  readonly debtWeight: number;
  /** statutory if reported, else effective. Discounts future cash flows. */
  readonly taxRateForDiscounting: number;
  /** effective, always reported. Taxes the modelled cash flows. */
  readonly taxRateForCashFlows: number;
};

export type Valuation =
  | {
      readonly method: "dcf";
      readonly financials: OperatingFinancials;
      readonly costOfCapital: CostOfCapital;
      readonly assumptions: DcfAssumptions;
    }
  | {
      readonly method: "cyclical";
      readonly financials: OperatingFinancials;
      readonly revenueBase: CyclicalRevenueBase;
      readonly assumptions: CyclicalAssumptions;
    }
  | {
      readonly method: "nav";
      readonly holdings: NonEmpty<Holding>;
      readonly parentNetDebt: number;
      readonly lookThroughNav: number | null;
      readonly assumptions: NavAssumptions;
    }
  | {
      readonly method: "deferred";
      readonly classification: DeferredClassification;
    };
```

Create `src/domain/company.ts`:

```ts
import type { Currency, IsoDate } from "./types.ts";
import type { Valuation } from "./valuation.ts";

export type Identity = {
  readonly ticker: string;
  readonly exchange: string;
  readonly companyName: string;
  readonly isin: string | null;
};

/** All monetary values in reporting currency, millions. */
export type Market = {
  readonly price: number;
  readonly shares: number;
  readonly netDebt: number;
  readonly marketCap: number;
  readonly asOf: IsoDate;
};

export type Qualitative = {
  readonly moatRationale: string;
  // Remaining fields mapped from $defs.assessmentQualitative in Task 13.
};

export type SpotRate = {
  readonly pair: string;
  readonly rate: number;
};

/**
 * A union, which is how check_fx_layer_completeness stops being a check: when
 * FX applies, the pairs and rates the scenario step needs are present by
 * construction, so the FX selector can take a SpotRate rather than a string to
 * look up, and cannot fail.
 */
export type FxLayer =
  | { readonly applies: false }
  | {
      readonly applies: true;
      readonly pairs: NonEmpty<string>;
      readonly spotRates: NonEmpty<SpotRate>;
    };

export type Company = {
  readonly identity: Identity;
  readonly currency: Currency;
  readonly asOf: IsoDate;
  readonly market: Market;
  readonly fxLayer: FxLayer;
  readonly qualitative: Qualitative;
  readonly valuation: Valuation;
};
```

Import `NonEmpty` alongside `Currency` and `IsoDate`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run check`
Expected: PASS, with every `@ts-expect-error` suppressing a real error

- [ ] **Step 5: Commit**

```bash
git add src/domain/
git commit -m "feat(domain): model the company and its valuation union"
```

---

### Task 9: Errors, resolutions, warnings, and the classification switch

**Files:**
- Create: `src/domain/resolution.ts`
- Create: `src/dossier/errors.ts`
- Create: `src/domain/method.ts`
- Test: `src/domain/method.test.ts`

**Interfaces:**
- Consumes: `Classification`, `DeferredClassification` from `./types.ts`; `assertNever` from `../exhaustive.ts`.
- Produces: `Resolution`, `Warning`, `DecodeError`, `decodeError()`, `methodFor(c: Classification): Valuation["method"]`.

- [ ] **Step 1: Write the failing test**

Create `src/domain/method.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { methodFor } from "./method.ts";
import { CLASSIFICATIONS } from "./types.ts";

test("every classification maps to a method", () => {
  for (const c of CLASSIFICATIONS) {
    assert.ok(["dcf", "cyclical", "nav", "deferred"].includes(methodFor(c)), c);
  }
});

test("the four priceable classifications map as specified", () => {
  assert.equal(methodFor("quality_compounder"), "dcf");
  assert.equal(methodFor("garp"), "dcf");
  assert.equal(methodFor("value_cyclical"), "cyclical");
  assert.equal(methodFor("holding_company"), "nav");
});

test("the five unpriceable classifications defer", () => {
  for (const c of [
    "bank_insurer",
    "reit_utility",
    "saas_pre_profit",
    "commodity_producer",
    "special_situation",
  ] as const) {
    assert.equal(methodFor(c), "deferred");
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './method.ts'`

- [ ] **Step 3: Write the implementation**

Create `src/domain/method.ts`:

```ts
import { assertNever } from "../exhaustive.ts";
import type { Classification } from "./types.ts";
import type { Valuation } from "./valuation.ts";

/**
 * Exhaustive by construction: adding a classification to the wire schema makes
 * the `default` branch receive a value that is not `never`, so this stops
 * compiling until someone decides which branch it takes.
 */
export function methodFor(classification: Classification): Valuation["method"] {
  switch (classification) {
    case "quality_compounder":
    case "garp":
      return "dcf";
    case "value_cyclical":
      return "cyclical";
    case "holding_company":
      return "nav";
    case "bank_insurer":
    case "reit_utility":
    case "saas_pre_profit":
    case "commodity_producer":
    case "special_situation":
      return "deferred";
    default:
      return assertNever(classification);
  }
}
```

Create `src/domain/resolution.ts`:

```ts
/** Why a fallback fired. Formatted only at a render edge, never here. */
export type Resolution =
  | { readonly kind: "betaFromSector"; readonly value: number }
  | { readonly kind: "sharesFromOutstanding"; readonly value: number }
  | { readonly kind: "waccTaxRateFromEffective"; readonly value: number }
  | { readonly kind: "unitRescaled"; readonly from: "thousands" | "ones"; readonly rows: number }
  | { readonly kind: "revenueBaseFromLtm" }
  | { readonly kind: "revenueBaseFromFiscalYear"; readonly fy: number }
  | { readonly kind: "revenueBaseAveraged"; readonly fromFy: number; readonly toFy: number };

/** Advisory, not fatal. The dossier is usable; something is worth knowing. */
export type Warning = {
  readonly rule: "staleness" | "rfBasis";
  readonly path: string;
  readonly message: string;
};
```

Create `src/dossier/errors.ts`:

```ts
/** `path` is a pointer into the wire document, which is the file a human edits. */
export type DecodeError = {
  readonly layer: "schema" | "semantic";
  readonly rule: string;
  readonly path: string;
  readonly message: string;
};

export function decodeError(
  layer: DecodeError["layer"],
  rule: string,
  path: string,
  message: string,
): DecodeError {
  return { layer, rule, path, message };
}

/**
 * The shape Zod's own `safeParse` returns, reused so every decoder in this
 * layer reports the same way and callers learn one pattern.
 */
export type DecodeResult<T> =
  | { readonly success: true; readonly data: T; readonly error?: undefined }
  | { readonly success: false; readonly data?: undefined; readonly error: DecodeError[] };

export function decoded<T>(data: T): DecodeResult<T> {
  return { success: true, data };
}

export function failed<T>(error: DecodeError[]): DecodeResult<T> {
  return { success: false, error };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/resolution.ts src/domain/method.ts src/domain/method.test.ts src/dossier/errors.ts
git commit -m "feat(domain): map classification to method and model decode outcomes"
```

---

### Task 10: Decode identity, currency and market

**Files:**
- Create: `src/dossier/decode-market.ts`
- Test: `src/dossier/decode-market.test.ts`

**Interfaces:**
- Consumes: `Dossier` from `./schema.ts`; `Identity`, `Market`, `FxLayer`, `SpotRate` from `../domain/company.ts`; `Resolution` from `../domain/resolution.ts`; `DecodeError` from `./errors.ts`.
- Produces: `decodeIdentity(d: Dossier): Identity`, `decodeCurrency(d: Dossier): DecodeResult<Currency>`, `decodeMarket(d: Dossier): { market: Market; resolutions: Resolution[] }`, `decodeFxLayer(d: Dossier): DecodeResult<FxLayer>`.

`DecodeResult<T>` comes from Task 9's `src/dossier/errors.ts`; use `decoded()` and `failed()` to build it rather than object literals.

Four behaviours, each replacing a Python construct:

- Share count: `shares_diluted_m` when it is a number, else `shares_outstanding_m`, recording `sharesFromOutstanding`. Python uses `or`, which treats a legitimate `0` as missing; use an explicit `=== null || === undefined` check.
- Net debt: required by the schema, so read it directly. Python's `.get("net_debt", 0.0)` default is dead code and must not be reproduced.
- Currency: `reporting_currency` is required, so read it directly. Python's `"SEK"` default is dead code. **Reject when `trading_currency` differs from `reporting_currency`** (Review Focus 5), since every downstream valuation assumes one currency.
- FX layer: becomes a union, which is how `check_fx_layer_completeness` stops being a check. When `applies` is false nothing else is carried; when it is true, both `sek_relevant_pairs` and `spot_rates` must be non-empty, and an empty one is `semantic.fx_layer_completeness`. Plan 2's FX selector takes a `SpotRate` the caller picked off `company.fxLayer.spotRates`, which is what makes it total, so the non-empty guarantee has to be established here.

- [ ] **Step 1: Write the failing test**

Create `src/dossier/decode-market.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeCurrency, decodeMarket } from "./decode-market.ts";

const base = {
  reporting_currency: "SEK",
  trading_currency: "SEK",
  market_data: {
    as_of: "2026-10-01",
    share_price: 212,
    currency: "SEK",
    market_cap: 24000,
    enterprise_value: 26000,
    net_debt: 2000,
    shares_outstanding_m: 113.2,
    shares_diluted_m: 115.0,
    source_ref: "S2",
  },
};

test("diluted shares are preferred and record no resolution", () => {
  const { market, resolutions } = decodeMarket(base as never);
  assert.equal(market.shares, 115.0);
  assert.deepEqual(resolutions, []);
});

test("a null diluted count falls back and records why", () => {
  const d = { ...base, market_data: { ...base.market_data, shares_diluted_m: null } };
  const { market, resolutions } = decodeMarket(d as never);
  assert.equal(market.shares, 113.2);
  assert.deepEqual(resolutions, [{ kind: "sharesFromOutstanding", value: 113.2 }]);
});

test("a diluted count of zero is used, not treated as missing", () => {
  const d = { ...base, market_data: { ...base.market_data, shares_diluted_m: 0 } };
  const { market, resolutions } = decodeMarket(d as never);
  assert.equal(market.shares, 0);
  assert.deepEqual(resolutions, []);
});

test("a trading currency differing from reporting is rejected", () => {
  const d = { ...base, trading_currency: "EUR" };
  const result = decodeCurrency(d as never);
  assert.equal(result.success, false);
  assert.equal(result.error?.[0]?.rule, "semantic.single_currency");
});

test("an fx layer that does not apply carries nothing else", () => {
  const d = { ...base, fx_layer: { applies: false } };
  const result = decodeFxLayer(d as never);
  assert.ok(result.success);
  assert.deepEqual(result.data, { applies: false });
});

test("an applying fx layer with empty spot rates is rejected", () => {
  const d = {
    ...base,
    fx_layer: { applies: true, sek_relevant_pairs: ["EURSEK"], spot_rates: [] },
  };
  const result = decodeFxLayer(d as never);
  assert.equal(result.success, false);
  assert.equal(result.error?.[0]?.rule, "semantic.fx_layer_completeness");
});

test("an applying fx layer yields non-empty pairs and rates", () => {
  const d = {
    ...base,
    fx_layer: {
      applies: true,
      sek_relevant_pairs: ["EURSEK"],
      spot_rates: [{ pair: "EURSEK", rate: 11.2 }],
    },
  };
  const result = decodeFxLayer(d as never);
  assert.ok(result.success);
  assert.equal(result.data?.applies, true);
});
```

Import `decodeFxLayer` alongside the others.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './decode-market.ts'`

- [ ] **Step 3: Write the implementation**

Create `src/dossier/decode-market.ts` implementing `decodeIdentity`, `decodeCurrency`, `decodeMarket` and `decodeFxLayer` exactly as described above, with `decodeMarket` returning `{ market, resolutions }` and the other two returning `DecodeResult<...>`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dossier/decode-market.ts src/dossier/decode-market.test.ts
git commit -m "feat(dossier): decode identity, currency and market"
```

---

### Task 11: Decode financials

**Files:**
- Create: `src/dossier/decode-financials.ts`
- Test: `src/dossier/decode-financials.test.ts`

**Interfaces:**
- Consumes: `FinancialRow` from `./financials.ts`; `OperatingFinancials`, `Period`, `FiscalYear` from `../domain/financials.ts`.
- Produces: `decodeFinancials(rows: readonly FinancialRow[]): DecodeResult<{ financials: OperatingFinancials; resolutions: Resolution[] }>`.

This task owns three Review Focus items. The function must:

- split rows into the single LTM row and the fiscal-year rows, sorted oldest to newest by `fy`;
- **reject more than one `is_ltm: true` row** (Review Focus 2), since `ltm: Period | null` cannot hold two and Python silently takes `[0]`;
- **reject an empty fiscal-year list** (Review Focus 1), since `NonEmpty<FiscalYear>` requires one and the schema's `minItems: 1` does not guarantee it;
- reject a row missing `revenue` or `ebit`, since `Period` requires both. Only holdco and deferred dossiers carry such rows, and they never reach this function;
- **rescale `thousands` (÷ 1,000) and `ones` (÷ 1,000,000) to millions** (Review Focus 3), recording `unitRescaled`;
- reject rows whose `currency` or `unit` disagree, replacing `check_currency_consistency` and `check_unit_consistency`.

- [ ] **Step 1: Write the failing test**

Create `src/dossier/decode-financials.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeFinancials } from "./decode-financials.ts";

function row(over: Record<string, unknown> = {}) {
  return {
    is_ltm: false,
    fy: 2025,
    fy_end_date: "2025-12-31",
    currency: "SEK",
    unit: "millions",
    revenue: 1000,
    ebit: 120,
    source_ref: "S1",
    ...over,
  };
}

test("rows split into one ltm and sorted fiscal years", () => {
  const result = decodeFinancials([
    row({ fy: 2024, fy_end_date: "2024-12-31" }),
    row({ is_ltm: true, fy: null, revenue: 1100 }),
    row({ fy: 2025 }),
  ] as never);
  assert.ok(result.success);
  assert.equal(result.data?.financials.ltm?.revenue, 1100);
  assert.deepEqual(result.data?.financials.fiscalYears.map((y) => y.fy), [2024, 2025]);
});

test("two ltm rows are rejected", () => {
  const result = decodeFinancials([
    row(),
    row({ is_ltm: true, fy: null }),
    row({ is_ltm: true, fy: null }),
  ] as never);
  assert.equal(result.success, false);
  assert.equal(result.error?.[0]?.rule, "semantic.multiple_ltm_rows");
});

test("an all-ltm dossier is rejected for having no fiscal years", () => {
  const result = decodeFinancials([row({ is_ltm: true, fy: null })] as never);
  assert.equal(result.success, false);
  assert.equal(result.error?.[0]?.rule, "semantic.no_fiscal_years");
});

test("thousands are rescaled to millions and recorded", () => {
  const result = decodeFinancials([
    row({ unit: "thousands", revenue: 1_000_000, ebit: 120_000 }),
  ] as never);
  assert.ok(result.success);
  assert.equal(result.data?.financials.fiscalYears[0].revenue, 1000);
  assert.deepEqual(result.data?.resolutions, [
    { kind: "unitRescaled", from: "thousands", rows: 1 },
  ]);
});

test("rows with disagreeing units are rejected", () => {
  const result = decodeFinancials([
    row({ fy: 2024, fy_end_date: "2024-12-31" }),
    row({ fy: 2025, unit: "thousands" }),
  ] as never);
  assert.equal(result.success, false);
  assert.equal(result.error?.[0]?.rule, "semantic.unit_consistency");
});

test("a row missing ebit is rejected", () => {
  const { ebit: _e, ...bad } = row();
  const result = decodeFinancials([bad] as never);
  assert.equal(result.success, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './decode-financials.ts'`

- [ ] **Step 3: Write the implementation**

Create `src/dossier/decode-financials.ts` implementing the six behaviours listed above, using `isNonEmpty` from `../domain/types.ts` to narrow the fiscal-year array before constructing `OperatingFinancials`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dossier/decode-financials.ts src/dossier/decode-financials.test.ts
git commit -m "feat(dossier): decode financials into ltm and fiscal years"
```

---

### Task 12: Decode cost of capital

**Files:**
- Create: `src/dossier/decode-capital.ts`
- Test: `src/dossier/decode-capital.test.ts`

**Interfaces:**
- Consumes: `WaccRawInputs` from `./market.ts`; `CostOfCapital` from `../domain/valuation.ts`.
- Produces: `decodeCostOfCapital(raw: WaccRawInputs): DecodeResult<{ costOfCapital: CostOfCapital; resolutions: Resolution[] }>`.

Two fallbacks, from `wacc_from_dossier` and `_resolve_tax_rate`:

- Beta: `beta_company` when it is a number, else `beta_sector`, recording `betaFromSector`. **Reject when both are absent**, which Python reaches as an unguarded `KeyError` since `beta_sector` is neither required nor non-null.
- Tax rates: `taxRateForDiscounting` is `tax_rate_statutory` when reported, else `tax_rate_effective`, recording `waccTaxRateFromEffective`. `taxRateForCashFlows` is always `tax_rate_effective`, which the schema requires.

`country_premium` is optional in the wire and defaults to `0` here, matching `wacc_raw.get("country_premium", 0.0)`.

- [ ] **Step 1: Write the failing test**

Create `src/dossier/decode-capital.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeCostOfCapital } from "./decode-capital.ts";

function raw(over: Record<string, unknown> = {}) {
  return {
    risk_free_rate: 0.025,
    risk_free_basis: "Swedish 10-year government bond",
    erp: 0.055,
    beta_company: 1.2,
    beta_sector: 1.1,
    tax_rate_effective: 0.21,
    tax_rate_statutory: 0.206,
    pretax_cost_of_debt: 0.04,
    capital_structure: { equity_weight_market: 0.9, debt_weight_market: 0.1 },
    source_refs: ["S3"],
    ...over,
  };
}

test("company beta wins and the two tax rates differ", () => {
  const result = decodeCostOfCapital(raw() as never);
  assert.ok(result.success);
  assert.equal(result.data?.costOfCapital.beta, 1.2);
  assert.equal(result.data?.costOfCapital.taxRateForDiscounting, 0.206);
  assert.equal(result.data?.costOfCapital.taxRateForCashFlows, 0.21);
  assert.deepEqual(result.data?.resolutions, []);
});

test("a null company beta falls back to sector and records why", () => {
  const result = decodeCostOfCapital(raw({ beta_company: null }) as never);
  assert.ok(result.success);
  assert.equal(result.data?.costOfCapital.beta, 1.1);
  assert.deepEqual(result.data?.resolutions, [{ kind: "betaFromSector", value: 1.1 }]);
});

test("both betas absent is rejected rather than crashing", () => {
  const result = decodeCostOfCapital(raw({ beta_company: null, beta_sector: null }) as never);
  assert.equal(result.success, false);
  assert.equal(result.error?.[0]?.rule, "semantic.no_beta");
});

test("a null statutory rate falls back to effective and records why", () => {
  const result = decodeCostOfCapital(raw({ tax_rate_statutory: null }) as never);
  assert.ok(result.success);
  assert.equal(result.data?.costOfCapital.taxRateForDiscounting, 0.21);
  assert.deepEqual(result.data?.resolutions, [
    { kind: "waccTaxRateFromEffective", value: 0.21 },
  ]);
});

test("country premium defaults to zero when absent", () => {
  const { country_premium: _c, ...without } = raw();
  const result = decodeCostOfCapital(without as never);
  assert.ok(result.success);
  assert.equal(result.data?.costOfCapital.countryPremium, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './decode-capital.ts'`

- [ ] **Step 3: Write the implementation**

Create `src/dossier/decode-capital.ts` implementing both fallbacks with explicit null checks, never `||`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dossier/decode-capital.ts src/dossier/decode-capital.test.ts
git commit -m "feat(dossier): decode cost of capital with its two tax rates"
```

---

### Task 13: Decode the valuation union

**Files:**
- Create: `src/dossier/decode-valuation.ts`
- Test: `src/dossier/decode-valuation.test.ts`

**Interfaces:**
- Consumes: `methodFor` from `../domain/method.ts`; `decodeFinancials` from `./decode-financials.ts`; `decodeCostOfCapital` from `./decode-capital.ts`; `Valuation`, `CyclicalRevenueBase`, `Holding` from `../domain/valuation.ts`.
- Produces: `decodeValuation(d: Dossier): DecodeResult<{ valuation: Valuation; resolutions: Resolution[] }>`.

This is where the eight cross-field rules become consequences of construction. For each branch:

- `dcf` — requires `assessment_inputs.base_dcf`; its absence is `semantic.missing_base_block`. Decodes financials and cost of capital.
- `cyclical` — requires `base_cyclical`. Resolves `CyclicalRevenueBase` against the financials: `ltm` policy requires an LTM row, `averageFy` requires at least `revenue_base_years` fiscal rows (**Review Focus 4**). Both failures are decode errors, replacing the two `ValueError`s in `_cyclical_revenue_base`.
- `nav` — requires `base_holdco` and `specialty_metrics.holding_company`. Every holding needs a non-null `fair_value`; a null one is `semantic.holding_without_value` naming the holding, replacing the `ValueError` in `nav_inputs_from_dossier`. `holdings` must be non-empty. `parent_net_debt` defaults to `0` when null, matching Python.
- `deferred` — carries only the classification, narrowed to `DeferredClassification`.

Also resolves `source_ref` strings against the `sources` array, replacing `check_source_ref_integrity`: an unresolvable ref is `semantic.source_ref`.

- [ ] **Step 1: Write the failing test**

Create `src/dossier/decode-valuation.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadInvalidFixture } from "../test-fixtures.ts";
import { decodeValuation } from "./decode-valuation.ts";

// Build minimal dossiers per branch with a local helper; see the task notes.

test("a cyclical dossier stating the ltm policy with no ltm row is rejected", () => {
  const d = cyclicalDossier({ policy: "ltm", rows: [fiscalRow(2025)] });
  const result = decodeValuation(d);
  assert.equal(result.success, false);
  assert.equal(result.error?.[0]?.rule, "semantic.revenue_base_unsatisfiable");
});

test("average_fy asking for more years than exist is rejected", () => {
  const d = cyclicalDossier({ policy: "average_fy", years: 5, rows: [fiscalRow(2025)] });
  const result = decodeValuation(d);
  assert.equal(result.success, false);
  assert.equal(result.error?.[0]?.rule, "semantic.revenue_base_unsatisfiable");
});

test("average_fy takes the most recent window and records it", () => {
  const d = cyclicalDossier({
    policy: "average_fy",
    years: 2,
    rows: [fiscalRow(2023), fiscalRow(2024), fiscalRow(2025)],
  });
  const result = decodeValuation(d);
  assert.ok(result.success);
  assert.equal(result.data?.valuation.method, "cyclical");
  assert.deepEqual(result.data?.resolutions, [
    { kind: "revenueBaseAveraged", fromFy: 2024, toFy: 2025 },
  ]);
});

test("a garp dossier without base_dcf is rejected", () => {
  const result = decodeValuation(dcfDossier({ omitBase: true }));
  assert.equal(result.success, false);
  assert.equal(result.error?.[0]?.rule, "semantic.missing_base_block");
});

test("a holding with a null fair value is rejected by name", () => {
  const result = decodeValuation(navDossier({ nullValueFor: "Unlisted Thing" }));
  assert.equal(result.success, false);
  assert.ok(result.error?.[0]?.message.includes("Unlisted Thing"));
});

test("a special_situation dossier defers", () => {
  const result = decodeValuation(deferredDossier("special_situation"));
  assert.ok(result.success);
  assert.deepEqual(result.data?.valuation, {
    method: "deferred",
    classification: "special_situation",
  });
});

test("an unresolvable source_ref is rejected", () => {
  const result = decodeValuation(loadInvalidFixture("unresolved_source_ref") as never);
  assert.equal(result.success, false);
  assert.equal(result.error?.[0]?.rule, "semantic.source_ref");
});
```

Write `fiscalRow`, `cyclicalDossier`, `dcfDossier`, `navDossier` and `deferredDossier` as local builders at the top of the test file, each returning a minimal object satisfying `DossierSchema`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './decode-valuation.ts'`

- [ ] **Step 3: Write the implementation**

Create `src/dossier/decode-valuation.ts`, switching on `methodFor(d.assessment_inputs.classification.primary_type)` and constructing the matching branch, returning accumulated `DecodeError[]` on any failure.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dossier/decode-valuation.ts src/dossier/decode-valuation.test.ts
git commit -m "feat(dossier): decode the valuation union and its revenue bases"
```

---

### Task 14: Warnings and the top-level decoder

**Files:**
- Create: `src/dossier/warnings.ts`
- Create: `src/dossier/decode.ts`
- Test: `src/dossier/warnings.test.ts`
- Test: `src/dossier/decode.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 10–13.
- Produces: `decodeCompany(json: unknown): DecodeResult<Decoded>` where `Decoded = { company: Company; resolutions: Resolution[]; warnings: Warning[] }`.

Two warnings, both from `semantic.py`, both computed over the decoded `Company` rather than the wire:

- `staleness` — `data_as_of` older than the threshold in `check_staleness`; read the exact window from that function. Path `data_as_of`.
- `rfBasis` — `risk_free_basis` not mentioning a country hint matching `reporting_currency`; transcribe `_CURRENCY_TO_COUNTRY_HINTS`. Path `wacc_raw_inputs.risk_free_basis`.

`decodeCompany` parses with `DossierSchema`, maps any Zod issues to `DecodeError` with `layer: "schema"` and a dotted path from `issue.path`, then runs the decoders in order and concatenates their resolutions.

- [ ] **Step 1: Write the failing test**

Create `src/dossier/warnings.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadInvalidFixture } from "../test-fixtures.ts";
import { decodeCompany } from "./decode.ts";

test("a stale dossier decodes successfully with a warning", () => {
  const result = decodeCompany(loadInvalidFixture("stale_data_as_of"));
  assert.ok(result.success, "staleness is advisory, not fatal");
  assert.ok(result.data?.warnings.some((w) => w.rule === "staleness"));
});

test("a mismatched risk-free basis decodes with a warning", () => {
  const result = decodeCompany(loadInvalidFixture("rf_basis_mismatch"));
  assert.ok(result.success, "an rf-basis mismatch is advisory, not fatal");
  assert.ok(result.data?.warnings.some((w) => w.rule === "rfBasis"));
});

test("a clean dossier produces no warnings", () => {
  // Build a minimal valid dossier dated today; assert warnings is empty.
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './decode.ts'`

- [ ] **Step 3: Write the implementation**

Create `src/dossier/warnings.ts` and `src/dossier/decode.ts` as described.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dossier/warnings.ts src/dossier/decode.ts src/dossier/warnings.test.ts src/dossier/decode.test.ts
git commit -m "feat(dossier): add advisory warnings and the top-level decoder"
```

---

### Task 15: Integration and public interface

**Files:**
- Create: `src/dossier/integration.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `decodeCompany`, the domain types.
- Produces: the package's public surface.

`src/index.ts` keeps its existing `dcf` and `wacc` exports untouched and adds the decode surface. `result.ts`, `validate.ts` and `dcf-parse.ts` stay exported until plan 2 removes them.

- [ ] **Step 1: Write the failing test**

Create `src/dossier/integration.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadRealDossiers } from "../test-fixtures.ts";
import { decodeCompany } from "./decode.ts";

test("every real dossier decodes into a Company", () => {
  const failures: string[] = [];
  for (const { name, json } of loadRealDossiers()) {
    const result = decodeCompany(json);
    if (!result.success) {
      failures.push(`${name}: ${JSON.stringify(result.error.slice(0, 2))}`);
    }
  }
  assert.deepEqual(failures, []);
});

test("the four methods are all exercised by real dossiers", () => {
  const methods = new Set<string>();
  for (const { json } of loadRealDossiers()) {
    const result = decodeCompany(json);
    if (result.success) methods.add(result.data.company.valuation.method);
  }
  assert.deepEqual([...methods].sort(), ["cyclical", "dcf", "deferred", "nav"]);
});

test("the sector-beta fallback fires on the majority of dossiers", () => {
  let fallbacks = 0;
  let total = 0;
  for (const { json } of loadRealDossiers()) {
    const result = decodeCompany(json);
    if (!result.success) continue;
    total += 1;
    if (result.data.resolutions.some((r) => r.kind === "betaFromSector")) fallbacks += 1;
  }
  assert.ok(fallbacks > total / 2, `expected a majority, got ${fallbacks}/${total}`);
});

for (const fixture of ["currency_mismatch", "unit_inconsistency", "unresolved_source_ref"]) {
  test(`${fixture} fails to decode`, () => {
    assert.equal(decodeCompany(loadInvalidFixture(fixture)).success, false);
  });
}
```

Import `loadInvalidFixture` alongside `loadRealDossiers`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL on at least one dossier, until every decoder handles the real data

- [ ] **Step 3: Fix whatever the real data exposes**

Work through the failures. Each one is either a transcription gap in Tasks 2–6 or a decode gap in Tasks 10–13; fix it in the file that owns it rather than special-casing here.

- [ ] **Step 4: Export the public surface**

Add to `src/index.ts`:

```ts
export { decodeCompany, type Decoded } from "./dossier/decode.ts";
export type { DecodeError } from "./dossier/errors.ts";
export type {
  Company,
  FxLayer,
  Identity,
  Market,
  Qualitative,
  SpotRate,
} from "./domain/company.ts";
export type { FiscalYear, OperatingFinancials, Period } from "./domain/financials.ts";
export type { Resolution, Warning } from "./domain/resolution.ts";
export type {
  CostOfCapital,
  CyclicalRevenueBase,
  Holding,
  Valuation,
} from "./domain/valuation.ts";
export type { Basis, Classification, Currency, IsoDate, NonEmpty } from "./domain/types.ts";
```

- [ ] **Step 5: Run the full check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/dossier/integration.test.ts src/index.ts
git commit -m "feat(dossier): decode all 46 real dossiers and export the surface"
```

---

## What plan 2 covers

Not in scope here, listed so the boundary is visible:

- the six remaining math modules: `reverse-dcf`, `sensitivity`, `nav`, `normalised-earnings`, `multiples`, `fx`, plus `linearFade`;
- `src/select/`, the pure total selectors from `Company` to math inputs;
- rewriting `dcf.ts` and `wacc.ts` onto Zod and deleting `result.ts`, `validate.ts`, `dcf-parse.ts`;
- the differential corpus: a throwaway Python script over 46 dossiers × 7 adapters, and the harness asserting at relative tolerance 1e-9;
- `known-deviations.md`;
- property tests for the math invariants.
