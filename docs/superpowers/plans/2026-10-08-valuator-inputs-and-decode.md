# Valuator Inputs and Decode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `decode(facts, investmentCase) → Result<Decoded, DecodeError[]>` over kosing's own `facts.json` and `case.json` formats, emit the JSON Schema for both so the researcher and analyst skills have a contract, and prove it with hand-written fixtures: every valid pair decodes into a `Company` plus `Valuation`, every invalid input is rejected by rule name and path.

**Architecture:** Two Zod schemas in `src/input/` are the single source of truth for the documents; `z.toJSONSchema` emits the researcher's contract from them. `decode()` maps both documents onto a domain model in `src/domain/` in which the cross-document rules are unrepresentable rather than checked, recording every fallback as a `Resolution`. A one-file CLI exposes `kosing schema`. Nothing in `src/math/` is touched; plan 2 migrates it.

**Tech Stack:** TypeScript 7, Zod 4.6.5, Node 22.18+, tsx, `node:test` + `node:assert/strict`, Biome. `ajv` 8 + `ajv-formats` 3 as dev dependencies for the schema round-trip test only.

**Spec:** `docs/superpowers/specs/2026-10-07-valuator-design.md`

**Scope:** Plan 1 of 2. Plan 2 covers `src/math/`, `src/select/`, `src/results/`, `kosing value`, properties and worked examples, and deletes `result.ts`, `validate.ts`, `dcf-parse.ts` and the Nova golden. Those files keep working untouched here; `dcf.ts` and `wacc.ts` still import them.

**Working split:** per `CLAUDE.md`. Each task names its owner. Claude: Tasks 2, 3, 4, 5, 6, 7, 13. The user: Tasks 1, 8, 9, 10, 11, 12. For the user's tasks the implementation block is a reference to check against after writing, not a thing to paste; the tests are binding.

## Global Constraints

- Node `>=22.18`. TypeScript `strict`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters`, all already set in `tsconfig.json`, none relaxed.
- Relative imports carry the `.ts` extension. Filenames are kebab-case (Biome `useFilenamingConvention`).
- Tests live next to the code as `*.test.ts`, using `node:test` and `node:assert/strict`.
- `npm run check` (typecheck + Biome + tests) must pass before every commit.
- Line width 100, double quotes, semicolons, trailing commas. Biome enforces.
- No `as` casts except the one inside a `.transform()` that applies a domain brand.
- Every wire object is `z.strictObject()`.
- Every key is present; unknown is `null`. No `.optional()` anywhere in `facts.ts` or `case.ts`.
- Keys and enum values are camelCase.
- Closed sets of string values that the domain uses are `as const` arrays in `src/domain/types.ts`; wire-only vocabularies (source kinds, tiers) live in `src/input/primitives.ts`. Zod never appears in `src/domain/`.
- Union discriminants are never given a named type alias.
- `case` is reserved: file `case.ts`, schema `CaseSchema`, type `Case`, variable `investmentCase`.
- Nothing under `src/input/` or `src/domain/` imports `node:fs`. Only `src/cli.ts` and `src/test-fixtures.ts` touch the filesystem.
- Commit directly on `main`.

## Rulings made while planning

- **Invalid cases are mutations of valid fixtures, not separate files.** The spec says "one invalid fixture per decode rule". Fifteen near-identical JSON files hide the one line that matters; a `mutate(valid, "path", value)` call in the test shows it. The valid fixtures are committed files, as the spec says.
- **Decode is four files, not one.** The spec's layout lists `decode.ts`. The work splits cleanly into `decode-company.ts` (facts → `Company`), `decode-valuation.ts` (facts + case → `Valuation`), `warnings.ts`, and `decode.ts` (parse, assemble). Same public surface.
- **Wire and domain types share names on purpose and are never imported together by name.** Decode reads wire shapes as indexed types (`Facts["market"]`) and imports domain types by name, so `Market` always means the domain.

## Review Focus

Five input classes the spec implies, that no fixture exercises on its own, and that would break the program or mislead the advisor if they arrived. Each has a test pinned to the task that owns the code.

1. **`fiscalYears` out of order with a duplicate `fy`.** The schema's distinct-`fy` rule must fire with the path of the second occurrence, and decode must sort by `fy` ascending, not trust the file's order. (Task 4 for the rule, Task 10 for the sort)
2. **A dual-listed price whose FX pair is supplied the other way round.** Facts in EUR, price in SEK, and `fx.spotRates` carries `SEKEUR` rather than `EURSEK`. Decode must find the pair in either direction and invert the rate, recording which it used. (Task 10)
3. **`sharesDilutedM: 0`.** A share count of zero is a share count. Python's `or` treated it as missing; the explicit null check must not. (Task 10)
4. **`unit: "ones"` applies to every aggregate and no per-share figure.** Rescaling must reach the balance sheet, holdings fair values, parent net debt and look-through NAV, and must leave `price`, the 52-week range and `eps` alone. (Task 10)
5. **A `nav` case against `holdings: { items: [] }`.** Not null, empty. `semantic.navRequiresHoldings` must fire with path `holdings.items`, not crash on `items[0]`. (Task 11)

---

### Task 1: Domain vocabulary for the new format — the user

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/types.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Brand<T, Name>`, `Currency`, `IsoDate`, `NonEmpty<T>`, `isNonEmpty`, `BASIS_VALUES`/`Basis`, `UNIT_VALUES`/`Unit`, `CLASSIFICATIONS`/`Classification`. `DeferredClassification` is removed.

The nine classification values become camelCase. `DeferredClassification` goes: nothing routes on classification any more.

- [ ] **Step 1: Update the test to the camelCase values**

In `src/domain/types.test.ts`, replace the first test:

```ts
test("closed sets carry their members at runtime", () => {
  assert.deepEqual([...BASIS_VALUES], ["listed", "unlisted"]);
  assert.deepEqual([...UNIT_VALUES], ["millions", "thousands", "ones"]);
  assert.equal(CLASSIFICATIONS.length, 9);
  assert.ok(CLASSIFICATIONS.includes("specialSituation"));
  assert.ok(CLASSIFICATIONS.every((c) => !c.includes("_")), "classification values are camelCase");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL on `CLASSIFICATIONS.includes("specialSituation")`

- [ ] **Step 3: Update the vocabulary**

In `src/domain/types.ts`, replace the `CLASSIFICATIONS` array and delete `DeferredClassification`:

```ts
export const CLASSIFICATIONS = [
  "qualityCompounder",
  "garp",
  "valueCyclical",
  "holdingCompany",
  "bankInsurer",
  "reitUtility",
  "saasPreProfit",
  "commodityProducer",
  "specialSituation",
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];
```

Everything else in the file stays.

- [ ] **Step 4: Run the check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/types.ts src/domain/types.test.ts
git commit -m "refactor(domain): camelCase classifications and drop the deferred set"
```

---

### Task 2: Input primitives — Claude

**Files:**
- Create: `src/input/primitives.ts`
- Create: `src/input/primitives.test.ts`
- Delete: `src/dossier/primitives.ts`, `src/dossier/primitives.test.ts`

**Interfaces:**
- Consumes: `Currency`, `IsoDate` from `src/domain/types.ts`.
- Produces: Zod schemas `Iso4217`, `IsoDateString`, `YearMonth`, `ScenarioTriple`, `TenNumberPath`, `RangeBand`, `SourceId`, `SourceRefs`, `SourceEntry`, `Gap`; constants `SOURCE_KINDS`, `TRUST_TIERS`; types `ScenarioTriple`, `RangeBand`, `SourceEntry`, `Gap`.

The old `src/dossier/primitives.ts` is the raw material. `RangePair` becomes `RangeBand` with camelCase keys, `SourceEntry` is renamed to the new field names, `RevisionEntry` is gone.

- [ ] **Step 1: Move the old test and rewrite it for the new names**

```bash
git mv src/dossier/primitives.test.ts src/input/primitives.test.ts
```

Replace its contents with:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Gap,
  Iso4217,
  IsoDateString,
  RangeBand,
  ScenarioTriple,
  SourceEntry,
  SourceId,
  SourceRefs,
  TenNumberPath,
  YearMonth,
} from "./primitives.ts";

test("iso4217 accepts three uppercase letters only", () => {
  assert.equal(Iso4217.safeParse("SEK").success, true);
  assert.equal(Iso4217.safeParse("sek").success, false);
  assert.equal(Iso4217.safeParse("SEKK").success, false);
});

test("isoDate accepts YYYY-MM-DD only", () => {
  assert.equal(IsoDateString.safeParse("2026-10-07").success, true);
  assert.equal(IsoDateString.safeParse("2026-10").success, false);
  assert.equal(IsoDateString.safeParse("2026-10-07T00:00:00Z").success, false);
});

test("yearMonth accepts YYYY-MM only", () => {
  assert.equal(YearMonth.safeParse("2026-01").success, true);
  assert.equal(YearMonth.safeParse("2026-13").success, false);
  assert.equal(YearMonth.safeParse("2026").success, false);
});

test("tenNumberPath requires exactly ten numbers", () => {
  const ten = Array.from({ length: 10 }, (_, i) => i);
  assert.equal(TenNumberPath.safeParse(ten).success, true);
  assert.equal(TenNumberPath.safeParse(ten.slice(1)).success, false);
});

test("scenarioTriple rejects unknown keys", () => {
  assert.equal(ScenarioTriple.safeParse({ bear: 1, base: 2, bull: 3 }).success, true);
  assert.equal(ScenarioTriple.safeParse({ bear: 1, base: 2, bull: 3, mid: 2 }).success, false);
});

test("rangeBand requires every key, each nullable", () => {
  assert.equal(
    RangeBand.safeParse({ y5Low: 1, y5High: 2, y10Low: null, y10High: null }).success,
    true,
  );
  assert.equal(RangeBand.safeParse({ y5Low: 1, y5High: 2 }).success, false);
});

test("a source id is S followed by digits and refs need at least one", () => {
  assert.equal(SourceId.safeParse("S12").success, true);
  assert.equal(SourceId.safeParse("source-1").success, false);
  assert.equal(SourceRefs.safeParse(["S1"]).success, true);
  assert.equal(SourceRefs.safeParse([]).success, false);
});

const source = {
  id: "S1",
  kind: "annualReport",
  issuer: "Acme Industrial AB",
  title: "Annual Report 2025",
  url: "https://acme.example/ar2025.pdf",
  published: "2026-02-12",
  retrieved: "2026-10-01",
  pages: "48-51",
  tier: "primary",
};

test("a source entry parses, and published may be a year-month or null", () => {
  assert.equal(SourceEntry.safeParse(source).success, true);
  assert.equal(SourceEntry.safeParse({ ...source, published: "2026-01" }).success, true);
  assert.equal(SourceEntry.safeParse({ ...source, published: null }).success, true);
  assert.equal(SourceEntry.safeParse({ ...source, published: "Jan 2026" }).success, false);
});

test("a source entry's kind and tier are closed, and no key may be absent", () => {
  assert.equal(SourceEntry.safeParse({ ...source, kind: "blogPost" }).success, false);
  assert.equal(SourceEntry.safeParse({ ...source, tier: "quaternary" }).success, false);
  const { pages: _p, ...missing } = source;
  assert.equal(SourceEntry.safeParse(missing).success, false);
});

test("a gap names a field and a reason", () => {
  assert.equal(Gap.safeParse({ field: "financials.ltm", reason: "not reported" }).success, true);
  assert.equal(Gap.safeParse({ field: "", reason: "x" }).success, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module './primitives.ts'`

- [ ] **Step 3: Move and rewrite the implementation**

```bash
git mv src/dossier/primitives.ts src/input/primitives.ts
```

Replace its contents with:

```ts
/**
 * Input primitives shared by facts.ts and case.ts. This layer knows field
 * names and JSON shapes and nothing else.
 */

import { z } from "zod";
import type { Currency, IsoDate } from "../domain/types.ts";

/**
 * The cast is the one sanctioned bridge to a domain brand. The domain declares
 * its brands with a `unique symbol` so that Zod never appears in `src/domain/`,
 * which also means Zod's own `.brand<>()` cannot produce them. Only a parser
 * reaches this line, so the brand still means what it claims: validated.
 */
export const Iso4217 = z
  .string()
  .regex(/^[A-Z]{3}$/, "must be a three-letter ISO 4217 code")
  .transform((value) => value as Currency);

export const IsoDateString = z.iso.date().transform((value) => value as IsoDate);

/** A month, for a source whose publication was only ever datable to one. */
export const YearMonth = z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/, "must be YYYY-MM");

export const TenNumberPath = z.array(z.number()).length(10);

export const ScenarioTriple = z.strictObject({
  bear: z.number(),
  base: z.number(),
  bull: z.number(),
});

export const RangeBand = z.strictObject({
  y5Low: z.number().nullable(),
  y5High: z.number().nullable(),
  y10Low: z.number().nullable(),
  y10High: z.number().nullable(),
});

export const SourceId = z.string().regex(/^S[0-9]+$/, "must be S followed by digits");
export const SourceRefs = z.array(SourceId).min(1);

/** Wire-only vocabularies: the domain never sees a source. */
export const SOURCE_KINDS = [
  "annualReport",
  "interimReport",
  "quarterlyReport",
  "pressRelease",
  "irPage",
  "brokerEstimate",
  "aggregator",
  "regulator",
  "macroReference",
  "marketDataFeed",
] as const;

export const TRUST_TIERS = ["primary", "secondary", "tertiary"] as const;

export const SourceEntry = z.strictObject({
  id: SourceId,
  kind: z.enum(SOURCE_KINDS),
  issuer: z.string().min(1),
  title: z.string().min(1),
  url: z.url(),
  published: z.union([IsoDateString, YearMonth]).nullable(),
  retrieved: IsoDateString,
  pages: z.string().nullable(),
  tier: z.enum(TRUST_TIERS),
});

export const Gap = z.strictObject({
  field: z.string().min(1),
  reason: z.string().min(1),
});

export type ScenarioTriple = z.infer<typeof ScenarioTriple>;
export type RangeBand = z.infer<typeof RangeBand>;
export type SourceEntry = z.infer<typeof SourceEntry>;
export type Gap = z.infer<typeof Gap>;
```

- [ ] **Step 4: Run the check**

Run: `npm run check`
Expected: PASS. `src/dossier/financials.ts` and `market.ts` still import from `./primitives.ts` and will now fail to resolve; if so, delete them now rather than in Task 3, with their tests (`git rm src/dossier/financials.ts src/dossier/financials.test.ts src/dossier/market.ts src/dossier/market.test.ts`), and note in the ledger that Task 3 recreates their content under the new format.

- [ ] **Step 5: Commit**

```bash
git add -A src/input src/dossier
git commit -m "refactor(input): reshape the primitives for kosing's own format"
```

---

### Task 3: Facts blocks, part one — Claude

**Files:**
- Create: `src/input/facts.ts`
- Create: `src/input/facts.test.ts`

**Interfaces:**
- Consumes: `Iso4217`, `IsoDateString`, `SourceId`, `SourceRefs` from `./primitives.ts`; `UNIT_VALUES` from `../domain/types.ts`.
- Produces: Zod schemas `Market`, `FiscalYearRow`, `LtmRow`, `QuarterRow`, `Financials`, `BalanceSheet`, `CostOfCapital`. Task 4 adds the rest and `FactsSchema` to the same file.

- [ ] **Step 1: Write the failing test**

Create `src/input/facts.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { BalanceSheet, CostOfCapital, Financials, FiscalYearRow, Market } from "./facts.ts";

export const market = {
  price: 212,
  priceCurrency: "SEK",
  asOf: "2026-10-01",
  sharesOutstandingM: 113.2,
  sharesDilutedM: 115,
  week52High: 260,
  week52Low: 150,
  sourceRefs: ["S2"],
};

test("market parses and a zero price is rejected", () => {
  assert.equal(Market.safeParse(market).success, true);
  assert.equal(Market.safeParse({ ...market, price: 0 }).success, false);
});

test("market rejects an absent key even when the value may be null", () => {
  const { sharesDilutedM: _s, ...absent } = market;
  assert.equal(Market.safeParse(absent).success, false);
  assert.equal(Market.safeParse({ ...market, sharesDilutedM: null }).success, true);
});

export function fiscalYear(fy: number, over: Record<string, unknown> = {}) {
  return {
    fy,
    endDate: `${fy}-12-31`,
    revenue: 1000,
    ebit: 120,
    netIncome: 90,
    ebitda: 150,
    depreciationAmortization: 30,
    cogs: null,
    grossProfit: null,
    opex: null,
    interestExpense: null,
    taxExpense: null,
    ocf: 140,
    capex: -40,
    fcf: 100,
    dividendsPaid: null,
    sharesBasicM: 113,
    sharesDilutedM: 115,
    sourceRef: "S1",
    ...over,
  };
}

test("a fiscal-year row parses with nulls and rejects a non-integer or out-of-range fy", () => {
  assert.equal(FiscalYearRow.safeParse(fiscalYear(2025)).success, true);
  assert.equal(FiscalYearRow.safeParse(fiscalYear(2025.5)).success, false);
  assert.equal(FiscalYearRow.safeParse(fiscalYear(1899)).success, false);
});

test("an ltm row is a fiscal-year row without fy", () => {
  const { fy: _fy, ...ltm } = fiscalYear(2026, { endDate: "2026-06-30" });
  const financials = { fiscalYears: [fiscalYear(2025)], ltm, quarters: null };
  assert.equal(Financials.safeParse(financials).success, true);
  assert.equal(Financials.safeParse({ ...financials, ltm: { ...ltm, fy: 2026 } }).success, false);
});

test("financials require at least one fiscal year", () => {
  assert.equal(Financials.safeParse({ fiscalYears: [], ltm: null, quarters: null }).success, false);
});

test("a quarter's fq is YYYYQn", () => {
  const quarter = {
    fq: "2026Q2",
    endDate: "2026-06-30",
    revenue: 260,
    ebit: 30,
    netIncome: 22,
    ocf: null,
    capex: null,
    fcf: null,
    sourceRef: "S1",
  };
  const financials = { fiscalYears: [fiscalYear(2025)], ltm: null, quarters: [quarter] };
  assert.equal(Financials.safeParse(financials).success, true);
  assert.equal(
    Financials.safeParse({ ...financials, quarters: [{ ...quarter, fq: "2026-Q2" }] }).success,
    false,
  );
});

export const balanceSheet = {
  asOf: "2026-06-30",
  cashAndEquivalents: 4200,
  shortTermInvestments: null,
  totalDebt: 9100,
  shortTermDebt: 1100,
  longTermDebt: 8000,
  operatingLeaseLiabilities: 600,
  pensionObligations: 300,
  goodwill: 2500,
  intangiblesExGoodwill: null,
  sourceRef: "S1",
};

test("balance sheet rejects negative debt", () => {
  assert.equal(BalanceSheet.safeParse(balanceSheet).success, true);
  assert.equal(BalanceSheet.safeParse({ ...balanceSheet, totalDebt: -1 }).success, false);
});

export const costOfCapital = {
  riskFreeRate: 0.025,
  riskFreeBasis: "Swedish 10-year government bond",
  erp: 0.055,
  countryPremium: null,
  betaCompany: null,
  betaSector: 1.1,
  taxRateEffective: 0.21,
  taxRateStatutory: 0.206,
  pretaxCostOfDebt: 0.04,
  equityWeight: 0.9,
  debtWeight: 0.1,
  weightsAsOf: "2026-10-01",
  sourceRefs: ["S3"],
};

test("cost of capital bounds its rates and weights", () => {
  assert.equal(CostOfCapital.safeParse(costOfCapital).success, true);
  assert.equal(CostOfCapital.safeParse({ ...costOfCapital, taxRateEffective: 1.2 }).success, false);
  assert.equal(CostOfCapital.safeParse({ ...costOfCapital, equityWeight: -0.1 }).success, false);
  assert.equal(CostOfCapital.safeParse({ ...costOfCapital, sourceRefs: [] }).success, false);
});
```

The `export`ed builders are reused by Task 4's tests in the same file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module './facts.ts'`

- [ ] **Step 3: Write the blocks**

Create `src/input/facts.ts`:

```ts
/**
 * facts.json: what is observable about a company, as the researcher wrote it.
 * Every key is present; unknown is null. Aggregate monetary figures are in the
 * document's `currency` and `unit`; per-share figures are in `currency` as
 * quoted and never scaled.
 */

import { z } from "zod";
import { UNIT_VALUES } from "../domain/types.ts";
import { Iso4217, IsoDateString, SourceId, SourceRefs } from "./primitives.ts";

const nullableNumber = z.number().nullable();
const nullableNonNegative = z.number().min(0).nullable();

export const Market = z.strictObject({
  price: z.number().positive(),
  priceCurrency: Iso4217,
  asOf: IsoDateString,
  sharesOutstandingM: z.number().min(0),
  sharesDilutedM: nullableNonNegative,
  week52High: nullableNonNegative,
  week52Low: nullableNonNegative,
  sourceRefs: SourceRefs,
});

const periodFigures = {
  revenue: nullableNumber,
  ebit: nullableNumber,
  netIncome: nullableNumber,
  ebitda: nullableNumber,
  depreciationAmortization: nullableNumber,
  cogs: nullableNumber,
  grossProfit: nullableNumber,
  opex: nullableNumber,
  interestExpense: nullableNumber,
  taxExpense: nullableNumber,
  ocf: nullableNumber,
  capex: nullableNumber,
  fcf: nullableNumber,
  dividendsPaid: nullableNumber,
  sharesBasicM: nullableNonNegative,
  sharesDilutedM: nullableNonNegative,
  sourceRef: SourceId,
};

export const FiscalYearRow = z.strictObject({
  fy: z.number().int().min(1900).max(2200),
  endDate: IsoDateString,
  ...periodFigures,
});

/** The trailing-twelve-month row: a fiscal-year row with no fiscal year. */
export const LtmRow = z.strictObject({
  endDate: IsoDateString,
  ...periodFigures,
});

export const QuarterRow = z.strictObject({
  fq: z.string().regex(/^[12][0-9]{3}Q[1-4]$/, "must be a fiscal quarter such as 2026Q2"),
  endDate: IsoDateString,
  revenue: nullableNumber,
  ebit: nullableNumber,
  netIncome: nullableNumber,
  ocf: nullableNumber,
  capex: nullableNumber,
  fcf: nullableNumber,
  sourceRef: SourceId,
});

export const Financials = z.strictObject({
  fiscalYears: z.array(FiscalYearRow).min(1),
  ltm: LtmRow.nullable(),
  quarters: z.array(QuarterRow).nullable(),
});

export const BalanceSheet = z.strictObject({
  asOf: IsoDateString,
  cashAndEquivalents: z.number(),
  shortTermInvestments: nullableNumber,
  totalDebt: z.number().min(0),
  shortTermDebt: nullableNonNegative,
  longTermDebt: nullableNonNegative,
  operatingLeaseLiabilities: nullableNonNegative,
  pensionObligations: nullableNumber,
  goodwill: nullableNumber,
  intangiblesExGoodwill: nullableNumber,
  sourceRef: SourceId,
});

const unitInterval = z.number().min(0).max(1);

export const CostOfCapital = z.strictObject({
  riskFreeRate: z.number(),
  riskFreeBasis: z.string().min(1),
  erp: z.number().min(0),
  countryPremium: nullableNumber,
  betaCompany: nullableNumber,
  betaSector: nullableNumber,
  taxRateEffective: unitInterval,
  taxRateStatutory: unitInterval.nullable(),
  pretaxCostOfDebt: z.number().min(0),
  equityWeight: unitInterval,
  debtWeight: unitInterval,
  weightsAsOf: IsoDateString,
  sourceRefs: SourceRefs,
});

export const UNIT = z.enum(UNIT_VALUES);
```

- [ ] **Step 4: Run the check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/input/facts.ts src/input/facts.test.ts
git commit -m "feat(input): define the market, financials, balance sheet and cost of capital blocks"
```

---

### Task 4: Facts blocks, part two, and the document — Claude

**Files:**
- Modify: `src/input/facts.ts`
- Modify: `src/input/facts.test.ts`

**Interfaces:**
- Consumes: Task 3's blocks; `RangeBand`, `SourceEntry`, `Gap`, `Iso4217`, `IsoDateString`, `SourceId`, `SourceRefs` from `./primitives.ts`; `BASIS_VALUES` from `../domain/types.ts`.
- Produces: Zod schemas `HistoricalRanges`, `Peer`, `Estimate`, `HoldingItem`, `Holdings`, `SpotRate`, `Exposure`, `Fx`, `Company`, `FactsSchema`; type `Facts = z.infer<typeof FactsSchema>`; helper `collectSourceRefs(facts): readonly { path: string; id: string }[]`.

The four wire-level rules from the spec become one `superRefine` on `FactsSchema`, each issue carrying a path into the document. Review Focus 1's rule (distinct `fy`, path of the second occurrence) is here.

- [ ] **Step 1: Append the failing tests**

Append to `src/input/facts.test.ts` (and extend the import line to include `FactsSchema`, `Holdings`, `HistoricalRanges`):

```ts
const band = { y5Low: 120, y5High: 260, y10Low: 80, y10High: 260 };
const nullBand = { y5Low: null, y5High: null, y10Low: null, y10High: null };

test("historical ranges carry five bands and source refs", () => {
  const ranges = {
    sharePrice: band,
    peTrailing: band,
    evEbit: nullBand,
    evEbitda: nullBand,
    priceBook: nullBand,
    sourceRefs: ["S2"],
  };
  assert.equal(HistoricalRanges.safeParse(ranges).success, true);
  const { priceBook: _pb, ...missing } = ranges;
  assert.equal(HistoricalRanges.safeParse(missing).success, false);
});

test("holdings carry items with a nullable fair value and a closed basis", () => {
  const holdings = {
    items: [{ name: "Investor AB", fairValue: 1200, basis: "listed", sourceRef: "S1" }],
    parentNetDebt: -300,
    lookThroughNav: 1500,
    sourceRefs: ["S1"],
  };
  assert.equal(Holdings.safeParse(holdings).success, true);
  assert.equal(
    Holdings.safeParse({
      ...holdings,
      items: [{ name: "X", fairValue: null, basis: "guessed", sourceRef: "S1" }],
    }).success,
    false,
  );
});

export const sources = [
  {
    id: "S1",
    kind: "annualReport",
    issuer: "Acme Industrial AB",
    title: "Annual Report 2025",
    url: "https://acme.example/ar2025.pdf",
    published: "2026-02-12",
    retrieved: "2026-10-01",
    pages: null,
    tier: "primary",
  },
  {
    id: "S2",
    kind: "marketDataFeed",
    issuer: "Nasdaq Stockholm",
    title: "ACME quote",
    url: "https://quotes.example/ACME",
    published: null,
    retrieved: "2026-10-01",
    pages: null,
    tier: "secondary",
  },
  {
    id: "S3",
    kind: "macroReference",
    issuer: "Riksbanken",
    title: "Government bond yields",
    url: "https://riksbank.example/yields",
    published: null,
    retrieved: "2026-10-01",
    pages: null,
    tier: "primary",
  },
];

export function facts(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1.0",
    company: {
      ticker: "ACME",
      exchange: "STO",
      name: "Acme Industrial AB",
      isin: "SE0000000001",
      country: "SE",
    },
    asOf: "2026-10-01",
    currency: "SEK",
    unit: "millions",
    market,
    financials: {
      fiscalYears: [fiscalYear(2024), fiscalYear(2025)],
      ltm: null,
      quarters: null,
    },
    balanceSheet,
    costOfCapital,
    historicalRanges: null,
    peers: null,
    estimates: null,
    holdings: null,
    fx: null,
    sources,
    gaps: [],
    ...over,
  };
}

test("a minimal facts document parses", () => {
  const result = FactsSchema.safeParse(facts());
  assert.ok(result.success, JSON.stringify(result.error?.issues.slice(0, 3)));
});

test("an unresolvable source ref is rejected with its path", () => {
  const result = FactsSchema.safeParse(facts({ market: { ...market, sourceRefs: ["S9"] } }));
  assert.equal(result.success, false);
  const issue = result.error?.issues.find((i) => i.message.includes("S9"));
  assert.deepEqual(issue?.path, ["market", "sourceRefs", 0]);
});

test("a duplicate fiscal year is rejected at the second occurrence", () => {
  const result = FactsSchema.safeParse(
    facts({
      financials: {
        fiscalYears: [fiscalYear(2025), fiscalYear(2024), fiscalYear(2025)],
        ltm: null,
        quarters: null,
      },
    }),
  );
  assert.equal(result.success, false);
  const issue = result.error?.issues.find((i) => i.message.includes("2025"));
  assert.deepEqual(issue?.path, ["financials", "fiscalYears", 2, "fy"]);
});

test("capital-structure weights must sum to one", () => {
  const result = FactsSchema.safeParse(
    facts({ costOfCapital: { ...costOfCapital, equityWeight: 0.8, debtWeight: 0.1 } }),
  );
  assert.equal(result.success, false);
  assert.ok(result.error?.issues.some((i) => i.path.join(".") === "costOfCapital.debtWeight"));
});

test("a trading currency differing from reporting needs a spot rate for the pair", () => {
  const dual = facts({ market: { ...market, priceCurrency: "EUR" } });
  const result = FactsSchema.safeParse(dual);
  assert.equal(result.success, false);
  assert.ok(result.error?.issues.some((i) => i.path.join(".") === "fx"));

  const withRate = facts({
    market: { ...market, priceCurrency: "EUR" },
    fx: {
      spotRates: [{ pair: "SEKEUR", rate: 0.088, asOf: "2026-10-01", sourceRef: "S2" }],
      exposures: [],
    },
  });
  assert.equal(FactsSchema.safeParse(withRate).success, true, "either direction satisfies it");
});

test("the document is strict at every level", () => {
  assert.equal(FactsSchema.safeParse(facts({ extra: 1 })).success, false);
  assert.equal(FactsSchema.safeParse(facts({ market: { ...market, extra: 1 } })).success, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with `FactsSchema` not exported

- [ ] **Step 3: Append the remaining blocks, the document, and the refinement**

Append to `src/input/facts.ts` (and add `BASIS_VALUES` to the domain import and `Gap`, `RangeBand`, `SourceEntry` to the primitives import):

```ts
export const HistoricalRanges = z.strictObject({
  sharePrice: RangeBand,
  peTrailing: RangeBand,
  evEbit: RangeBand,
  evEbitda: RangeBand,
  priceBook: RangeBand,
  sourceRefs: SourceRefs,
});

export const Peer = z.strictObject({
  name: z.string().min(1),
  ticker: z.string().nullable(),
  peTrailing: nullableNumber,
  evEbit: nullableNumber,
  evEbitda: nullableNumber,
  evRevenue: nullableNumber,
  sourceRef: SourceId,
});

export const Estimate = z.strictObject({
  fy: z.number().int(),
  revenue: nullableNumber,
  ebit: nullableNumber,
  eps: nullableNumber,
  sourceRef: SourceId,
});

export const HoldingItem = z.strictObject({
  name: z.string().min(1),
  fairValue: nullableNumber,
  basis: z.enum(BASIS_VALUES),
  sourceRef: SourceId,
});

export const Holdings = z.strictObject({
  items: z.array(HoldingItem),
  parentNetDebt: z.number(),
  lookThroughNav: nullableNumber,
  sourceRefs: SourceRefs,
});

const CurrencyPair = z.string().regex(/^[A-Z]{6}$/, "must be six uppercase letters, as in EURSEK");

export const SpotRate = z.strictObject({
  pair: CurrencyPair,
  rate: z.number().positive(),
  asOf: IsoDateString,
  sourceRef: SourceId,
});

export const Exposure = z.strictObject({
  currency: Iso4217,
  revenueShare: unitInterval.nullable(),
  costShare: unitInterval.nullable(),
});

export const Fx = z.strictObject({
  spotRates: z.array(SpotRate),
  exposures: z.array(Exposure),
});

/** Named CompanyBlock so the domain's Company is the only Company. */
export const CompanyBlock = z.strictObject({
  ticker: z.string().min(1),
  exchange: z.string().min(1),
  name: z.string().min(1),
  isin: z.string().nullable(),
  country: z.string().regex(/^[A-Z]{2}$/, "must be a two-letter country code"),
});

export const FactsShape = z.strictObject({
  schemaVersion: z.literal("1.0"),
  company: CompanyBlock,
  asOf: IsoDateString,
  currency: Iso4217,
  unit: UNIT,
  market: Market,
  financials: Financials,
  balanceSheet: BalanceSheet,
  costOfCapital: CostOfCapital,
  historicalRanges: HistoricalRanges.nullable(),
  peers: z.array(Peer).nullable(),
  estimates: z.array(Estimate).nullable(),
  holdings: Holdings.nullable(),
  fx: Fx.nullable(),
  sources: z.array(SourceEntry).min(1),
  gaps: z.array(Gap),
});

export type FactsShape = z.infer<typeof FactsShape>;

/**
 * Every place a source id appears, with its path, so the refinement can point
 * at the exact reference that does not resolve.
 */
export function collectSourceRefs(facts: FactsShape): readonly { path: string; id: string }[] {
  const refs: { path: string; id: string }[] = [];
  const one = (path: string, id: string) => refs.push({ path, id });
  const many = (path: string, ids: readonly string[]) =>
    ids.forEach((id, i) => one(`${path}.${i}`, id));

  many("market.sourceRefs", facts.market.sourceRefs);
  facts.financials.fiscalYears.forEach((r, i) => one(`financials.fiscalYears.${i}.sourceRef`, r.sourceRef));
  if (facts.financials.ltm) one("financials.ltm.sourceRef", facts.financials.ltm.sourceRef);
  facts.financials.quarters?.forEach((r, i) => one(`financials.quarters.${i}.sourceRef`, r.sourceRef));
  one("balanceSheet.sourceRef", facts.balanceSheet.sourceRef);
  many("costOfCapital.sourceRefs", facts.costOfCapital.sourceRefs);
  if (facts.historicalRanges) many("historicalRanges.sourceRefs", facts.historicalRanges.sourceRefs);
  facts.peers?.forEach((p, i) => one(`peers.${i}.sourceRef`, p.sourceRef));
  facts.estimates?.forEach((e, i) => one(`estimates.${i}.sourceRef`, e.sourceRef));
  if (facts.holdings) {
    facts.holdings.items.forEach((h, i) => one(`holdings.items.${i}.sourceRef`, h.sourceRef));
    many("holdings.sourceRefs", facts.holdings.sourceRefs);
  }
  facts.fx?.spotRates.forEach((s, i) => one(`fx.spotRates.${i}.sourceRef`, s.sourceRef));
  return refs;
}

function toPath(dotted: string): (string | number)[] {
  return dotted.split(".").map((seg) => (/^\d+$/.test(seg) ? Number(seg) : seg));
}

export const FactsSchema = FactsShape.superRefine((facts, ctx) => {
  const ids = new Set(facts.sources.map((s) => s.id));
  for (const { path, id } of collectSourceRefs(facts)) {
    if (!ids.has(id)) {
      ctx.addIssue({ code: "custom", path: toPath(path), message: `source ${id} is not in sources` });
    }
  }

  const seen = new Set<number>();
  facts.financials.fiscalYears.forEach((row, i) => {
    if (seen.has(row.fy)) {
      ctx.addIssue({
        code: "custom",
        path: ["financials", "fiscalYears", i, "fy"],
        message: `fiscal year ${row.fy} appears more than once`,
      });
    }
    seen.add(row.fy);
  });

  const { equityWeight, debtWeight } = facts.costOfCapital;
  if (Math.abs(equityWeight + debtWeight - 1) > 1e-6) {
    ctx.addIssue({
      code: "custom",
      path: ["costOfCapital", "debtWeight"],
      message: `equityWeight + debtWeight must be 1, got ${equityWeight + debtWeight}`,
    });
  }

  const { priceCurrency } = facts.market;
  if (priceCurrency !== facts.currency) {
    const direct = `${priceCurrency}${facts.currency}`;
    const inverse = `${facts.currency}${priceCurrency}`;
    const hasPair = facts.fx?.spotRates.some((s) => s.pair === direct || s.pair === inverse);
    if (!hasPair) {
      ctx.addIssue({
        code: "custom",
        path: ["fx"],
        message: `price is in ${priceCurrency} but no spot rate for ${direct} or ${inverse} is given`,
      });
    }
  }
});

export type Facts = z.infer<typeof FactsSchema>;
```

- [ ] **Step 4: Run the check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/input/facts.ts src/input/facts.test.ts
git commit -m "feat(input): assemble the facts document and its wire-level rules"
```

---

### Task 5: The case document — Claude

**Files:**
- Create: `src/input/case.ts`
- Create: `src/input/case.test.ts`

**Interfaces:**
- Consumes: `IsoDateString`, `ScenarioTriple`, `SourceRefs`, `TenNumberPath` from `./primitives.ts`; `CLASSIFICATIONS` from `../domain/types.ts`.
- Produces: Zod schemas `Terminal`, `DcfMethod`, `RevenueBasePolicy`, `NormalisedEarningsMethod`, `NavMethod`, `Method`, `Overrides`, `Sensitivity`, `CaseSchema`; type `Case = z.infer<typeof CaseSchema>`; constant `DEFAULT_SENSITIVITY_STEPS`.

- [ ] **Step 1: Write the failing test**

Create `src/input/case.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { CaseSchema } from "./case.ts";

const ten = Array.from({ length: 10 }, () => 0.05);

export function dcfCase(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1.0",
    ticker: "ACME",
    factsAsOf: "2026-10-01",
    classification: "garp",
    theses: ["ai-disruption-overreaction"],
    method: {
      kind: "dcf",
      revenueGrowthPath: ten,
      ebitMarginPath: Array.from({ length: 10 }, () => 0.12),
      capexPctRevenuePath: Array.from({ length: 10 }, () => 0.04),
      daPctRevenuePath: Array.from({ length: 10 }, () => 0.03),
      workingCapitalPctRevenue: 0.1,
      terminal: { kind: "perpetuityGrowth", growth: 0.02, basis: "long-run nominal GDP" },
      rationale: "steady compounder",
      sourceRefs: ["S1"],
    },
    overrides: { beta: null, wacc: null, rationale: null },
    sensitivity: null,
    ...over,
  };
}

export function normalisedCase(over: Record<string, unknown> = {}) {
  return dcfCase({
    classification: "valueCyclical",
    method: {
      kind: "normalisedEarnings",
      revenueBase: { kind: "ltm" },
      ebitMargin: { bear: 0.05, base: 0.08, bull: 0.11 },
      evEbitMultiple: { bear: 6, base: 8, bull: 10 },
      multipleCeiling: 12,
      rationale: "mid-cycle",
      sourceRefs: ["S1"],
    },
    ...over,
  });
}

export function navCase(over: Record<string, unknown> = {}) {
  return dcfCase({
    classification: "holdingCompany",
    method: { kind: "nav", warrantedDiscount: 0.25, rationale: "listed holdings", sourceRefs: ["S1"] },
    ...over,
  });
}

test("each method parses", () => {
  for (const c of [dcfCase(), normalisedCase(), navCase()]) {
    const result = CaseSchema.safeParse(c);
    assert.ok(result.success, JSON.stringify(result.error?.issues.slice(0, 3)));
  }
});

test("a method with another method's assumptions is rejected", () => {
  const bad = dcfCase({ method: { ...dcfCase().method, warrantedDiscount: 0.25 } });
  assert.equal(CaseSchema.safeParse(bad).success, false);
});

test("an exit-multiple terminal is closed over three metrics", () => {
  const terminal = { kind: "exitMultiple", multiple: 12, on: "evEbit", basis: "peer median" };
  assert.equal(CaseSchema.safeParse(dcfCase({ method: { ...dcfCase().method, terminal } })).success, true);
  assert.equal(
    CaseSchema.safeParse(dcfCase({ method: { ...dcfCase().method, terminal: { ...terminal, on: "evSales" } } }))
      .success,
    false,
  );
});

test("averageFy needs a positive integer window; ltm needs nothing", () => {
  const avg = normalisedCase({
    method: { ...normalisedCase().method, revenueBase: { kind: "averageFy", years: 3 } },
  });
  assert.equal(CaseSchema.safeParse(avg).success, true);
  const zero = normalisedCase({
    method: { ...normalisedCase().method, revenueBase: { kind: "averageFy", years: 0 } },
  });
  assert.equal(CaseSchema.safeParse(zero).success, false);
});

test("scenario triples must be ordered and under the ceiling, with the path of the offender", () => {
  const unordered = normalisedCase({
    method: { ...normalisedCase().method, ebitMargin: { bear: 0.1, base: 0.08, bull: 0.11 } },
  });
  const r1 = CaseSchema.safeParse(unordered);
  assert.equal(r1.success, false);
  assert.ok(r1.error?.issues.some((i) => i.path.join(".") === "method.ebitMargin"));

  const overCeiling = normalisedCase({
    method: { ...normalisedCase().method, evEbitMultiple: { bear: 6, base: 8, bull: 14 } },
  });
  const r2 = CaseSchema.safeParse(overCeiling);
  assert.equal(r2.success, false);
  assert.ok(r2.error?.issues.some((i) => i.path.join(".") === "method.evEbitMultiple.bull"));
});

test("a warranted discount above 0.9 is rejected", () => {
  const bad = navCase({ method: { ...navCase().method, warrantedDiscount: 0.95 } });
  assert.equal(CaseSchema.safeParse(bad).success, false);
});

test("an override needs a rationale", () => {
  const silent = dcfCase({ overrides: { beta: 1.3, wacc: null, rationale: null } });
  const r = CaseSchema.safeParse(silent);
  assert.equal(r.success, false);
  assert.ok(r.error?.issues.some((i) => i.path.join(".") === "overrides.rationale"));
  const spoken = dcfCase({ overrides: { beta: 1.3, wacc: null, rationale: "sector beta is stale" } });
  assert.equal(CaseSchema.safeParse(spoken).success, true);
});

test("sensitivity steps must include zero", () => {
  const noZero = dcfCase({ sensitivity: { waccSteps: [-0.01, 0.01], terminalGrowthSteps: [0] } });
  const r = CaseSchema.safeParse(noZero);
  assert.equal(r.success, false);
  assert.ok(r.error?.issues.some((i) => i.path.join(".") === "sensitivity.waccSteps"));
});

test("theses may be empty and classification is closed", () => {
  assert.equal(CaseSchema.safeParse(dcfCase({ theses: [] })).success, true);
  assert.equal(CaseSchema.safeParse(dcfCase({ classification: "unicorn" })).success, false);
});

test("overrides and sensitivity belong to dcf only", () => {
  const override = normalisedCase({ overrides: { beta: 1.3, wacc: null, rationale: "x" } });
  const r1 = CaseSchema.safeParse(override);
  assert.equal(r1.success, false);
  assert.ok(r1.error?.issues.some((i) => i.path.join(".") === "overrides"));

  const grid = navCase({ sensitivity: { waccSteps: [0], terminalGrowthSteps: [0] } });
  const r2 = CaseSchema.safeParse(grid);
  assert.equal(r2.success, false);
  assert.ok(r2.error?.issues.some((i) => i.path.join(".") === "sensitivity"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module './case.ts'`

- [ ] **Step 3: Write the implementation**

Create `src/input/case.ts`:

```ts
/**
 * case.json: the analyst's case for investing in one company. Which valuation
 * applies, on what assumptions, and which world-view theses it rests on. The
 * valuator takes the method as given and decides nothing.
 */

import { z } from "zod";
import { CLASSIFICATIONS } from "../domain/types.ts";
import { IsoDateString, ScenarioTriple, SourceRefs, TenNumberPath } from "./primitives.ts";

export const Terminal = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("perpetuityGrowth"),
    growth: z.number(),
    basis: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal("exitMultiple"),
    multiple: z.number().positive(),
    on: z.enum(["evEbit", "evEbitda", "evFcff"]),
    basis: z.string().min(1),
  }),
]);

export const DcfMethod = z.strictObject({
  kind: z.literal("dcf"),
  revenueGrowthPath: TenNumberPath,
  ebitMarginPath: TenNumberPath,
  capexPctRevenuePath: TenNumberPath,
  daPctRevenuePath: TenNumberPath,
  workingCapitalPctRevenue: z.number(),
  terminal: Terminal,
  rationale: z.string().min(1),
  sourceRefs: SourceRefs,
});

export const RevenueBasePolicy = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ltm") }),
  z.strictObject({ kind: z.literal("averageFy"), years: z.number().int().min(1) }),
]);

function orderedTriple(path: string, triple: z.infer<typeof ScenarioTriple>, ctx: z.RefinementCtx) {
  if (!(triple.bear <= triple.base && triple.base <= triple.bull)) {
    ctx.addIssue({ code: "custom", path: ["method", path], message: "bear <= base <= bull is required" });
  }
}

export const NormalisedEarningsMethod = z
  .strictObject({
    kind: z.literal("normalisedEarnings"),
    revenueBase: RevenueBasePolicy,
    ebitMargin: ScenarioTriple,
    evEbitMultiple: ScenarioTriple,
    multipleCeiling: z.number().nullable(),
    rationale: z.string().min(1),
    sourceRefs: SourceRefs,
  });

export const NavMethod = z.strictObject({
  kind: z.literal("nav"),
  warrantedDiscount: z.number().min(0).max(0.9),
  rationale: z.string().min(1),
  sourceRefs: SourceRefs,
});

export const Method = z.discriminatedUnion("kind", [DcfMethod, NormalisedEarningsMethod, NavMethod]);

export const Overrides = z.strictObject({
  beta: z.number().nullable(),
  wacc: z.number().nullable(),
  rationale: z.string().min(1).nullable(),
});

export const DEFAULT_SENSITIVITY_STEPS = [-0.01, -0.005, 0, 0.005, 0.01] as const;

export const Sensitivity = z.strictObject({
  waccSteps: z.array(z.number()).min(1),
  terminalGrowthSteps: z.array(z.number()).min(1),
});

const CaseShape = z.strictObject({
  schemaVersion: z.literal("1.0"),
  ticker: z.string().min(1),
  factsAsOf: IsoDateString.nullable(),
  classification: z.enum(CLASSIFICATIONS),
  theses: z.array(z.string().min(1)),
  method: Method,
  overrides: Overrides,
  sensitivity: Sensitivity.nullable(),
});

/**
 * The value rules the shape cannot carry. Each is listed in schema.ts as
 * unrepresentable in the emitted JSON Schema, and the skills spec restates it
 * in English for the analyst.
 */
export const CaseSchema = CaseShape.superRefine((c, ctx) => {
  if (c.method.kind === "normalisedEarnings") {
    orderedTriple("ebitMargin", c.method.ebitMargin, ctx);
    orderedTriple("evEbitMultiple", c.method.evEbitMultiple, ctx);
    const ceiling = c.method.multipleCeiling;
    if (ceiling !== null) {
      for (const scenario of ["bear", "base", "bull"] as const) {
        if (c.method.evEbitMultiple[scenario] > ceiling) {
          ctx.addIssue({
            code: "custom",
            path: ["method", "evEbitMultiple", scenario],
            message: `${scenario} multiple exceeds multipleCeiling ${ceiling}`,
          });
        }
      }
    }
  }

  const { beta, wacc, rationale } = c.overrides;
  if ((beta !== null || wacc !== null) && rationale === null) {
    ctx.addIssue({
      code: "custom",
      path: ["overrides", "rationale"],
      message: "an override needs a rationale",
    });
  }

  if (c.sensitivity) {
    for (const axis of ["waccSteps", "terminalGrowthSteps"] as const) {
      if (!c.sensitivity[axis].includes(0)) {
        ctx.addIssue({
          code: "custom",
          path: ["sensitivity", axis],
          message: `${axis} must include 0, the base case`,
        });
      }
    }
  }

  // Only a DCF discounts, so only a DCF can have its discount rate overridden or swept.
  if (c.method.kind !== "dcf") {
    if (beta !== null || wacc !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["overrides"],
        message: `overrides apply to the dcf method only; this case is ${c.method.kind}`,
      });
    }
    if (c.sensitivity !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["sensitivity"],
        message: `sensitivity applies to the dcf method only; this case is ${c.method.kind}`,
      });
    }
  }
});

export type Case = z.infer<typeof CaseSchema>;
```

- [ ] **Step 4: Run the check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/input/case.ts src/input/case.test.ts
git commit -m "feat(input): define the case document with one method per case"
```

---

### Task 6: Fixtures and the loader — Claude

**Files:**
- Create: `tests/fixtures/valid/acme.facts.json`
- Create: `tests/fixtures/valid/holdco.facts.json`
- Create: `tests/fixtures/valid/dual.facts.json`
- Create: `tests/fixtures/valid/acme-dcf.case.json`
- Create: `tests/fixtures/valid/acme-normalised.case.json`
- Create: `tests/fixtures/valid/holdco-nav.case.json`
- Create: `src/test-fixtures.ts`
- Create: `src/test-fixtures.test.ts`

**Interfaces:**
- Consumes: `FactsSchema`, `CaseSchema`.
- Produces: `loadFixture(name: string): unknown` reading `tests/fixtures/valid/<name>.json`; `mutate<T>(doc: T, path: string, value: unknown): T` returning a deep copy with one dotted path replaced (`"__delete__"` as value removes the key); constant `VALID_FIXTURES`.

The fixtures are the first worked examples of what the researcher and analyst skills have to produce. `acme` is a DCF-able industrial with five fiscal years and an LTM row. `holdco` has rows with null revenue and a `holdings` block. `dual` reports in EUR and trades in SEK, with the pair given as `SEKEUR` (Review Focus 2).

- [ ] **Step 1: Write the loader test**

Create `src/test-fixtures.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { CaseSchema } from "./input/case.ts";
import { FactsSchema } from "./input/facts.ts";
import { loadFixture, mutate, VALID_FIXTURES } from "./test-fixtures.ts";

for (const name of VALID_FIXTURES.facts) {
  test(`${name} is a valid facts document`, () => {
    const result = FactsSchema.safeParse(loadFixture(name));
    assert.ok(result.success, JSON.stringify(result.error?.issues.slice(0, 3)));
  });
}

for (const name of VALID_FIXTURES.cases) {
  test(`${name} is a valid case document`, () => {
    const result = CaseSchema.safeParse(loadFixture(name));
    assert.ok(result.success, JSON.stringify(result.error?.issues.slice(0, 3)));
  });
}

test("mutate replaces one path and leaves the original untouched", () => {
  const original = { a: { b: [1, 2] }, c: 3 };
  const changed = mutate(original, "a.b.1", 9);
  assert.deepEqual(changed, { a: { b: [1, 9] }, c: 3 });
  assert.deepEqual(original, { a: { b: [1, 2] }, c: 3 });
  assert.deepEqual(mutate(original, "c", "__delete__"), { a: { b: [1, 2] } });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module './test-fixtures.ts'`

- [ ] **Step 3: Write the loader**

Create `src/test-fixtures.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const VALID_FIXTURES = {
  facts: ["acme.facts", "holdco.facts", "dual.facts"],
  cases: ["acme-dcf.case", "acme-normalised.case", "holdco-nav.case"],
} as const;

export function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join("tests", "fixtures", "valid", `${name}.json`), "utf8"));
}

/**
 * A deep copy with one dotted path replaced, so an invalid case is one visible
 * line away from a valid fixture. The value "__delete__" removes the key.
 */
export function mutate<T>(doc: T, path: string, value: unknown): T {
  const copy = structuredClone(doc) as Record<string, unknown>;
  const segments = path.split(".");
  const last = segments.pop();
  if (last === undefined) throw new Error("mutate needs a path");
  let cursor: Record<string, unknown> = copy;
  for (const segment of segments) {
    const next = cursor[segment];
    if (typeof next !== "object" || next === null) {
      throw new Error(`mutate: ${path} does not exist in the document`);
    }
    cursor = next as Record<string, unknown>;
  }
  if (value === "__delete__") {
    delete cursor[last];
  } else {
    cursor[last] = value;
  }
  return copy as T;
}
```

The `as Record<string, unknown>` and `as T` here are test-utility casts over `structuredClone`'s `unknown`, which is the one place the no-cast rule yields: test utilities, not production code.

- [ ] **Step 4: Write the fixtures**

Create `tests/fixtures/valid/acme.facts.json`:

```json
{
  "schemaVersion": "1.0",
  "company": { "ticker": "ACME", "exchange": "STO", "name": "Acme Industrial AB", "isin": "SE0000000001", "country": "SE" },
  "asOf": "2026-10-01",
  "currency": "SEK",
  "unit": "millions",
  "market": {
    "price": 212, "priceCurrency": "SEK", "asOf": "2026-10-01",
    "sharesOutstandingM": 113.2, "sharesDilutedM": 115, "week52High": 260, "week52Low": 150,
    "sourceRefs": ["S2"]
  },
  "financials": {
    "fiscalYears": [
      { "fy": 2021, "endDate": "2021-12-31", "revenue": 8200, "ebit": 820, "netIncome": 600, "ebitda": 1100, "depreciationAmortization": 280, "cogs": null, "grossProfit": null, "opex": null, "interestExpense": -60, "taxExpense": -160, "ocf": 950, "capex": -330, "fcf": 620, "dividendsPaid": -300, "sharesBasicM": 113, "sharesDilutedM": 115, "sourceRef": "S1" },
      { "fy": 2022, "endDate": "2022-12-31", "revenue": 9100, "ebit": 950, "netIncome": 700, "ebitda": 1250, "depreciationAmortization": 300, "cogs": null, "grossProfit": null, "opex": null, "interestExpense": -65, "taxExpense": -185, "ocf": 1050, "capex": -360, "fcf": 690, "dividendsPaid": -330, "sharesBasicM": 113, "sharesDilutedM": 115, "sourceRef": "S1" },
      { "fy": 2023, "endDate": "2023-12-31", "revenue": 9800, "ebit": 1080, "netIncome": 800, "ebitda": 1400, "depreciationAmortization": 320, "cogs": null, "grossProfit": null, "opex": null, "interestExpense": -70, "taxExpense": -210, "ocf": 1180, "capex": -390, "fcf": 790, "dividendsPaid": -360, "sharesBasicM": 113, "sharesDilutedM": 115, "sourceRef": "S1" },
      { "fy": 2024, "endDate": "2024-12-31", "revenue": 10400, "ebit": 1200, "netIncome": 890, "ebitda": 1540, "depreciationAmortization": 340, "cogs": null, "grossProfit": null, "opex": null, "interestExpense": -72, "taxExpense": -238, "ocf": 1290, "capex": -420, "fcf": 870, "dividendsPaid": -400, "sharesBasicM": 113, "sharesDilutedM": 115, "sourceRef": "S1" },
      { "fy": 2025, "endDate": "2025-12-31", "revenue": 11000, "ebit": 1320, "netIncome": 980, "ebitda": 1680, "depreciationAmortization": 360, "cogs": null, "grossProfit": null, "opex": null, "interestExpense": -75, "taxExpense": -265, "ocf": 1400, "capex": -440, "fcf": 960, "dividendsPaid": -430, "sharesBasicM": 113, "sharesDilutedM": 115, "sourceRef": "S1" }
    ],
    "ltm": { "endDate": "2026-06-30", "revenue": 11400, "ebit": 1380, "netIncome": 1020, "ebitda": 1750, "depreciationAmortization": 370, "cogs": null, "grossProfit": null, "opex": null, "interestExpense": -76, "taxExpense": -280, "ocf": 1450, "capex": -450, "fcf": 1000, "dividendsPaid": null, "sharesBasicM": 113.2, "sharesDilutedM": 115, "sourceRef": "S4" },
    "quarters": null
  },
  "balanceSheet": {
    "asOf": "2026-06-30", "cashAndEquivalents": 1900, "shortTermInvestments": 200,
    "totalDebt": 4100, "shortTermDebt": 600, "longTermDebt": 3500,
    "operatingLeaseLiabilities": 700, "pensionObligations": 450, "goodwill": 3200, "intangiblesExGoodwill": 800,
    "sourceRef": "S4"
  },
  "costOfCapital": {
    "riskFreeRate": 0.025, "riskFreeBasis": "Swedish 10-year government bond", "erp": 0.055,
    "countryPremium": null, "betaCompany": null, "betaSector": 1.1,
    "taxRateEffective": 0.21, "taxRateStatutory": 0.206, "pretaxCostOfDebt": 0.04,
    "equityWeight": 0.9, "debtWeight": 0.1, "weightsAsOf": "2026-10-01",
    "sourceRefs": ["S3", "S2"]
  },
  "historicalRanges": {
    "sharePrice": { "y5Low": 120, "y5High": 260, "y10Low": 80, "y10High": 260 },
    "peTrailing": { "y5Low": 14, "y5High": 28, "y10Low": 11, "y10High": 28 },
    "evEbit": { "y5Low": 11, "y5High": 22, "y10Low": null, "y10High": null },
    "evEbitda": { "y5Low": null, "y5High": null, "y10Low": null, "y10High": null },
    "priceBook": { "y5Low": null, "y5High": null, "y10Low": null, "y10High": null },
    "sourceRefs": ["S2"]
  },
  "peers": [
    { "name": "Beta Engineering", "ticker": "BETA", "peTrailing": 19, "evEbit": 15, "evEbitda": 11, "evRevenue": 1.8, "sourceRef": "S2" },
    { "name": "Gamma Tools", "ticker": null, "peTrailing": 22, "evEbit": 17, "evEbitda": null, "evRevenue": 2.1, "sourceRef": "S2" }
  ],
  "estimates": [
    { "fy": 2026, "revenue": 11900, "ebit": 1450, "eps": 9.4, "sourceRef": "S2" }
  ],
  "holdings": null,
  "fx": null,
  "sources": [
    { "id": "S1", "kind": "annualReport", "issuer": "Acme Industrial AB", "title": "Annual Report 2025", "url": "https://acme.example/ar2025.pdf", "published": "2026-02-12", "retrieved": "2026-10-01", "pages": "48-51", "tier": "primary" },
    { "id": "S2", "kind": "marketDataFeed", "issuer": "Nasdaq Stockholm", "title": "ACME quote and consensus", "url": "https://quotes.example/ACME", "published": null, "retrieved": "2026-10-01", "pages": null, "tier": "secondary" },
    { "id": "S3", "kind": "macroReference", "issuer": "Riksbanken", "title": "Government bond yields", "url": "https://riksbank.example/yields", "published": null, "retrieved": "2026-10-01", "pages": null, "tier": "primary" },
    { "id": "S4", "kind": "interimReport", "issuer": "Acme Industrial AB", "title": "Interim Report January to June 2026", "url": "https://acme.example/q2-2026.pdf", "published": "2026-07-18", "retrieved": "2026-10-01", "pages": null, "tier": "primary" }
  ],
  "gaps": []
}
```

Create `tests/fixtures/valid/holdco.facts.json`:

```json
{
  "schemaVersion": "1.0",
  "company": { "ticker": "HOLD", "exchange": "STO", "name": "Holdco Invest AB", "isin": null, "country": "SE" },
  "asOf": "2026-10-01",
  "currency": "SEK",
  "unit": "millions",
  "market": {
    "price": 98, "priceCurrency": "SEK", "asOf": "2026-10-01",
    "sharesOutstandingM": 280, "sharesDilutedM": null, "week52High": 120, "week52Low": 85,
    "sourceRefs": ["S2"]
  },
  "financials": {
    "fiscalYears": [
      { "fy": 2024, "endDate": "2024-12-31", "revenue": null, "ebit": null, "netIncome": 2100, "ebitda": null, "depreciationAmortization": null, "cogs": null, "grossProfit": null, "opex": -120, "interestExpense": -40, "taxExpense": null, "ocf": null, "capex": null, "fcf": null, "dividendsPaid": -560, "sharesBasicM": 280, "sharesDilutedM": null, "sourceRef": "S1" },
      { "fy": 2025, "endDate": "2025-12-31", "revenue": null, "ebit": null, "netIncome": 1800, "ebitda": null, "depreciationAmortization": null, "cogs": null, "grossProfit": null, "opex": -125, "interestExpense": -42, "taxExpense": null, "ocf": null, "capex": null, "fcf": null, "dividendsPaid": -600, "sharesBasicM": 280, "sharesDilutedM": null, "sourceRef": "S1" }
    ],
    "ltm": null,
    "quarters": null
  },
  "balanceSheet": {
    "asOf": "2025-12-31", "cashAndEquivalents": 900, "shortTermInvestments": null,
    "totalDebt": 1200, "shortTermDebt": null, "longTermDebt": 1200,
    "operatingLeaseLiabilities": null, "pensionObligations": null, "goodwill": null, "intangiblesExGoodwill": null,
    "sourceRef": "S1"
  },
  "costOfCapital": {
    "riskFreeRate": 0.025, "riskFreeBasis": "Swedish 10-year government bond", "erp": 0.055,
    "countryPremium": null, "betaCompany": 0.9, "betaSector": null,
    "taxRateEffective": 0.0, "taxRateStatutory": null, "pretaxCostOfDebt": 0.035,
    "equityWeight": 0.95, "debtWeight": 0.05, "weightsAsOf": "2026-10-01",
    "sourceRefs": ["S3"]
  },
  "historicalRanges": null,
  "peers": null,
  "estimates": null,
  "holdings": {
    "items": [
      { "name": "Listed Industrial AB", "fairValue": 18000, "basis": "listed", "sourceRef": "S1" },
      { "name": "Listed Bank AB", "fairValue": 9500, "basis": "listed", "sourceRef": "S1" },
      { "name": "Private Software Group", "fairValue": 4200, "basis": "unlisted", "sourceRef": "S1" }
    ],
    "parentNetDebt": 300,
    "lookThroughNav": 31400,
    "sourceRefs": ["S1"]
  },
  "fx": null,
  "sources": [
    { "id": "S1", "kind": "annualReport", "issuer": "Holdco Invest AB", "title": "Annual Report 2025", "url": "https://holdco.example/ar2025.pdf", "published": "2026-03-01", "retrieved": "2026-10-01", "pages": null, "tier": "primary" },
    { "id": "S2", "kind": "marketDataFeed", "issuer": "Nasdaq Stockholm", "title": "HOLD quote", "url": "https://quotes.example/HOLD", "published": null, "retrieved": "2026-10-01", "pages": null, "tier": "secondary" },
    { "id": "S3", "kind": "macroReference", "issuer": "Riksbanken", "title": "Government bond yields", "url": "https://riksbank.example/yields", "published": null, "retrieved": "2026-10-01", "pages": null, "tier": "primary" }
  ],
  "gaps": [
    { "field": "financials.fiscalYears.0.revenue", "reason": "an investment company reports no revenue" },
    { "field": "financials.ltm", "reason": "no trailing-twelve-month figures published" }
  ]
}
```

Create `tests/fixtures/valid/dual.facts.json`:

```json
{
  "schemaVersion": "1.0",
  "company": { "ticker": "DUAL", "exchange": "STO", "name": "Dual Listed Group", "isin": "FI0000000002", "country": "FI" },
  "asOf": "2026-10-01",
  "currency": "EUR",
  "unit": "thousands",
  "market": {
    "price": 150, "priceCurrency": "SEK", "asOf": "2026-10-01",
    "sharesOutstandingM": 50, "sharesDilutedM": 0, "week52High": null, "week52Low": null,
    "sourceRefs": ["S2"]
  },
  "financials": {
    "fiscalYears": [
      { "fy": 2025, "endDate": "2025-12-31", "revenue": 1200000, "ebit": 150000, "netIncome": 110000, "ebitda": 200000, "depreciationAmortization": 50000, "cogs": null, "grossProfit": null, "opex": null, "interestExpense": null, "taxExpense": null, "ocf": 180000, "capex": -60000, "fcf": 120000, "dividendsPaid": null, "sharesBasicM": 50, "sharesDilutedM": null, "sourceRef": "S1" },
      { "fy": 2024, "endDate": "2024-12-31", "revenue": 1100000, "ebit": 130000, "netIncome": 95000, "ebitda": 175000, "depreciationAmortization": 45000, "cogs": null, "grossProfit": null, "opex": null, "interestExpense": null, "taxExpense": null, "ocf": 160000, "capex": -55000, "fcf": 105000, "dividendsPaid": null, "sharesBasicM": 50, "sharesDilutedM": null, "sourceRef": "S1" }
    ],
    "ltm": null,
    "quarters": null
  },
  "balanceSheet": {
    "asOf": "2025-12-31", "cashAndEquivalents": 300000, "shortTermInvestments": null,
    "totalDebt": 500000, "shortTermDebt": null, "longTermDebt": null,
    "operatingLeaseLiabilities": 80000, "pensionObligations": null, "goodwill": null, "intangiblesExGoodwill": null,
    "sourceRef": "S1"
  },
  "costOfCapital": {
    "riskFreeRate": 0.03, "riskFreeBasis": "German 10-year Bund", "erp": 0.05,
    "countryPremium": 0.005, "betaCompany": 1.2, "betaSector": 1.0,
    "taxRateEffective": 0.2, "taxRateStatutory": 0.2, "pretaxCostOfDebt": 0.045,
    "equityWeight": 0.8, "debtWeight": 0.2, "weightsAsOf": "2026-10-01",
    "sourceRefs": ["S3"]
  },
  "historicalRanges": null,
  "peers": null,
  "estimates": null,
  "holdings": null,
  "fx": {
    "spotRates": [
      { "pair": "SEKEUR", "rate": 0.088, "asOf": "2026-10-01", "sourceRef": "S2" }
    ],
    "exposures": [
      { "currency": "EUR", "revenueShare": 0.6, "costShare": 0.7 },
      { "currency": "USD", "revenueShare": 0.4, "costShare": null }
    ]
  },
  "sources": [
    { "id": "S1", "kind": "annualReport", "issuer": "Dual Listed Group", "title": "Annual Report 2025", "url": "https://dual.example/ar2025.pdf", "published": "2026-02-20", "retrieved": "2026-10-01", "pages": null, "tier": "primary" },
    { "id": "S2", "kind": "marketDataFeed", "issuer": "Nasdaq Stockholm", "title": "DUAL quote and SEKEUR", "url": "https://quotes.example/DUAL", "published": null, "retrieved": "2026-10-01", "pages": null, "tier": "secondary" },
    { "id": "S3", "kind": "macroReference", "issuer": "Bundesbank", "title": "Bund yields", "url": "https://bundesbank.example/yields", "published": null, "retrieved": "2026-10-01", "pages": null, "tier": "primary" }
  ],
  "gaps": []
}
```

Create `tests/fixtures/valid/acme-dcf.case.json`:

```json
{
  "schemaVersion": "1.0",
  "ticker": "ACME",
  "factsAsOf": "2026-10-01",
  "classification": "garp",
  "theses": ["ai-disruption-overreaction", "eu-digital-sovereignty"],
  "method": {
    "kind": "dcf",
    "revenueGrowthPath": [0.07, 0.07, 0.06, 0.06, 0.05, 0.05, 0.04, 0.04, 0.03, 0.03],
    "ebitMarginPath": [0.12, 0.12, 0.125, 0.125, 0.13, 0.13, 0.13, 0.13, 0.13, 0.13],
    "capexPctRevenuePath": [0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04],
    "daPctRevenuePath": [0.033, 0.033, 0.033, 0.033, 0.033, 0.033, 0.033, 0.033, 0.033, 0.033],
    "workingCapitalPctRevenue": 0.1,
    "terminal": { "kind": "perpetuityGrowth", "growth": 0.02, "basis": "long-run nominal GDP growth in the Nordics" },
    "rationale": "A niche industrial with pricing power and a decade of margin stability. Growth fades to GDP.",
    "sourceRefs": ["S1", "S2"]
  },
  "overrides": { "beta": null, "wacc": null, "rationale": null },
  "sensitivity": null
}
```

Create `tests/fixtures/valid/acme-normalised.case.json`:

```json
{
  "schemaVersion": "1.0",
  "ticker": "ACME",
  "factsAsOf": "2026-10-01",
  "classification": "valueCyclical",
  "theses": [],
  "method": {
    "kind": "normalisedEarnings",
    "revenueBase": { "kind": "averageFy", "years": 3 },
    "ebitMargin": { "bear": 0.09, "base": 0.12, "bull": 0.14 },
    "evEbitMultiple": { "bear": 10, "base": 13, "bull": 16 },
    "multipleCeiling": 18,
    "rationale": "Treating Acme as mid-cycle: three-year average revenue, margins bracketing the last cycle.",
    "sourceRefs": ["S1"]
  },
  "overrides": { "beta": null, "wacc": null, "rationale": null },
  "sensitivity": null
}
```

Create `tests/fixtures/valid/holdco-nav.case.json`:

```json
{
  "schemaVersion": "1.0",
  "ticker": "HOLD",
  "factsAsOf": null,
  "classification": "holdingCompany",
  "theses": ["nordic-holdco-discount-compression"],
  "method": {
    "kind": "nav",
    "warrantedDiscount": 0.2,
    "rationale": "Two listed holdings at market, one private at the latest funding round, parent net debt small.",
    "sourceRefs": ["S1"]
  },
  "overrides": { "beta": null, "wacc": null, "rationale": null },
  "sensitivity": null
}
```

- [ ] **Step 5: Run the check**

Run: `npm run check`
Expected: PASS, six fixtures valid

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures src/test-fixtures.ts src/test-fixtures.test.ts
git commit -m "test(fixtures): add hand-written facts and case documents and a loader"
```

---

### Task 7: JSON Schema emission — Claude

**Files:**
- Create: `src/input/schema.ts`
- Create: `src/input/schema.test.ts`
- Modify: `package.json` (dev dependencies)

**Interfaces:**
- Consumes: `FactsSchema`, `CaseSchema`.
- Produces: `emitJsonSchema(doc: "facts" | "case"): Record<string, unknown>`. The list of rules the schema cannot carry lives in `schema.test.ts`, with a proof per rule.

`z.toJSONSchema(schema, { io: "input", unrepresentable: "throw" })` emits the input side, so branded `.transform()`s become their string shape and discriminated unions become `oneOf`. It drops `.superRefine()` silently. The test makes that list explicit: for each rule, a mutation that Zod rejects but the emitted schema accepts. If a rule ever becomes representable, the `ajv` half of its test fails and the list has to shrink. The list lives in the test file, not beside the emitter: `schema.ts` is imported by the CLI and must not pull in `test-fixtures.ts` and its `node:fs`.

- [ ] **Step 1: Install the test-only validator**

```bash
npm install --save-dev ajv@^8.20.0 ajv-formats@^3.0.1
```

- [ ] **Step 2: Write the failing test**

Create `src/input/schema.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { loadFixture, mutate, VALID_FIXTURES } from "../test-fixtures.ts";
import { CaseSchema } from "./case.ts";
import { FactsSchema } from "./facts.ts";
import { emitJsonSchema } from "./schema.ts";

function validator(doc: "facts" | "case") {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  return ajv.compile(emitJsonSchema(doc));
}

/**
 * The value rules the emitted JSON Schema cannot carry. Each has a mutation
 * that Zod rejects and ajv accepts; if a rule ever becomes representable, the
 * ajv half fails and this list has to shrink. The skills spec restates each in
 * English for the AI role that fills the document in.
 */
const UNREPRESENTABLE_RULES: readonly {
  doc: "facts" | "case";
  rule: string;
  mutation: (valid: unknown) => unknown;
}[] = [
  { doc: "facts", rule: "every sourceRef resolves to a sources[].id", mutation: (v) => mutate(v, "market.sourceRefs.0", "S99") },
  { doc: "facts", rule: "fiscalYears[].fy values are distinct", mutation: (v) => mutate(v, "financials.fiscalYears.1.fy", 2021) },
  { doc: "facts", rule: "equityWeight + debtWeight is 1", mutation: (v) => mutate(v, "costOfCapital.debtWeight", 0.3) },
  { doc: "facts", rule: "a priceCurrency differing from currency needs a spot rate", mutation: (v) => mutate(v, "market.priceCurrency", "USD") },
  { doc: "case", rule: "bear <= base <= bull", mutation: (v) => mutate(v, "method.ebitMargin.bear", 0.5) },
  { doc: "case", rule: "no scenario multiple above multipleCeiling", mutation: (v) => mutate(v, "method.evEbitMultiple.bull", 40) },
  { doc: "case", rule: "an override needs a rationale", mutation: (v) => mutate(v, "overrides", { beta: 1.3, wacc: null, rationale: null }) },
  { doc: "case", rule: "overrides apply to dcf only", mutation: (v) => mutate(v, "overrides", { beta: 1.3, wacc: null, rationale: "x" }) },
  { doc: "case", rule: "sensitivity applies to dcf only", mutation: (v) => mutate(v, "sensitivity", { waccSteps: [0], terminalGrowthSteps: [0] }) },
];

test("every valid fixture validates against the emitted schema", () => {
  const facts = validator("facts");
  for (const name of VALID_FIXTURES.facts) {
    assert.ok(facts(loadFixture(name)), `${name}: ${JSON.stringify(facts.errors?.slice(0, 2))}`);
  }
  const c = validator("case");
  for (const name of VALID_FIXTURES.cases) {
    assert.ok(c(loadFixture(name)), `${name}: ${JSON.stringify(c.errors?.slice(0, 2))}`);
  }
});

test("the emitted schema rejects a misspelled key, like the Zod schema does", () => {
  const facts = validator("facts");
  const bad = mutate(loadFixture("acme.facts"), "market.priceCurency", "SEK");
  assert.equal(facts(bad), false);
});

for (const { doc, rule, mutation } of UNREPRESENTABLE_RULES) {
  test(`${doc}: ${rule} is enforced by Zod and not by the emitted schema`, () => {
    const base = loadFixture(doc === "facts" ? "acme.facts" : "acme-normalised.case");
    const bad = mutation(base);
    const zod = doc === "facts" ? FactsSchema : CaseSchema;
    assert.equal(zod.safeParse(bad).success, false, "Zod must reject it");
    assert.equal(validator(doc)(bad), true, "the JSON Schema cannot express it, so it passes");
  });
}

test("sensitivity steps including 0 is a dcf-only rule the schema cannot carry either", () => {
  const bad = mutate(loadFixture("acme-dcf.case"), "sensitivity", { waccSteps: [-0.01, 0.01], terminalGrowthSteps: [0] });
  assert.equal(CaseSchema.safeParse(bad).success, false);
  assert.equal(validator("case")(bad), true);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module './schema.ts'`

- [ ] **Step 4: Write the emitter**

Create `src/input/schema.ts`:

```ts
/**
 * The JSON Schema the researcher and analyst skills fill in, generated from
 * the Zod schemas so there is one source of truth. The input side is emitted:
 * branded transforms become their string shape, discriminated unions become
 * oneOf, and superRefine predicates are dropped. schema.test.ts lists the
 * dropped ones with a proof for each.
 */

import { z } from "zod";
import { CaseSchema } from "./case.ts";
import { FactsSchema } from "./facts.ts";

export function emitJsonSchema(doc: "facts" | "case"): Record<string, unknown> {
  const schema = doc === "facts" ? FactsSchema : CaseSchema;
  return z.toJSONSchema(schema, { io: "input", unrepresentable: "throw" });
}
```

- [ ] **Step 5: Run the check**

Run: `npm run check`
Expected: PASS. If `ajv/dist/2020.js` does not resolve under `nodenext`, use `import Ajv2020 from "ajv/dist/2020.js"` (default export) and record which form worked in the ledger.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/input/schema.ts src/input/schema.test.ts
git commit -m "feat(input): emit the JSON Schema and list the rules it cannot carry"
```

---

### Task 8: Errors, resolutions and warnings — the user

**Files:**
- Create: `src/input/errors.ts`
- Create: `src/input/errors.test.ts`

**Interfaces:**
- Consumes: `Unit` from `../domain/types.ts`.
- Produces: `DecodeError`, `decodeError()`, `Resolution`, `Warning`, `DecodeResult<T>`, `decoded()`, `failed()`, `zodIssuesToErrors(file, issues)`.

`Resolution` is the audit trail as data. Its members come from the spec's table; `dcfBasePeriodFromFiscalYear` and `reverseDcfUnavailable` are included now so plan 2's selectors do not reopen the file. `Exclude<Unit, "millions">` on `unitRescaled` is the derivation-over-duplication move: a fourth unit added to `UNIT_VALUES` breaks this type until someone decides what it rescales by.

- [ ] **Step 1: Write the failing test**

Create `src/input/errors.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { decoded, failed, zodIssuesToErrors } from "./errors.ts";

test("decoded and failed build the two arms", () => {
  assert.deepEqual(decoded(1), { success: true, data: 1 });
  const e = { file: "facts", layer: "semantic", rule: "semantic.x", path: "a.b", message: "m" } as const;
  assert.deepEqual(failed([e]), { success: false, error: [e] });
});

test("zod issues become schema-layer errors with dotted paths and the file name", () => {
  const S = z.strictObject({ a: z.strictObject({ b: z.array(z.number()) }) });
  const result = S.safeParse({ a: { b: [1, "x"] } });
  assert.equal(result.success, false);
  const errors = zodIssuesToErrors("case", result.error?.issues ?? []);
  assert.equal(errors.length, 1);
  assert.deepEqual(errors[0], {
    file: "case",
    layer: "schema",
    rule: "schema.violation",
    path: "a.b.1",
    message: errors[0]?.message,
  });
  assert.ok(errors[0]?.message.length > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module './errors.ts'`

- [ ] **Step 3: Write the types and helpers**

Create `src/input/errors.ts`. Reference:

```ts
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

/** Why a fallback fired. Formatted only when an AI reads it, never here. */
export type Resolution =
  | { readonly kind: "betaFromSector"; readonly value: number }
  | { readonly kind: "betaOverridden"; readonly from: number; readonly to: number }
  | { readonly kind: "waccOverridden"; readonly to: number }
  | { readonly kind: "sharesFromOutstanding"; readonly value: number }
  | { readonly kind: "taxRateFromEffective"; readonly value: number }
  | { readonly kind: "unitRescaled"; readonly from: Exclude<Unit, "millions">; readonly divisor: number }
  | { readonly kind: "priceConvertedToReporting"; readonly pair: string; readonly rate: number; readonly inverted: boolean }
  | { readonly kind: "netDebtDerived"; readonly totalDebt: number; readonly cash: number; readonly shortTermInvestments: number }
  | { readonly kind: "revenueBaseFromLtm" }
  | { readonly kind: "revenueBaseAveraged"; readonly fromFy: number; readonly toFy: number }
  | { readonly kind: "dcfBasePeriodFromFiscalYear"; readonly fy: number }
  | { readonly kind: "reverseDcfUnavailable"; readonly reason: string };

/** Advisory, never fatal. */
export type Warning = {
  readonly rule: "casePredatesFacts" | "rfBasisMismatch" | "ltmOlderThanFiscalYear";
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
```

If `z.core.$ZodIssue` is not the exported name in 4.6.5, `z.ZodIssue` is the fallback; whichever compiles is right, and the ledger records it.

- [ ] **Step 4: Run the check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/input/errors.ts src/input/errors.test.ts
git commit -m "feat(input): model decode errors, resolutions and warnings as data"
```

---

### Task 9: The domain model — the user

**Files:**
- Create: `src/domain/company.ts`
- Create: `src/domain/financials.ts`
- Create: `src/domain/valuation.ts`
- Create: `src/domain/valuation.test.ts`

**Interfaces:**
- Consumes: `NonEmpty`, `Currency`, `IsoDate`, `Basis` from `./types.ts`.
- Produces: everything the decoders build and plan 2's selectors read. Exact names below.

This task is types plus a test that proves the impossible states are impossible. `@ts-expect-error` is the instrument: a line that fails to compile is the assertion, and if it ever compiles, `tsc` reports the unused directive and the build breaks.

- [ ] **Step 1: Write the failing test**

Create `src/domain/valuation.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Valuation } from "./valuation.ts";

const period = {
  revenue: 1000,
  ebit: 120,
  netIncome: 90,
  ebitda: 150,
  depreciationAmortization: 30,
  ocf: 140,
  capex: -40,
  fcf: 100,
};

test("a nav valuation carries holdings and nothing operating", () => {
  const nav: Valuation = {
    method: "nav",
    holdings: [{ name: "Investor AB", fairValue: 1200, basis: "listed" }],
    parentNetDebt: -300,
    lookThroughNav: 1500,
    assumptions: { warrantedDiscount: 0.25 },
  };
  assert.equal(nav.method, "nav");
  // @ts-expect-error a nav valuation has no financials
  assert.equal(nav.financials, undefined);
});

test("a dcf valuation cannot carry cyclical assumptions", () => {
  const bad = {
    method: "dcf",
    // @ts-expect-error ebitMargin is a cyclical assumption
    assumptions: { ebitMargin: { bear: 1, base: 2, bull: 3 } },
  } satisfies Partial<Valuation>;
  assert.ok(bad);
});

test("a period in a valuation has non-null revenue and ebit", () => {
  const cyclical: Valuation = {
    method: "normalisedEarnings",
    financials: { ltm: null, fiscalYears: [{ ...period, fy: 2025, endDate: "2025-12-31" as never }] },
    revenueBase: { kind: "averageFy", window: [{ ...period, fy: 2025, endDate: "2025-12-31" as never }] },
    assumptions: {
      ebitMargin: { bear: 0.05, base: 0.08, bull: 0.11 },
      evEbitMultiple: { bear: 6, base: 8, bull: 10 },
      multipleCeiling: null,
    },
  };
  assert.equal(cyclical.financials.fiscalYears[0].revenue, 1000);
  const nullRevenue: Valuation = {
    ...cyclical,
    // @ts-expect-error revenue cannot be null on a valuation's period
    financials: { ltm: null, fiscalYears: [{ ...period, revenue: null, fy: 2025, endDate: "x" as never }] },
  };
  assert.ok(nullRevenue);
});

test("an averageFy window cannot be empty", () => {
  // @ts-expect-error NonEmpty requires at least one element
  const base: Extract<Valuation, { method: "normalisedEarnings" }>["revenueBase"] = { kind: "averageFy", window: [] };
  assert.ok(base);
});
```

The `as never` on the two date literals is a test-only shortcut past the `IsoDate` brand; a parser is the only production path to one.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module './valuation.ts'`

- [ ] **Step 3: Write the domain types**

Create `src/domain/financials.ts`. Reference:

```ts
import type { IsoDate, NonEmpty } from "./types.ts";

/** As reported: every figure nullable, because a holding company has no revenue. */
export type ReportedPeriod = {
  readonly revenue: number | null;
  readonly ebit: number | null;
  readonly netIncome: number | null;
  readonly ebitda: number | null;
  readonly depreciationAmortization: number | null;
  readonly ocf: number | null;
  readonly capex: number | null;
  readonly fcf: number | null;
};

export type ReportedFiscalYear = ReportedPeriod & {
  readonly fy: number;
  readonly endDate: IsoDate;
};

/** The LTM row keeps its end date so the staleness warning can compare it. */
export type ReportedLtm = ReportedPeriod & { readonly endDate: IsoDate };

export type Financials = {
  readonly ltm: ReportedLtm | null;
  readonly fiscalYears: NonEmpty<ReportedFiscalYear>; // sorted oldest to newest
};

/** A period the math can use: revenue and EBIT are present by construction. */
export type Period = Omit<ReportedPeriod, "revenue" | "ebit"> & {
  readonly revenue: number;
  readonly ebit: number;
};

export type FiscalYear = Period & {
  readonly fy: number;
  readonly endDate: IsoDate;
};

export type OperatingFinancials = {
  readonly ltm: Period | null;
  readonly fiscalYears: NonEmpty<FiscalYear>;
};
```

Create `src/domain/valuation.ts`. Reference:

```ts
import type { CostOfCapital } from "./company.ts";
import type { FiscalYear, OperatingFinancials, Period } from "./financials.ts";
import type { Basis, NonEmpty } from "./types.ts";

export type ScenarioTriple = {
  readonly bear: number;
  readonly base: number;
  readonly bull: number;
};

export type Terminal =
  | { readonly kind: "perpetuityGrowth"; readonly growth: number }
  | { readonly kind: "exitMultiple"; readonly multiple: number; readonly on: "evEbit" | "evEbitda" | "evFcff" };

export type DcfAssumptions = {
  readonly revenueGrowthPath: readonly number[];
  readonly ebitMarginPath: readonly number[];
  readonly capexPctRevenuePath: readonly number[];
  readonly daPctRevenuePath: readonly number[];
  readonly workingCapitalPctRevenue: number;
  readonly terminal: Terminal;
};

export type CyclicalAssumptions = {
  readonly ebitMargin: ScenarioTriple;
  readonly evEbitMultiple: ScenarioTriple;
  readonly multipleCeiling: number | null;
};

export type NavAssumptions = { readonly warrantedDiscount: number };

export type SensitivityAxes = {
  readonly waccSteps: NonEmpty<number>;
  readonly terminalGrowthSteps: NonEmpty<number>;
};

/** Carries the evidence that the stated policy was satisfiable. */
export type CyclicalRevenueBase =
  | { readonly kind: "ltm"; readonly period: Period }
  | { readonly kind: "averageFy"; readonly window: NonEmpty<FiscalYear> };

export type Holding = {
  readonly name: string;
  readonly fairValue: number;
  readonly basis: Basis;
};

export type Valuation =
  | {
      readonly method: "dcf";
      readonly financials: OperatingFinancials;
      readonly costOfCapital: CostOfCapital;
      readonly waccOverride: number | null;
      readonly assumptions: DcfAssumptions;
      readonly sensitivity: SensitivityAxes;
    }
  | {
      readonly method: "normalisedEarnings";
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
    };
```

Create `src/domain/company.ts`. Reference:

```ts
import type { Financials } from "./financials.ts";
import type { Basis, Currency, IsoDate } from "./types.ts";

export type Identity = {
  readonly ticker: string;
  readonly exchange: string;
  readonly name: string;
  readonly isin: string | null;
  readonly country: string;
};

/** Price in reporting currency; shares resolved; per-share figures unscaled. */
export type Market = {
  readonly price: number;
  readonly shares: number;
  readonly week52High: number | null;
  readonly week52Low: number | null;
  readonly asOf: IsoDate;
};

export type BalanceSheet = {
  readonly asOf: IsoDate;
  readonly cashAndEquivalents: number;
  readonly shortTermInvestments: number | null;
  readonly totalDebt: number;
  readonly shortTermDebt: number | null;
  readonly longTermDebt: number | null;
  readonly goodwill: number | null;
  readonly intangiblesExGoodwill: number | null;
};

/** Claims on the enterprise reported beside net debt, not folded into it. */
export type OtherClaims = {
  readonly operatingLeaseLiabilities: number | null;
  readonly pensionObligations: number | null;
};

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

export type RangeBand = {
  readonly y5Low: number | null;
  readonly y5High: number | null;
  readonly y10Low: number | null;
  readonly y10High: number | null;
};

export type HistoricalRanges = {
  readonly sharePrice: RangeBand;
  readonly peTrailing: RangeBand;
  readonly evEbit: RangeBand;
  readonly evEbitda: RangeBand;
  readonly priceBook: RangeBand;
};

export type Peer = {
  readonly name: string;
  readonly ticker: string | null;
  readonly peTrailing: number | null;
  readonly evEbit: number | null;
  readonly evEbitda: number | null;
  readonly evRevenue: number | null;
};

export type Estimate = {
  readonly fy: number;
  readonly revenue: number | null;
  readonly ebit: number | null;
  readonly eps: number | null;
};

export type ReportedHolding = {
  readonly name: string;
  readonly fairValue: number | null;
  readonly basis: Basis;
};

export type Holdings = {
  readonly items: readonly ReportedHolding[];
  readonly parentNetDebt: number;
  readonly lookThroughNav: number | null;
};

export type SpotRate = { readonly pair: string; readonly rate: number; readonly asOf: IsoDate };
export type Exposure = {
  readonly currency: Currency;
  readonly revenueShare: number | null;
  readonly costShare: number | null;
};
export type Fx = { readonly spotRates: readonly SpotRate[]; readonly exposures: readonly Exposure[] };

/** Everything inside is reporting currency, millions, by construction. */
export type Company = {
  readonly identity: Identity;
  readonly currency: Currency;
  readonly asOf: IsoDate;
  readonly market: Market;
  readonly financials: Financials;
  readonly balanceSheet: BalanceSheet;
  readonly netDebt: number;
  readonly otherClaims: OtherClaims;
  readonly costOfCapital: CostOfCapital;
  readonly historicalRanges: HistoricalRanges | null;
  readonly peers: readonly Peer[];
  readonly estimates: readonly Estimate[];
  readonly holdings: Holdings | null;
  readonly fx: Fx | null;
};
```

- [ ] **Step 4: Run the check**

Run: `npm run check`
Expected: PASS, with every `@ts-expect-error` suppressing a real error

- [ ] **Step 5: Commit**

```bash
git add src/domain/
git commit -m "feat(domain): model the company and the valuation union"
```

---

### Task 10: Decode facts into a Company — the user

**Files:**
- Create: `src/input/decode-company.ts`
- Create: `src/input/decode-company.test.ts`

**Interfaces:**
- Consumes: `Facts` from `./facts.ts`; `Company` and its blocks from `../domain/company.ts`; `Financials`, `ReportedFiscalYear` from `../domain/financials.ts`; `isNonEmpty` from `../domain/types.ts`; `DecodeResult`, `decoded`, `failed`, `decodeError`, `Resolution` from `./errors.ts`.
- Produces: `decodeCompany(facts: Facts): DecodeResult<{ company: Company; resolutions: Resolution[] }>`.

This task owns Review Focus 1 (sort), 2 (inverted pair), 3 (zero shares) and 4 (rescale scope). Six behaviours:

- **Unit.** Divide every aggregate monetary figure by 1,000 for `thousands` or 1,000,000 for `ones`: every fiscal-year, LTM and quarter figure except the share counts; the balance sheet; holdings fair values, `parentNetDebt`, `lookThroughNav`. Never `price`, the 52-week range, or `eps`. Record `unitRescaled` once.
- **Price.** When `priceCurrency !== currency`, find the spot rate for `priceCurrency + currency` (multiply) or `currency + priceCurrency` (divide), convert, record `priceConvertedToReporting` with `inverted`. The wire rule guarantees one exists.
- **Shares.** `sharesDilutedM` when it is a number (including `0`), else `sharesOutstandingM` with `sharesFromOutstanding`. Explicit `=== null`, never `||`.
- **Net debt.** `totalDebt - cashAndEquivalents - (shortTermInvestments ?? 0)`, record `netDebtDerived` always. Leases and pensions go to `otherClaims`.
- **Cost of capital.** Beta is `betaCompany` when non-null, else `betaSector` with `betaFromSector`, else `semantic.noBeta` at path `costOfCapital.betaCompany`. `taxRateForDiscounting` is `taxRateStatutory` when non-null, else `taxRateEffective` with `taxRateFromEffective`. `countryPremium ?? 0`.
- **Fiscal years.** Sorted ascending by `fy`; the schema guarantees non-empty and distinct, `isNonEmpty` narrows it for the type.

- [ ] **Step 1: Write the failing test**

Create `src/input/decode-company.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFixture, mutate } from "../test-fixtures.ts";
import { decodeCompany } from "./decode-company.ts";
import { FactsSchema } from "./facts.ts";

function parse(doc: unknown) {
  const result = FactsSchema.safeParse(doc);
  assert.ok(result.success, JSON.stringify(result.error?.issues.slice(0, 3)));
  return result.data;
}

const acme = () => loadFixture("acme.facts");
const dual = () => loadFixture("dual.facts");

test("acme decodes with the sector beta and derived net debt recorded", () => {
  const result = decodeCompany(parse(acme()));
  assert.ok(result.success);
  const { company, resolutions } = result.data;
  assert.equal(company.costOfCapital.beta, 1.1);
  assert.equal(company.netDebt, 4100 - 1900 - 200);
  assert.deepEqual(company.otherClaims, { operatingLeaseLiabilities: 700, pensionObligations: 450 });
  assert.deepEqual(
    resolutions.map((r) => r.kind).sort(),
    ["betaFromSector", "netDebtDerived"],
  );
});

test("diluted shares win over outstanding, and zero is a share count", () => {
  const diluted = decodeCompany(parse(acme()));
  assert.equal(diluted.data?.company.market.shares, 115);

  const zero = decodeCompany(parse(dual()));
  assert.ok(zero.success);
  assert.equal(zero.data.company.market.shares, 0, "sharesDilutedM: 0 is used, not treated as missing");
  assert.ok(!zero.data.resolutions.some((r) => r.kind === "sharesFromOutstanding"));
});

test("a null diluted count falls back and records why", () => {
  const result = decodeCompany(parse(mutate(acme(), "market.sharesDilutedM", null)));
  assert.equal(result.data?.company.market.shares, 113.2);
  assert.ok(result.data?.resolutions.some((r) => r.kind === "sharesFromOutstanding" && r.value === 113.2));
});

test("fiscal years are sorted ascending regardless of file order", () => {
  const result = decodeCompany(parse(dual()));
  assert.deepEqual(result.data?.company.financials.fiscalYears.map((y) => y.fy), [2024, 2025]);
});

test("thousands are rescaled on every aggregate and no per-share figure", () => {
  const result = decodeCompany(parse(dual()));
  assert.ok(result.success);
  const { company, resolutions } = result.data;
  assert.equal(company.financials.fiscalYears[0].revenue, 1100);
  assert.equal(company.balanceSheet.totalDebt, 500);
  assert.equal(company.otherClaims.operatingLeaseLiabilities, 80);
  assert.equal(company.financials.fiscalYears[0].fy, 2024, "fy is not a monetary figure");
  assert.ok(resolutions.some((r) => r.kind === "unitRescaled" && r.from === "thousands" && r.divisor === 1000));
});

test("ones rescale holdings too, and leave price alone", () => {
  const holdco = mutate(
    mutate(loadFixture("holdco.facts"), "unit", "ones"),
    "holdings.items.0.fairValue",
    18_000_000_000,
  );
  const result = decodeCompany(parse(holdco));
  assert.ok(result.success);
  assert.equal(result.data.company.holdings?.items[0]?.fairValue, 18000);
  assert.equal(result.data.company.holdings?.parentNetDebt, 300 / 1_000_000);
  assert.equal(result.data.company.market.price, 98, "price is per share and never rescaled");
});

test("a price in another currency is converted using the pair in either direction", () => {
  const result = decodeCompany(parse(dual()));
  assert.ok(result.success);
  assert.ok(Math.abs(result.data.company.market.price - 150 * 0.088) < 1e-12);
  const conversion = result.data.resolutions.find((r) => r.kind === "priceConvertedToReporting");
  assert.deepEqual(conversion, {
    kind: "priceConvertedToReporting",
    pair: "SEKEUR",
    rate: 0.088,
    inverted: false,
  });

  const flipped = mutate(
    mutate(dual(), "fx.spotRates.0.pair", "EURSEK"),
    "fx.spotRates.0.rate",
    1 / 0.088,
  );
  const inverted = decodeCompany(parse(flipped));
  assert.ok(inverted.success);
  assert.ok(Math.abs(inverted.data.company.market.price - 150 * 0.088) < 1e-9);
  assert.equal(
    inverted.data.resolutions.find((r) => r.kind === "priceConvertedToReporting")?.inverted,
    true,
  );
});

test("a statutory tax rate wins; a null one falls back and records why", () => {
  const statutory = decodeCompany(parse(acme()));
  assert.equal(statutory.data?.company.costOfCapital.taxRateForDiscounting, 0.206);
  assert.equal(statutory.data?.company.costOfCapital.taxRateForCashFlows, 0.21);

  const effective = decodeCompany(parse(mutate(acme(), "costOfCapital.taxRateStatutory", null)));
  assert.equal(effective.data?.company.costOfCapital.taxRateForDiscounting, 0.21);
  assert.ok(effective.data?.resolutions.some((r) => r.kind === "taxRateFromEffective"));
});

test("both betas null is a decode error naming the path", () => {
  const result = decodeCompany(parse(mutate(acme(), "costOfCapital.betaSector", null)));
  assert.equal(result.success, false);
  assert.deepEqual(result.error?.[0], {
    file: "facts",
    layer: "semantic",
    rule: "semantic.noBeta",
    path: "costOfCapital.betaCompany",
    message: result.error?.[0]?.message,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module './decode-company.ts'`

- [ ] **Step 3: Write the decoder**

Create `src/input/decode-company.ts`. Reference for the shape; the six behaviours above are the contract:

```ts
import type { Company, CostOfCapital, Market } from "../domain/company.ts";
import type { Financials, ReportedFiscalYear, ReportedPeriod } from "../domain/financials.ts";
import { isNonEmpty, type Unit } from "../domain/types.ts";
import { decoded, decodeError, failed, type DecodeResult, type Resolution } from "./errors.ts";
import type { Facts } from "./facts.ts";

const DIVISOR: Record<Exclude<Unit, "millions">, number> = { thousands: 1_000, ones: 1_000_000 };

function scaleBy(divisor: number) {
  return (value: number | null): number | null => (value === null ? null : value / divisor);
}

function toReportedPeriod(row: Facts["financials"]["ltm"] & object, scale: (v: number | null) => number | null): ReportedPeriod {
  return {
    revenue: scale(row.revenue),
    ebit: scale(row.ebit),
    netIncome: scale(row.netIncome),
    ebitda: scale(row.ebitda),
    depreciationAmortization: scale(row.depreciationAmortization),
    ocf: scale(row.ocf),
    capex: scale(row.capex),
    fcf: scale(row.fcf),
  };
}

function decodeFinancials(financials: Facts["financials"], scale: (v: number | null) => number | null): Financials {
  const years: ReportedFiscalYear[] = financials.fiscalYears
    .map((row) => ({ ...toReportedPeriod(row, scale), fy: row.fy, endDate: row.endDate }))
    .sort((a, b) => a.fy - b.fy);
  if (!isNonEmpty(years)) throw new Error("unreachable: the schema requires a fiscal year");
  const ltm = financials.ltm
    ? { ...toReportedPeriod(financials.ltm, scale), endDate: financials.ltm.endDate }
    : null;
  return { ltm, fiscalYears: years };
}

function decodeMarket(facts: Facts, resolutions: Resolution[]): Market {
  const { market } = facts;
  let price = market.price;
  if (market.priceCurrency !== facts.currency) {
    const direct = `${market.priceCurrency}${facts.currency}`;
    const inverse = `${facts.currency}${market.priceCurrency}`;
    const spot = facts.fx?.spotRates.find((s) => s.pair === direct || s.pair === inverse);
    if (spot === undefined) throw new Error("unreachable: the schema requires the pair");
    const inverted = spot.pair === inverse;
    price = inverted ? price / spot.rate : price * spot.rate;
    resolutions.push({ kind: "priceConvertedToReporting", pair: spot.pair, rate: spot.rate, inverted });
  }
  let shares = market.sharesDilutedM;
  if (shares === null) {
    shares = market.sharesOutstandingM;
    resolutions.push({ kind: "sharesFromOutstanding", value: shares });
  }
  return { price, shares, week52High: market.week52High, week52Low: market.week52Low, asOf: market.asOf };
}

function decodeCostOfCapital(
  raw: Facts["costOfCapital"],
  resolutions: Resolution[],
): DecodeResult<CostOfCapital> {
  let beta = raw.betaCompany;
  if (beta === null) {
    if (raw.betaSector === null) {
      return failed([
        decodeError("facts", "semantic.noBeta", "costOfCapital.betaCompany", "neither betaCompany nor betaSector is given"),
      ]);
    }
    beta = raw.betaSector;
    resolutions.push({ kind: "betaFromSector", value: beta });
  }
  let taxRateForDiscounting = raw.taxRateStatutory;
  if (taxRateForDiscounting === null) {
    taxRateForDiscounting = raw.taxRateEffective;
    resolutions.push({ kind: "taxRateFromEffective", value: taxRateForDiscounting });
  }
  return decoded({
    riskFree: raw.riskFreeRate,
    erp: raw.erp,
    beta,
    countryPremium: raw.countryPremium ?? 0,
    preTaxCostOfDebt: raw.pretaxCostOfDebt,
    equityWeight: raw.equityWeight,
    debtWeight: raw.debtWeight,
    taxRateForDiscounting,
    taxRateForCashFlows: raw.taxRateEffective,
  });
}

export function decodeCompany(facts: Facts): DecodeResult<{ company: Company; resolutions: Resolution[] }> {
  const resolutions: Resolution[] = [];
  const scale = facts.unit === "millions" ? (v: number | null) => v : scaleBy(DIVISOR[facts.unit]);
  if (facts.unit !== "millions") {
    resolutions.push({ kind: "unitRescaled", from: facts.unit, divisor: DIVISOR[facts.unit] });
  }
  const scaled = (v: number): number => scale(v) as number; // non-null in, non-null out

  const costOfCapital = decodeCostOfCapital(facts.costOfCapital, resolutions);
  if (!costOfCapital.success) return failed(costOfCapital.error);

  const bs = facts.balanceSheet;
  const shortTermInvestments = scale(bs.shortTermInvestments);
  const netDebt = scaled(bs.totalDebt) - scaled(bs.cashAndEquivalents) - (shortTermInvestments ?? 0);
  resolutions.push({
    kind: "netDebtDerived",
    totalDebt: scaled(bs.totalDebt),
    cash: scaled(bs.cashAndEquivalents),
    shortTermInvestments: shortTermInvestments ?? 0,
  });

  const company: Company = {
    identity: { ...facts.company },
    currency: facts.currency,
    asOf: facts.asOf,
    market: decodeMarket(facts, resolutions),
    financials: decodeFinancials(facts.financials, scale),
    balanceSheet: {
      asOf: bs.asOf,
      cashAndEquivalents: scaled(bs.cashAndEquivalents),
      shortTermInvestments,
      totalDebt: scaled(bs.totalDebt),
      shortTermDebt: scale(bs.shortTermDebt),
      longTermDebt: scale(bs.longTermDebt),
      goodwill: scale(bs.goodwill),
      intangiblesExGoodwill: scale(bs.intangiblesExGoodwill),
    },
    netDebt,
    otherClaims: {
      operatingLeaseLiabilities: scale(bs.operatingLeaseLiabilities),
      pensionObligations: scale(bs.pensionObligations),
    },
    costOfCapital: costOfCapital.data,
    historicalRanges: facts.historicalRanges
      ? (({ sourceRefs: _s, ...bands }) => bands)(facts.historicalRanges)
      : null,
    peers: (facts.peers ?? []).map(({ sourceRef: _s, ...peer }) => peer),
    estimates: (facts.estimates ?? []).map(({ sourceRef: _s, ...estimate }) => estimate),
    holdings: facts.holdings
      ? {
          items: facts.holdings.items.map((h) => ({ name: h.name, fairValue: scale(h.fairValue), basis: h.basis })),
          parentNetDebt: scaled(facts.holdings.parentNetDebt),
          lookThroughNav: scale(facts.holdings.lookThroughNav),
        }
      : null,
    fx: facts.fx
      ? {
          spotRates: facts.fx.spotRates.map(({ sourceRef: _s, ...spot }) => spot),
          exposures: facts.fx.exposures,
        }
      : null,
  };
  return decoded({ company, resolutions });
}
```

Two things to resist while writing it. `scaled` uses an `as number` because `scale` is typed over `number | null`; the cleaner move is two functions, `scaleNullable` and `scaleRequired`, which removes the cast and is what the global constraint asks for. And the two `throw new Error("unreachable")` lines are the sanctioned pattern from `exhaustive.ts` for invariants the schema already guarantees; they are not error handling.

- [ ] **Step 4: Run the check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/input/decode-company.ts src/input/decode-company.test.ts
git commit -m "feat(input): decode facts into a company, recording every fallback"
```

---

### Task 11: Decode the case into a Valuation — the user

**Files:**
- Create: `src/input/decode-valuation.ts`
- Create: `src/input/decode-valuation.test.ts`

**Interfaces:**
- Consumes: `Facts`, `collectSourceRefs` from `./facts.ts`; `Case`, `DEFAULT_SENSITIVITY_STEPS` from `./case.ts`; `Company` from `../domain/company.ts`; `Financials`, `OperatingFinancials`, `Period`, `FiscalYear` from `../domain/financials.ts`; `Valuation`, `CyclicalRevenueBase`, `Holding` from `../domain/valuation.ts`; `isNonEmpty` from `../domain/types.ts`; errors module.
- Produces: `decodeValuation(facts: Facts, investmentCase: Case, company: Company): DecodeResult<{ valuation: Valuation; resolutions: Resolution[] }>`.

This is where the cross-document rules become consequences of construction. Review Focus 5 is here. The rules, each an error with `file: "case"` unless noted:

- `semantic.tickerMismatch` at `ticker`.
- `semantic.sourceRef` at `method.sourceRefs.<i>` for each id not in `facts.sources`.
- `semantic.periodMissingFigure` at `financials.fiscalYears.<i>.revenue` or `.ebit` (or `financials.ltm.<figure>`), `file: "facts"`, for `dcf` and `normalisedEarnings`. Errors accumulate; report every missing figure, not the first.
- `semantic.revenueBaseUnsatisfiable` at `method.revenueBase`: `ltm` with `company.financials.ltm === null`; `averageFy(n)` with fewer than `n` fiscal years.
- `semantic.navRequiresHoldings` at `holdings` (null) or `holdings.items` (empty), `file: "facts"`.
- `semantic.holdingWithoutValue` at `holdings.items.<i>.fairValue`, `file: "facts"`, message naming the holding.

Resolutions: `betaOverridden`, `waccOverridden`, `revenueBaseFromLtm`, `revenueBaseAveraged`. `sensitivity: null` means `DEFAULT_SENSITIVITY_STEPS` on both axes.

- [ ] **Step 1: Write the failing test**

Create `src/input/decode-valuation.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFixture, mutate } from "../test-fixtures.ts";
import { CaseSchema } from "./case.ts";
import { decodeCompany } from "./decode-company.ts";
import { decodeValuation } from "./decode-valuation.ts";
import { FactsSchema } from "./facts.ts";

function run(factsDoc: unknown, caseDoc: unknown) {
  const facts = FactsSchema.safeParse(factsDoc);
  const c = CaseSchema.safeParse(caseDoc);
  assert.ok(facts.success, JSON.stringify(facts.error?.issues.slice(0, 3)));
  assert.ok(c.success, JSON.stringify(c.error?.issues.slice(0, 3)));
  const company = decodeCompany(facts.data);
  assert.ok(company.success);
  return decodeValuation(facts.data, c.data, company.data.company);
}

const acme = () => loadFixture("acme.facts");
const holdco = () => loadFixture("holdco.facts");

test("a dcf case decodes with the default sensitivity grid and no overrides", () => {
  const result = run(acme(), loadFixture("acme-dcf.case"));
  assert.ok(result.success, JSON.stringify(result.error));
  const { valuation, resolutions } = result.data;
  assert.equal(valuation.method, "dcf");
  if (valuation.method !== "dcf") return;
  assert.equal(valuation.financials.fiscalYears.length, 5);
  assert.equal(valuation.financials.ltm?.revenue, 11400);
  assert.deepEqual(valuation.sensitivity.waccSteps, [-0.01, -0.005, 0, 0.005, 0.01]);
  assert.equal(valuation.waccOverride, null);
  assert.equal(valuation.costOfCapital.beta, 1.1);
  assert.deepEqual(resolutions, []);
});

test("a beta override replaces the facts' beta on the dcf branch and is recorded", () => {
  const withOverride = mutate(
    loadFixture("acme-dcf.case"),
    "overrides",
    { beta: 1.3, wacc: null, rationale: "sector beta is stale" },
  );
  const result = run(acme(), withOverride);
  assert.ok(result.success);
  if (result.data.valuation.method !== "dcf") return assert.fail();
  assert.equal(result.data.valuation.costOfCapital.beta, 1.3);
  assert.deepEqual(result.data.resolutions, [{ kind: "betaOverridden", from: 1.1, to: 1.3 }]);
});

test("a case's own sensitivity grid replaces the default", () => {
  const custom = mutate(loadFixture("acme-dcf.case"), "sensitivity", {
    waccSteps: [-0.02, 0, 0.02],
    terminalGrowthSteps: [0, 0.005],
  });
  const result = run(acme(), custom);
  assert.ok(result.success);
  if (result.data.valuation.method !== "dcf") return assert.fail();
  assert.deepEqual(result.data.valuation.sensitivity, {
    waccSteps: [-0.02, 0, 0.02],
    terminalGrowthSteps: [0, 0.005],
  });
});

test("averageFy takes the most recent window and records it", () => {
  const result = run(acme(), loadFixture("acme-normalised.case"));
  assert.ok(result.success, JSON.stringify(result.error));
  if (result.data.valuation.method !== "normalisedEarnings") return assert.fail();
  const base = result.data.valuation.revenueBase;
  assert.equal(base.kind, "averageFy");
  if (base.kind !== "averageFy") return;
  assert.deepEqual(base.window.map((y) => y.fy), [2023, 2024, 2025]);
  assert.ok(result.data.resolutions.some((r) => r.kind === "revenueBaseAveraged" && r.fromFy === 2023 && r.toFy === 2025));
});

test("an ltm policy with no ltm row is unsatisfiable", () => {
  const ltmCase = mutate(loadFixture("acme-normalised.case"), "method.revenueBase", { kind: "ltm" });
  const result = run(mutate(acme(), "financials.ltm", null), ltmCase);
  assert.equal(result.success, false);
  assert.equal(result.error?.[0]?.rule, "semantic.revenueBaseUnsatisfiable");
  assert.equal(result.error?.[0]?.path, "method.revenueBase");
});

test("averageFy asking for more years than exist is unsatisfiable", () => {
  const six = mutate(loadFixture("acme-normalised.case"), "method.revenueBase", { kind: "averageFy", years: 6 });
  const result = run(acme(), six);
  assert.equal(result.success, false);
  assert.equal(result.error?.[0]?.rule, "semantic.revenueBaseUnsatisfiable");
});

test("a dcf case against a row with null revenue reports every missing figure", () => {
  const broken = mutate(mutate(acme(), "financials.fiscalYears.0.revenue", null), "financials.fiscalYears.2.ebit", null);
  const result = run(broken, loadFixture("acme-dcf.case"));
  assert.equal(result.success, false);
  assert.deepEqual(
    result.error?.map((e) => [e.rule, e.file, e.path]),
    [
      ["semantic.periodMissingFigure", "facts", "financials.fiscalYears.0.revenue"],
      ["semantic.periodMissingFigure", "facts", "financials.fiscalYears.2.ebit"],
    ],
  );
});

test("a nav case decodes into non-null holdings", () => {
  const result = run(holdco(), loadFixture("holdco-nav.case"));
  assert.ok(result.success, JSON.stringify(result.error));
  if (result.data.valuation.method !== "nav") return assert.fail();
  assert.equal(result.data.valuation.holdings.length, 3);
  assert.equal(result.data.valuation.parentNetDebt, 300);
});

test("a nav case against empty holdings fails at holdings.items, not on items[0]", () => {
  const result = run(mutate(holdco(), "holdings.items", []), loadFixture("holdco-nav.case"));
  assert.equal(result.success, false);
  assert.deepEqual([result.error?.[0]?.rule, result.error?.[0]?.path], ["semantic.navRequiresHoldings", "holdings.items"]);

  const none = run(mutate(holdco(), "holdings", null), loadFixture("holdco-nav.case"));
  assert.deepEqual([none.error?.[0]?.rule, none.error?.[0]?.path], ["semantic.navRequiresHoldings", "holdings"]);
});

test("a holding with a null fair value is rejected by name", () => {
  const result = run(mutate(holdco(), "holdings.items.2.fairValue", null), loadFixture("holdco-nav.case"));
  assert.equal(result.success, false);
  assert.equal(result.error?.[0]?.rule, "semantic.holdingWithoutValue");
  assert.equal(result.error?.[0]?.path, "holdings.items.2.fairValue");
  assert.ok(result.error?.[0]?.message.includes("Private Software Group"));
});

test("a ticker mismatch and an unresolvable case source ref are both reported", () => {
  const wrong = mutate(mutate(loadFixture("acme-dcf.case"), "ticker", "ACMX"), "method.sourceRefs.1", "S77");
  const result = run(acme(), wrong);
  assert.equal(result.success, false);
  assert.deepEqual(
    result.error?.map((e) => [e.rule, e.path]),
    [
      ["semantic.tickerMismatch", "ticker"],
      ["semantic.sourceRef", "method.sourceRefs.1"],
    ],
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module './decode-valuation.ts'`

- [ ] **Step 3: Write the decoder**

Create `src/input/decode-valuation.ts`. Reference for the structure:

```ts
import type { Company } from "../domain/company.ts";
import type { FiscalYear, OperatingFinancials, Period, ReportedPeriod } from "../domain/financials.ts";
import { isNonEmpty, type NonEmpty } from "../domain/types.ts";
import type { CyclicalRevenueBase, Holding, Valuation } from "../domain/valuation.ts";
import { assertNever } from "../exhaustive.ts";
import { type Case, DEFAULT_SENSITIVITY_STEPS } from "./case.ts";
import { type DecodeError, decoded, decodeError, failed, type DecodeResult, type Resolution } from "./errors.ts";
import type { Facts } from "./facts.ts";

function checkTicker(facts: Facts, c: Case): DecodeError[] {
  return c.ticker === facts.company.ticker
    ? []
    : [decodeError("case", "semantic.tickerMismatch", "ticker", `case is for ${c.ticker}, facts are for ${facts.company.ticker}`)];
}

function checkSourceRefs(facts: Facts, c: Case): DecodeError[] {
  const ids = new Set(facts.sources.map((s) => s.id));
  return c.method.sourceRefs.flatMap((id, i) =>
    ids.has(id) ? [] : [decodeError("case", "semantic.sourceRef", `method.sourceRefs.${i}`, `source ${id} is not in facts.sources`)],
  );
}

/** Narrows reported figures to a Period, or says which figure is missing. */
function toPeriod(period: ReportedPeriod, path: string): DecodeResult<Period> {
  const errors: DecodeError[] = [];
  if (period.revenue === null) errors.push(decodeError("facts", "semantic.periodMissingFigure", `${path}.revenue`, "revenue is required for this method"));
  if (period.ebit === null) errors.push(decodeError("facts", "semantic.periodMissingFigure", `${path}.ebit`, "ebit is required for this method"));
  if (errors.length > 0 || period.revenue === null || period.ebit === null) return failed(errors);
  return decoded({ ...period, revenue: period.revenue, ebit: period.ebit });
}

function toOperatingFinancials(company: Company): DecodeResult<OperatingFinancials> {
  const errors: DecodeError[] = [];
  const years: FiscalYear[] = [];
  company.financials.fiscalYears.forEach((year, i) => {
    const period = toPeriod(year, `financials.fiscalYears.${i}`);
    if (period.success) years.push({ ...period.data, fy: year.fy, endDate: year.endDate });
    else errors.push(...period.error);
  });
  let ltm: Period | null = null;
  if (company.financials.ltm !== null) {
    const period = toPeriod(company.financials.ltm, "financials.ltm");
    if (period.success) ltm = period.data;
    else errors.push(...period.error);
  }
  if (errors.length > 0) return failed(errors);
  if (!isNonEmpty(years)) throw new Error("unreachable: fiscalYears is NonEmpty");
  return decoded({ ltm, fiscalYears: years });
}

function resolveRevenueBase(
  policy: Extract<Case["method"], { kind: "normalisedEarnings" }>["revenueBase"],
  financials: OperatingFinancials,
  resolutions: Resolution[],
): DecodeResult<CyclicalRevenueBase> {
  switch (policy.kind) {
    case "ltm": {
      if (financials.ltm === null) {
        return failed([decodeError("case", "semantic.revenueBaseUnsatisfiable", "method.revenueBase", "policy is ltm but facts carry no ltm row")]);
      }
      resolutions.push({ kind: "revenueBaseFromLtm" });
      return decoded({ kind: "ltm", period: financials.ltm });
    }
    case "averageFy": {
      const window = financials.fiscalYears.slice(-policy.years);
      if (window.length < policy.years || !isNonEmpty(window)) {
        return failed([decodeError("case", "semantic.revenueBaseUnsatisfiable", "method.revenueBase", `policy asks for ${policy.years} fiscal years, facts carry ${financials.fiscalYears.length}`)]);
      }
      resolutions.push({ kind: "revenueBaseAveraged", fromFy: window[0].fy, toFy: window[window.length - 1]?.fy ?? window[0].fy });
      return decoded({ kind: "averageFy", window });
    }
    default:
      return assertNever(policy);
  }
}

function toHoldings(company: Company): DecodeResult<{ holdings: NonEmpty<Holding>; parentNetDebt: number; lookThroughNav: number | null }> {
  if (company.holdings === null) {
    return failed([decodeError("facts", "semantic.navRequiresHoldings", "holdings", "a nav case needs a holdings block")]);
  }
  if (!isNonEmpty(company.holdings.items)) {
    return failed([decodeError("facts", "semantic.navRequiresHoldings", "holdings.items", "a nav case needs at least one holding")]);
  }
  const errors: DecodeError[] = [];
  const holdings: Holding[] = [];
  company.holdings.items.forEach((h, i) => {
    if (h.fairValue === null) {
      errors.push(decodeError("facts", "semantic.holdingWithoutValue", `holdings.items.${i}.fairValue`, `holding "${h.name}" has no fair value`));
    } else {
      holdings.push({ name: h.name, fairValue: h.fairValue, basis: h.basis });
    }
  });
  if (errors.length > 0) return failed(errors);
  if (!isNonEmpty(holdings)) throw new Error("unreachable: items was NonEmpty and none failed");
  return decoded({ holdings, parentNetDebt: company.holdings.parentNetDebt, lookThroughNav: company.holdings.lookThroughNav });
}

export function decodeValuation(
  facts: Facts,
  investmentCase: Case,
  company: Company,
): DecodeResult<{ valuation: Valuation; resolutions: Resolution[] }> {
  const preface = [...checkTicker(facts, investmentCase), ...checkSourceRefs(facts, investmentCase)];
  if (preface.length > 0) return failed(preface);

  const resolutions: Resolution[] = [];
  const { method, overrides, sensitivity } = investmentCase;

  switch (method.kind) {
    case "dcf": {
      const financials = toOperatingFinancials(company);
      if (!financials.success) return failed(financials.error);
      let costOfCapital = company.costOfCapital;
      if (overrides.beta !== null) {
        resolutions.push({ kind: "betaOverridden", from: costOfCapital.beta, to: overrides.beta });
        costOfCapital = { ...costOfCapital, beta: overrides.beta };
      }
      if (overrides.wacc !== null) resolutions.push({ kind: "waccOverridden", to: overrides.wacc });
      const steps = (xs: readonly number[] | undefined): NonEmpty<number> => {
        const chosen = xs ?? DEFAULT_SENSITIVITY_STEPS;
        if (!isNonEmpty(chosen)) throw new Error("unreachable: the schema requires a step");
        return chosen;
      };
      return decoded({
        valuation: {
          method: "dcf",
          financials: financials.data,
          costOfCapital,
          waccOverride: overrides.wacc,
          assumptions: {
            revenueGrowthPath: method.revenueGrowthPath,
            ebitMarginPath: method.ebitMarginPath,
            capexPctRevenuePath: method.capexPctRevenuePath,
            daPctRevenuePath: method.daPctRevenuePath,
            workingCapitalPctRevenue: method.workingCapitalPctRevenue,
            terminal: method.terminal.kind === "perpetuityGrowth"
              ? { kind: "perpetuityGrowth", growth: method.terminal.growth }
              : { kind: "exitMultiple", multiple: method.terminal.multiple, on: method.terminal.on },
          },
          sensitivity: {
            waccSteps: steps(sensitivity?.waccSteps),
            terminalGrowthSteps: steps(sensitivity?.terminalGrowthSteps),
          },
        },
        resolutions,
      });
    }
    case "normalisedEarnings": {
      const financials = toOperatingFinancials(company);
      if (!financials.success) return failed(financials.error);
      const revenueBase = resolveRevenueBase(method.revenueBase, financials.data, resolutions);
      if (!revenueBase.success) return failed(revenueBase.error);
      return decoded({
        valuation: {
          method: "normalisedEarnings",
          financials: financials.data,
          revenueBase: revenueBase.data,
          assumptions: {
            ebitMargin: method.ebitMargin,
            evEbitMultiple: method.evEbitMultiple,
            multipleCeiling: method.multipleCeiling,
          },
        },
        resolutions,
      });
    }
    case "nav": {
      const holdings = toHoldings(company);
      if (!holdings.success) return failed(holdings.error);
      return decoded({
        valuation: { method: "nav", ...holdings.data, assumptions: { warrantedDiscount: method.warrantedDiscount } },
        resolutions,
      });
    }
    default:
      return assertNever(method);
  }
}
```

The terminal mapping is written out rather than spread so the wire's `basis` string, which is rationale, does not leak into the domain.

- [ ] **Step 4: Run the check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/input/decode-valuation.ts src/input/decode-valuation.test.ts
git commit -m "feat(input): decode the case into a valuation whose rules hold by construction"
```

---

### Task 12: Warnings and the top-level decoder — the user

**Files:**
- Create: `src/input/warnings.ts`
- Create: `src/input/warnings.test.ts`
- Create: `src/input/decode.ts`
- Create: `src/input/decode.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 4, 5, 8, 10, 11.
- Produces: `collectWarnings(facts: Facts, investmentCase: Case | null, company: Company): Warning[]`; `type Decoded`; `decode(facts: unknown, investmentCase?: unknown): DecodeResult<Decoded>`.

`decode` parses both documents with their schemas, mapping Zod issues through `zodIssuesToErrors`, then runs `decodeCompany`, then `decodeValuation` when a case was given, concatenating resolutions. Both documents are parsed before either is decoded, so a bad facts file and a bad case file are reported together.

The country hints for `rfBasisMismatch`, carried over from `semantic.py`:

```ts
const COUNTRY_HINTS: Record<string, readonly string[]> = {
  SEK: ["swed", "sverige", "riksbank"],
  NOK: ["norw", "norge", "norges bank"],
  DKK: ["dan", "denmark", "nationalbank"],
  EUR: ["euro", "bund", "german", "ecb", "french", "oat", "dutch", "finnish", "finland"],
  USD: ["us ", "u.s.", "treasury", "united states", "american"],
  GBP: ["uk ", "gilt", "british", "united kingdom", "bank of england"],
  CHF: ["swiss", "switzerland", "snb"],
  JPY: ["japan", "jgb"],
};
```

The warning fires when `currency` has an entry and `riskFreeBasis.toLowerCase()` contains none of its hints. A currency with no entry never warns.

- [ ] **Step 1: Write the failing tests**

Create `src/input/warnings.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFixture, mutate } from "../test-fixtures.ts";
import { decode } from "./decode.ts";

test("a clean pair produces no warnings", () => {
  const result = decode(loadFixture("acme.facts"), loadFixture("acme-dcf.case"));
  assert.ok(result.success, JSON.stringify(result.error));
  assert.deepEqual(result.data.warnings, []);
});

test("a case written against older facts warns at factsAsOf", () => {
  const stale = mutate(loadFixture("acme-dcf.case"), "factsAsOf", "2026-06-01");
  const result = decode(loadFixture("acme.facts"), stale);
  assert.ok(result.success);
  assert.deepEqual(result.data.warnings.map((w) => [w.rule, w.path]), [["casePredatesFacts", "factsAsOf"]]);
});

test("a risk-free basis from another country warns, and an unknown currency never does", () => {
  const mismatch = mutate(loadFixture("acme.facts"), "costOfCapital.riskFreeBasis", "US 10-year Treasury");
  const result = decode(mismatch);
  assert.ok(result.success);
  assert.deepEqual(result.data.warnings.map((w) => [w.rule, w.path]), [["rfBasisMismatch", "costOfCapital.riskFreeBasis"]]);

  const exotic = mutate(mutate(loadFixture("acme.facts"), "currency", "PLN"), "market.priceCurrency", "PLN");
  assert.deepEqual(decode(exotic).data?.warnings, []);
});

test("an ltm row older than the latest fiscal year warns", () => {
  const old = mutate(loadFixture("acme.facts"), "financials.ltm.endDate", "2025-06-30");
  const result = decode(old);
  assert.ok(result.success);
  assert.deepEqual(result.data.warnings.map((w) => w.rule), ["ltmOlderThanFiscalYear"]);
});
```

Create `src/input/decode.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFixture, mutate, VALID_FIXTURES } from "../test-fixtures.ts";
import { decode } from "./decode.ts";

const pairs: readonly [string, string][] = [
  ["acme.facts", "acme-dcf.case"],
  ["acme.facts", "acme-normalised.case"],
  ["holdco.facts", "holdco-nav.case"],
];

for (const [f, c] of pairs) {
  test(`${f} + ${c} decodes`, () => {
    const result = decode(loadFixture(f), loadFixture(c));
    assert.ok(result.success, JSON.stringify(result.error));
    assert.notEqual(result.data.valuation, null);
    assert.equal(result.data.classification, (loadFixture(c) as { classification: string }).classification);
  });
}

for (const f of VALID_FIXTURES.facts) {
  test(`${f} decodes alone, with no valuation and empty theses`, () => {
    const result = decode(loadFixture(f));
    assert.ok(result.success, JSON.stringify(result.error));
    assert.equal(result.data.valuation, null);
    assert.equal(result.data.classification, null);
    assert.deepEqual(result.data.theses, []);
  });
}

test("theses pass through untouched", () => {
  const result = decode(loadFixture("acme.facts"), loadFixture("acme-dcf.case"));
  assert.deepEqual(result.data?.theses, ["ai-disruption-overreaction", "eu-digital-sovereignty"]);
});

test("schema errors from both files are reported together, with file and dotted path", () => {
  const badFacts = mutate(loadFixture("acme.facts"), "market.price", -1);
  const badCase = mutate(loadFixture("acme-dcf.case"), "method.revenueGrowthPath", [0.05]);
  const result = decode(badFacts, badCase);
  assert.equal(result.success, false);
  assert.deepEqual(
    result.error?.map((e) => [e.file, e.layer, e.path]),
    [
      ["facts", "schema", "market.price"],
      ["case", "schema", "method.revenueGrowthPath"],
    ],
  );
});

test("a non-object input is a schema error at the root", () => {
  const result = decode("not json at all");
  assert.equal(result.success, false);
  assert.equal(result.error?.[0]?.file, "facts");
  assert.equal(result.error?.[0]?.path, "");
});

test("resolutions from both decoders are concatenated in order", () => {
  const result = decode(loadFixture("acme.facts"), loadFixture("acme-normalised.case"));
  assert.ok(result.success);
  assert.deepEqual(
    result.data.resolutions.map((r) => r.kind),
    ["betaFromSector", "netDebtDerived", "revenueBaseAveraged"],
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module './decode.ts'`

- [ ] **Step 3: Write the warnings and the entry point**

Create `src/input/warnings.ts`. Reference:

```ts
import type { Company } from "../domain/company.ts";
import type { Case } from "./case.ts";
import type { Warning } from "./errors.ts";
import type { Facts } from "./facts.ts";

const COUNTRY_HINTS: Record<string, readonly string[]> = {
  SEK: ["swed", "sverige", "riksbank"],
  NOK: ["norw", "norge", "norges bank"],
  DKK: ["dan", "denmark", "nationalbank"],
  EUR: ["euro", "bund", "german", "ecb", "french", "oat", "dutch", "finnish", "finland"],
  USD: ["us ", "u.s.", "treasury", "united states", "american"],
  GBP: ["uk ", "gilt", "british", "united kingdom", "bank of england"],
  CHF: ["swiss", "switzerland", "snb"],
  JPY: ["japan", "jgb"],
};

function casePredatesFacts(facts: Facts, c: Case | null): Warning[] {
  if (c === null || c.factsAsOf === null || c.factsAsOf >= facts.asOf) return [];
  return [{ rule: "casePredatesFacts", path: "factsAsOf", message: `case was written against facts of ${c.factsAsOf}; facts are now ${facts.asOf}` }];
}

function rfBasisMismatch(facts: Facts): Warning[] {
  const hints = COUNTRY_HINTS[facts.currency];
  if (hints === undefined) return [];
  const basis = facts.costOfCapital.riskFreeBasis.toLowerCase();
  if (hints.some((h) => basis.includes(h))) return [];
  return [{ rule: "rfBasisMismatch", path: "costOfCapital.riskFreeBasis", message: `riskFreeBasis "${facts.costOfCapital.riskFreeBasis}" does not look like a ${facts.currency} curve` }];
}

/** ISO dates compare lexically, which is why IsoDate is a branded string. */
function ltmOlderThanFiscalYear(company: Company): Warning[] {
  const ltm = company.financials.ltm;
  const latest = company.financials.fiscalYears.at(-1);
  if (ltm === null || latest === undefined || ltm.endDate >= latest.endDate) return [];
  return [{
    rule: "ltmOlderThanFiscalYear",
    path: "financials.ltm.endDate",
    message: `ltm ends ${ltm.endDate}, before fiscal year ${latest.fy} ends ${latest.endDate}`,
  }];
}

export function collectWarnings(facts: Facts, investmentCase: Case | null, company: Company): Warning[] {
  return [...casePredatesFacts(facts, investmentCase), ...rfBasisMismatch(facts), ...ltmOlderThanFiscalYear(company)];
}
```

`fiscalYears.at(-1)` returns `T | undefined` even on a `NonEmpty`, which is why the guard keeps `latest === undefined`; `fiscalYears[0]` would be typed `T` but the last element is what the warning needs. The `ReportedLtm` type from Task 9 is what makes `ltm.endDate` exist.

Create `src/input/decode.ts`. Reference:

```ts
import type { Company } from "../domain/company.ts";
import type { Classification } from "../domain/types.ts";
import type { Valuation } from "../domain/valuation.ts";
import { type Case, CaseSchema } from "./case.ts";
import { decodeCompany } from "./decode-company.ts";
import { decodeValuation } from "./decode-valuation.ts";
import { type DecodeError, decoded, type DecodeResult, failed, type Resolution, type Warning, zodIssuesToErrors } from "./errors.ts";
import { type Facts, FactsSchema } from "./facts.ts";
import { collectWarnings } from "./warnings.ts";

export type Decoded = {
  readonly company: Company;
  readonly valuation: Valuation | null;
  readonly classification: Classification | null;
  readonly theses: readonly string[];
  readonly resolutions: readonly Resolution[];
  readonly warnings: readonly Warning[];
};

function parseBoth(
  factsJson: unknown,
  caseJson: unknown | undefined,
): DecodeResult<{ facts: Facts; investmentCase: Case | null }> {
  const errors: DecodeError[] = [];
  const facts = FactsSchema.safeParse(factsJson);
  if (!facts.success) errors.push(...zodIssuesToErrors("facts", facts.error.issues));
  let investmentCase: Case | null = null;
  if (caseJson !== undefined) {
    const c = CaseSchema.safeParse(caseJson);
    if (c.success) investmentCase = c.data;
    else errors.push(...zodIssuesToErrors("case", c.error.issues));
  }
  if (errors.length > 0 || !facts.success) return failed(errors);
  return decoded({ facts: facts.data, investmentCase });
}

export function decode(factsJson: unknown, caseJson?: unknown): DecodeResult<Decoded> {
  const parsed = parseBoth(factsJson, caseJson);
  if (!parsed.success) return failed(parsed.error);
  const { facts, investmentCase } = parsed.data;

  const company = decodeCompany(facts);
  if (!company.success) return failed(company.error);

  let valuation: Valuation | null = null;
  const resolutions: Resolution[] = [...company.data.resolutions];
  if (investmentCase !== null) {
    const v = decodeValuation(facts, investmentCase, company.data.company);
    if (!v.success) return failed(v.error);
    valuation = v.data.valuation;
    resolutions.push(...v.data.resolutions);
  }

  return decoded({
    company: company.data.company,
    valuation,
    classification: investmentCase?.classification ?? null,
    theses: investmentCase?.theses ?? [],
    resolutions,
    warnings: collectWarnings(facts, investmentCase, company.data.company),
  });
}
```

- [ ] **Step 4: Run the check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/input/warnings.ts src/input/warnings.test.ts src/input/decode.ts src/input/decode.test.ts
git commit -m "feat(input): add advisory warnings and the top-level decoder"
```

---

### Task 13: CLI `kosing schema` and the public surface — Claude

**Files:**
- Create: `src/cli.ts`
- Create: `src/cli.test.ts`
- Modify: `package.json` (scripts)
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `emitJsonSchema` from `./input/schema.ts`; `decode`, `Decoded` from `./input/decode.ts`.
- Produces: `runCli(argv: readonly string[], io: { stdout: (s: string) => void; stderr: (s: string) => void }): number` (the exit code); `npm run kosing -- schema facts`. The `value` subcommand arrives in plan 2 and is rejected here with a usage message.

- [ ] **Step 1: Write the failing test**

Create `src/cli.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { runCli } from "./cli.ts";

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { stdout: (s: string) => out.push(s), stderr: (s: string) => err.push(s) }, out, err };
}

test("schema facts prints a JSON Schema and exits 0", () => {
  const { io, out, err } = capture();
  const code = runCli(["schema", "facts"], io);
  assert.equal(code, 0);
  assert.deepEqual(err, []);
  const schema = JSON.parse(out.join(""));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.ok("company" in schema.properties);
});

test("schema case prints the case schema", () => {
  const { io, out } = capture();
  assert.equal(runCli(["schema", "case"], io), 0);
  assert.ok("method" in JSON.parse(out.join("")).properties);
});

test("an unknown subcommand or document prints usage to stderr and exits 2", () => {
  for (const argv of [[], ["schema"], ["schema", "thesis"], ["value"]]) {
    const { io, out, err } = capture();
    assert.equal(runCli(argv, io), 2, argv.join(" "));
    assert.deepEqual(out, []);
    assert.ok(err.join("").includes("usage"), argv.join(" "));
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module './cli.ts'`

- [ ] **Step 3: Write the CLI**

Create `src/cli.ts`:

```ts
/**
 * The only file that knows about processes and streams. `runCli` is pure over
 * its arguments and the io it is handed, which is how the tests call it.
 */

import { emitJsonSchema } from "./input/schema.ts";

export type CliIo = {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
};

const USAGE = `usage:
  kosing schema facts | case     print the JSON Schema for that document
  kosing value --facts F [--case C]   (arrives in plan 2)
`;

function isDocument(name: string | undefined): name is "facts" | "case" {
  return name === "facts" || name === "case";
}

export function runCli(argv: readonly string[], io: CliIo): number {
  const [command, ...rest] = argv;
  if (command === "schema" && isDocument(rest[0]) && rest.length === 1) {
    io.stdout(`${JSON.stringify(emitJsonSchema(rest[0]), null, 2)}\n`);
    return 0;
  }
  io.stderr(USAGE);
  return 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runCli(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  });
}
```

Add to `package.json` scripts:

```json
"kosing": "node --import tsx src/cli.ts"
```

Replace the contents of `src/index.ts` with the old exports kept and the new surface added:

```ts
export * from "./dcf.ts";
export * from "./dcf-parse.ts";
export * from "./result.ts";
export * from "./validate.ts";
export * from "./wacc.ts";

export { decode, type Decoded } from "./input/decode.ts";
export type { DecodeError, DecodeResult, Resolution, Warning } from "./input/errors.ts";
export { emitJsonSchema } from "./input/schema.ts";
export type { Facts } from "./input/facts.ts";
export type { Case } from "./input/case.ts";
export type * from "./domain/company.ts";
export type * from "./domain/financials.ts";
export type * from "./domain/valuation.ts";
export type { Basis, Classification, Currency, IsoDate, NonEmpty, Unit } from "./domain/types.ts";
```

Keep whatever the existing `index.ts` exports for `dcf`, `wacc`, `result`, `validate` and `dcf-parse` exactly as they are today; the block above shows the shape, not a replacement of lines you have not read. Plan 2 removes three of them.

- [ ] **Step 4: Run the check and the command itself**

Run: `npm run check && npm run kosing -- schema facts | head -5`
Expected: PASS, then the first lines of the facts JSON Schema

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/cli.test.ts package.json src/index.ts
git commit -m "feat(cli): expose kosing schema and the decode surface"
```

---

## What plan 2 covers

Not in scope here, listed so the boundary is visible:

- `src/math/`: moving `dcf.ts` and `wacc.ts`, writing `reverse-dcf`, `multiples`, `fx`, `sensitivity`, `normalised-earnings`, `nav`, `linear-fade`;
- `src/select/`, the pure total selectors from `Decoded` to each module's input, including `dcfBasePeriodFromFiscalYear` and `reverseDcfUnavailable`;
- `src/results/` and `results.json`;
- `kosing value`;
- deleting `result.ts`, `validate.ts`, `dcf-parse.ts` and the Nova golden;
- properties over deterministic grids and one published worked example per algorithm;
- the end-to-end run on a real name.
