# Kosing as the workbench application layer: decode and math

Date: 2026-10-07
Status: approved design, not yet planned or implemented

## Purpose

Turn `kosing` from a TypeScript learning exercise into the application layer of
the investment workbench. The sibling `invest` repository keeps prose, rules,
wisdom, skills, theses and artifacts. Kosing takes the executable parts, in a
form that could later deploy as lambdas or behind a REST interface.

This is phase one of a longer restructuring. It is explicitly **not a port**:
kosing is free to rewrite rather than transcribe, and the Python is a reference
and an oracle, not a template.

### Why

The Python workbench is 11,424 lines. Its weak typing forces correctness to be
achieved by exception handling and after-the-fact validation passes rather than
by construction. The investor wants valuation reliability most of all, and the
math and its input handling is where reliability pays the most per unit of
effort. The target style is validation at the edge: once a typed object exists,
no consumer deals with unknowns, undefined, or illegal values.

## Scope

In scope:

- a wire layer that decodes `invest` dossier JSON;
- a domain model that the rest of the application computes against;
- selectors mapping the domain model to math inputs;
- the deterministic math, completing what kosing already has.

Out of scope for phase one, staying in Python and untouched:

- the ledger (SQLite, broker parsers, prices, views) — the least useful and
  messiest part, and possibly permanently Python;
- the assessment engine (`workbench/assessment/`);
- profile and report rendering (`workbench/profile/`);
- the CLI.

`invest` is not modified by this work, apart from one throwaway script used to
generate test fixtures. Python keeps running the real workflow throughout.

### Size

| Piece | Python reference | Lines |
| --- | --- | --- |
| Wire schema | `workbench/schema/dossier.schema.json` | 36 KB, 29 `$defs` |
| Dossier rules | `workbench/validation/` | 1,027 |
| Selectors | `workbench/math/adapters.py` | 354 |
| Math still to write | `reverse_dcf`, `sensitivity`, `nav`, `normalised_earnings`, `multiples`, `fx`, `linear_fade` | 931 |
| Math already in kosing | `dcf`, `wacc` | 275 (TS) |

## Non-goals

- No CLI, no entry point. Phase one is a library proved by its tests.
- No kosing-specific on-disk dossier format. See "Deferred, not rejected".
- No `Money` type. See "Decisions".
- No attempt to preserve Python's internal structure. Only its *outputs* are
  binding, and only until a deviation is deliberately recorded.

## Decisions

### Zod 4 as the schema library

Hand-written decoders were considered and rejected by the investor: "I'd rather
have a conventional codebase than one where all work goes into custom
boilerplate instead of actual functionality."

Zod 4 over TypeBox and Valibot: largest ecosystem, best error messages, and what
"conventional TypeScript" means in 2026. `safeParse` returns
`{ success: true; data } | { success: false; error }`, which is the community's
form of the `Result` type kosing hand-rolled. `.brand<"PositiveNumber">()`
replaces the hand-rolled brands.

Consequently `src/result.ts`, `src/validate.ts` and `collectResults` are
deleted, and `src/dcf-parse.ts` is superseded.

`src/exhaustive.ts` is kept. `assertNever` remains the idiom for exhaustive
switches over discriminated unions and TypeScript has no built-in equivalent.

### The emitted JSON Schema will be weaker than the hand-authored one

`dossier.schema.json` is read by the research model via
`researching-company/references/researcher-brief.md`, which calls it
authoritative. Zod cannot represent `.refine()` / `.superRefine()` predicates in
emitted JSON Schema.

This is accepted. The schema is not a runtime gate; it is guidance that reduces
round-trips. The gate is the decoder. When a dossier fails, the decode errors
tell the research model precisely what to fix. The brief must gain an English
statement of the cross-field rules that no longer appear in the schema.

Schema emission from Zod is phase one work only insofar as the Zod schemas must
be written; actually replacing `invest/workbench/schema/dossier.schema.json`
with a generated file is deferred until kosing owns `assess`.

### No `Money` type

Wrapping every monetary value as `{ amount, currency, scale }` would require
either unwrapping at every call site or an arithmetic shim, which is exactly the
custom boilerplate this design is avoiding. The math stays plain float
arithmetic.

Instead the decoder normalises: everything inside a `Company` is reporting
currency, millions, by construction, with the currency carried once at the root.
What `check_currency_consistency` and `check_unit_consistency` enforce after the
fact becomes an invariant the domain model cannot violate.

Empirically safe: across all 46 dossiers there are no mixed units, no mixed
currencies, and no case where `market_data.currency` differs from
`reporting_currency`.

The `unit` enum allows `millions`, `thousands` and `ones`, so decode must
rescale to millions. All 247 financial rows in existence today are `millions`,
which means **the corpus cannot exercise rescaling at all** — it needs a
hand-written test, and belongs in the decode-boundary layer rather than being
assumed correct because the corpus is green.

### The domain root is `Company`, not `Dossier` or `Subject`

`Dossier` would drag the research layer's vocabulary into the core, and invites
someone to add `sources` and `revision_history` to it later.

`Subject` was considered, to accommodate ETFs and commodity certificates. All 46
dossiers are companies, including the three holding companies — Pershing Square
Holdings is a Guernsey-incorporated investment company, Kinnevik an AB. The
schema structurally cannot admit an ETF: `financials_annual`, `market_data` and
`wacc_raw_inputs` are all required and an ETF has none of them. ETFs appear only
in the funnel and ledger, which are out of scope.

When non-company subjects eventually need pricing they will share nothing with a
company except identity and a price, so the right shape then is a root union:

```ts
type Subject =
  | { kind: "company"; company: Company }
  | { kind: "fund";    fund: Fund };
```

in which the member is still called `Company`. Naming it `Company` now is not a
decision that has to be undone.

## Architecture

Three layers. Dependencies point one way only; the arrows are functions living
at the boundary, not imports crossing it.

```
   invest/dossiers/*.dossier.json
            |
   WIRE   src/dossier/
     Zod schemas mirroring the JSON exactly. Optional stays optional.
     Knows field names, schema_version, and every dossier rule.
     Knows nothing about valuation.
            |  decode()
   DOMAIN src/domain/
     Plain types. No optionality that is not a real domain state.
     No wire field names. Knows nothing about JSON or how it was built.
            |  selectors (pure, total)
   MATH   src/math/
     Takes its own input types. Knows nothing about the domain model.
```

### Domain model

```ts
type Company = {
  identity:    Identity;       // ticker, exchange, name, isin
  currency:    Currency;       // one, for everything below it
  asOf:        IsoDate;
  market:      Market;         // price, shares, netDebt, marketCap — resolved
  qualitative: Qualitative;
  valuation:   Valuation;      // carries exactly what its method needs
};

type Valuation =
  | { method: "dcf";       financials: OperatingFinancials;
                           costOfCapital: CostOfCapital;
                           assumptions: DcfAssumptions }
  | { method: "cyclical";  financials: OperatingFinancials;
                           revenueBase: CyclicalRevenueBase;
                           assumptions: CyclicalAssumptions }
  | { method: "nav";       holdings: NonEmpty<Holding>;
                           parentNetDebt: number;
                           lookThroughNav: number | null;
                           assumptions: NavAssumptions }
  | { method: "deferred";  classification: DeferredClassification };

type OperatingFinancials = {
  ltm:         Period | null;          // 44/46 have one; null is a real state
  fiscalYears: NonEmpty<FiscalYear>;   // sorted oldest to newest
};

type Period     = { revenue: number; ebit: number; /* the genuinely nullable rest */ };
type FiscalYear = Period & { fy: number; endDate: IsoDate };

type CyclicalRevenueBase =
  | { kind: "ltm";       period: Period }
  | { kind: "averageFy"; window: NonEmpty<FiscalYear> };

type Holding = { name: string; fairValue: number; basis: "listed" | "unlisted" };
```

Classification mapping, from `primary_type`'s nine enum values:

| `primary_type` | method |
| --- | --- |
| `quality_compounder`, `garp` | `dcf` |
| `value_cyclical` | `cyclical` |
| `holding_company` | `nav` |
| `bank_insurer`, `reit_utility`, `saas_pre_profit`, `commodity_producer`, `special_situation` | `deferred` |

Rationale for the shape:

- **Financials live inside the branches that have them.** The three holding
  companies have rows with no `revenue` (KINVB, PSH) or no `ebit` (LKFT, PSH).
  That is not a data gap; a holdco has no meaningful revenue. With financials on
  the `dcf` and `cyclical` branches only, PSH's missing revenue stops being an
  absent field and becomes a structural fact, and `revenue` and `ebit` can be
  required on `Period`.
- **Cost of capital belongs to `dcf` alone.** Every existing analysis for
  `nav_sum_of_parts`, `normalised_earnings` and `deferred` carries `wacc: null`.
  Cyclical valuation is closed-form (the multiple carries the time value); NAV
  uses a warranted discount. Neither uses a tax rate either, which is why both
  tax rates below live on this branch.
- **`CostOfCapital` carries two tax rates, deliberately.** Python resolves them
  with opposite preferences from the same block: `_resolve_tax_rate(prefer="statutory")`
  for the WACC, `prefer="effective")` for DCF cash flows. They are different
  numbers for different purposes, so the domain models both rather than
  collapsing them:

  ```ts
  type CostOfCapital = {
    riskFree: number; erp: number; beta: number; countryPremium: number;
    preTaxCostOfDebt: number; equityWeight: number; debtWeight: number;
    taxRateForDiscounting: number;   // statutory ?? effective
    taxRateForCashFlows: number;     // effective, always present
  };
  ```

  `tax_rate_effective` is required by the schema, so `taxRateForCashFlows` needs
  no fallback. `tax_rate_statutory` is null in exactly 1 of 46 dossiers, which is
  the only case where `waccTaxRateFromEffective` fires.
- **`deferred` carries no metrics.** `specialty_metrics` has blocks for `bank`,
  `reit` and others, but only `holding_company` is read by math. A bank's CET1
  ratio is real research data this application has no use for, so it stops at
  the wire and has no domain representation.
- **`ltm` is nullable because absence is a real state, on one branch only.** The
  schema does not require an LTM row, and the DCF method falls back to the
  latest fiscal year, recording why. The cyclical branch is different: three of
  the four cyclicals state `revenue_base_policy: "ltm"`, which *requires* one,
  so `{ method: "cyclical", policy: ltm }` with `ltm: null` would be a
  representable invalid state. `CyclicalRevenueBase` closes it by carrying the
  evidence that the stated policy was satisfiable, and both `ValueError`s in
  `_cyclical_revenue_base` become decode errors.

  The resulting asymmetry is a rule, not an accident: **decode resolves whatever
  can fail; selectors resolve what cannot.** Cyclical's revenue base can fail
  because the policy may not be satisfiable by the data. DCF's cannot, because
  `fiscalYears` is `NonEmpty` so `ltm ?? latest` always lands — so it stays in
  the selector and `Company` keeps no derivation it did not need.

  Only KINVB and W5 lack an LTM row today, and both are on branches carrying no
  financials. **The DCF fiscal-year fallback therefore has zero corpus
  coverage** and needs a hand-written test, like unit rescaling.
- **Splitting `ltm` from `fiscalYears`** removes the impossible pair the wire
  carries: `is_ltm: boolean` with `fy: number | null` admits
  `{is_ltm: true, fy: 2024}` and `{is_ltm: false, fy: null}`, both nonsense, and
  the second is a latent `TypeError` in `adapters.py`. After the split, `fy` is a
  definite `number` because only a fiscal year has one.

### All eight cross-field schema rules become structural

The wire schema carries six `if`/`then` blocks and two `not` constraints. Every
one stops being a declared rule and becomes a consequence of constructing the
domain type — the decoder must reject the bad input because the output type
cannot represent it.

| Wire rule | How it disappears |
| --- | --- |
| `quality_compounder\|garp` requires `base_dcf` | `dcf` branch carries `DcfAssumptions` |
| `holding_company` requires `specialty_metrics` + `base_holdco` | `nav` branch carries holdings and assumptions |
| `value_cyclical` requires `base_cyclical` | `cyclical` branch carries assumptions |
| `revenue_base_policy == "average_fy"` requires `revenue_base_years` | `{ kind: "ltm" } \| { kind: "averageFy"; years: number }` |
| `is_ltm == true` implies `fy` null | `ltm` / `fiscalYears` split |
| `is_ltm == false` requires integer `fy` | `ltm` / `fiscalYears` split |
| `not (base_dcf and base_cyclical)` | union |
| `not (base_holdco and base_cyclical)` | union |

`.superRefine()` is therefore empty of *shape* rules. It keeps *value*
refinements — see the next section.

### Decode result

Zod is binary; the Python validator is not. `validate_dossier` returns
`list[Issue]` carrying `Severity.ERROR` or `Severity.WARNING`, and a stale
dossier is valid with a warning. `safeParse` cannot express that, so warnings
need their own channel.

```ts
type Decoded = {
  company:     Company;
  resolutions: Resolution[];   // why each fallback fired
  warnings:    Warning[];      // staleness, rf-basis mismatch
};

decodeCompany(json: unknown): Result<Decoded, DecodeError[]>

type DecodeError = {
  layer: "schema" | "semantic";
  rule: string;      // "schema.violation", "semantic.cyclical_inputs"
  path: string;      // JSON pointer into the WIRE document
  message: string;
};
```

**Error paths point at the wire, not the domain.** The file a human or the
research model edits is the dossier. `assessment_inputs.base_cyclical.ebit_margin`
is actionable; `valuation.assumptions.ebitMargin` names a type that exists only
inside kosing. Value refinements therefore run inside the Zod pipeline on the
wire schema, where `ctx.addIssue` already carries the correct path.

Warnings become pure functions over `Company` rather than dict-walks over the
wire. Their paths are fixed constants (`data_as_of`,
`wacc_raw_inputs.risk_free_basis`).

### Fate of the eight semantic checks

| Check | Severity | Fate |
| --- | --- | --- |
| `currency_consistency` | error | structural — one `Company.currency` |
| `unit_consistency` | error | structural — single normalised scale |
| `source_ref_integrity` | error | structural — `source_ref: string` resolves to `source: Source`; a dangling ref cannot be constructed |
| `fx_layer_completeness` | error | structural — `{ applies: false } \| { applies: true; pairs: NonEmpty<Pair>; spot: NonEmpty<Spot> }` |
| `cyclical_inputs` | error | stays a refinement — `bear <= base <= bull` and the multiple ceiling are predicates over numbers; TypeScript cannot express ordering in a type |
| `rf_basis_consistency` | warning | stays, as a warning over `Company` |
| `staleness` | warning | stays, as a warning over `Company` |
| `co_invalidation` | error | stays in the **wire layer** |

`co_invalidation` validates `revision_history` bookkeeping, which the domain
model deliberately excludes. It lives in `src/dossier/` as a refinement on the
wire schema and never reaches the domain. Kosing therefore validates the whole
dossier while the domain sees only what valuation needs: one tool, two scopes.

### Resolutions

Fallback resolution is recorded as data, not formatted strings. Python appends
strings like `"beta_company is null; used beta_sector=1.2"` to result objects,
and those reach the analysis artifact as its audit trail. They must survive, but
should not be strings until something prints them.

```ts
type Resolution =
  | { kind: "betaFromSector";        value: number }
  | { kind: "sharesFromOutstanding"; value: number }
  | { kind: "revenueBaseFromLtm" }
  | { kind: "revenueBaseFromFiscalYear"; fy: number }
  | { kind: "revenueBaseAveraged";   fromFy: number; toFy: number }
  | { kind: "waccTaxRateFromEffective"; value: number };
```

These are not edge cases. Across 46 dossiers, `beta_company` is null in **26**
and `shares_diluted_m` absent in **17**. The majority path is a fallback.

Resolutions are produced in two places, and both return them explicitly rather
than threading a context:

```ts
decodeCompany(json): Result<{ company; resolutions; warnings }, DecodeError[]>
selectDcfInputs(company, overrides): { inputs: DcfInputs; resolutions: Resolution[] }
```

The split follows the rule above: decode resolves whatever can fail (beta
fallback, share count, WACC tax rate, normalisation, the cyclical revenue base),
and selectors resolve what cannot (DCF revenue base) plus caller *choices*
(`betaOverride`, `waccOverride`, `targetPrice`). The caller concatenates. This
keeps `Company` free of derivations it did not need, at the cost of assembling
the audit trail from two sources, which was judged negligible against modelling
the domain correctly.

### Selectors are total

No `Result`, no throw. This is the test that the design works:

- `selectDcfInputs` cannot fail: `fiscalYears` is `NonEmpty`, so
  `ltm ?? latest` always lands.
- `selectNavInputs` cannot fail: `Holding.fairValue` is a required `number`, so
  the `ValueError` Python raises for a null fair value has nowhere to occur.
- Python's math layer raises in six places. The TypeScript one raises in none.

One case needs care. `fx_scenarios_from_dossier(dossier, pair="EURSEK")` raises
when the pair is absent — a string argument that may not match the data. The fix
is not a `Result`: the selector takes a `SpotRate` the caller picked off
`company.fxLayer.spotRates`, making it total by construction.

`workbench/math/_shared.py`'s `require_positive` disappears entirely. Math takes
branded values from decode and never re-checks.

### Latent bugs being designed out

Found in `workbench/math/adapters.py` and the wire schema. These are made
impossible rather than fixed, and each needs an entry in the known-deviations
file if the corpus exercises it.

1. `market_data.get("shares_diluted_m") or market_data["shares_outstanding_m"]`
   — Python `or` is falsy-based, so a legitimate `0` falls through. Twice.
2. `dossier.get("reporting_currency", "SEK")` — silently defaults currency.
   Five times. Unreachable today because the field is required, but live given
   the open question about currency-consistent hurdles.
3. `market_data.get("net_debt", 0.0)` — a missing net debt becomes zero, which
   flatters equity value. Four times.
4. `dcf_from_dossier` and `reverse_dcf_from_dossier` duplicate roughly 25 lines
   of base-row, tax and share resolution with nothing keeping them in step.
5. `base_row["revenue"]` and `wacc_raw["beta_sector"]` are unguarded, and
   neither field is required by the schema.
6. `max(fy_rows, key=lambda r: r["fy"])` compares `fy` values the schema allows
   to be null.

## Repository layout

```
src/
  dossier/            WIRE
    schema.ts           Zod schemas mirroring the dossier 1:1
    refine.ts           value refinements: cyclical monotonicity, co_invalidation
    decode.ts           wire to domain, producing resolutions and warnings
    errors.ts           DecodeError, Warning
  domain/             DOMAIN
    company.ts          Company, Identity, Market, Qualitative
    valuation.ts        the union, all four branches, Holding
    financials.ts       OperatingFinancials, Period, FiscalYear
    resolution.ts       Resolution union
    types.ts            NonEmpty, Currency, IsoDate
  select/             DOMAIN to MATH, pure and total
    dcf.ts  reverse-dcf.ts  nav.ts  normalised-earnings.ts  multiples.ts  fx.ts
  math/               MATH, pure
    dcf.ts  wacc.ts  reverse-dcf.ts  nav.ts
    normalised-earnings.ts  multiples.ts  fx.ts  sensitivity.ts
  exhaustive.ts
  index.ts
```

Files are sized to their content, not split one-per-concept. `Holding` is about
twenty lines used by one branch, so it sits in `valuation.ts`; `financials.ts`
earns its own file by being larger and shared by two branches.

Existing kosing files: `dcf.ts` and `wacc.ts` keep their arithmetic and shed
their parse layer; `result.ts`, `validate.ts` and `dcf-parse.ts` are deleted;
`exhaustive.ts` and `test-utils.ts` are kept, with `unwrap` adapted to Zod.

Toolchain is unchanged: Node 22+, tsx, `node:test`, Biome, `tsc --noEmit`,
`npm run check` before committing. Zod is the first runtime dependency.

## Test strategy

Correctness rests on four layers, not one. Hand-written tests encode what the
author believes a function does; the corpus encodes what it actually does.

### 1. Differential corpus

A throwaway Python script walks all 46 dossiers against the seven
`*_from_dossier` adapters (`wacc`, `dcf`, `reverse_dcf`,
`normalised_earnings`, `multiples_position`, `fx_scenarios`, `nav_inputs`),
writing `tests/corpus/<TICKER>.<function>.json` containing the typed inputs the
adapter produced and the full result object. Roughly 300 cases. Kosing asserts
its own pipeline reproduces them.

The corpus is committed; the script runs once and is discarded. It exercises
decode and math in a single pass, and covers null handling, holdco and cyclical
paths that would never be written by hand.

Comparison is at **relative tolerance 1e-9**, not exact equality.
`workbench/math/` uses no `Decimal` and no rounding anywhere, so Python floats
and JavaScript numbers are both IEEE-754 doubles; `+ - * /` agree bit for bit
and only `**` can differ, in the last ulp.

A committed `known-deviations.md` records every case where TypeScript
intentionally differs, with the reason. Without it the corpus silently enshrines
the latent bugs above as expected behaviour.

### 2. Decode boundary

The 13 existing invalid fixtures in `invest/tests/fixtures/dossiers/invalid/`,
plus cases no real dossier exercises: mixed units, mixed currencies, dangling
`source_ref`, `is_ltm` with an `fy`, `average_fy` without `revenue_base_years`,
a holding with a null fair value. Several of these should now fail to construct
a `Company` rather than fail a check, and the test asserts which.

Three paths exist in the code but in no dossier, so a green corpus says nothing
about them. Each needs a hand-written case here:

- unit rescaling — all 247 rows are `millions`;
- the DCF fiscal-year revenue-base fallback — every dossier reaching
  `OperatingFinancials` has an LTM row;
- `average_fy` with a window longer than the available fiscal rows — EQNR, the
  only `average_fy` cyclical, asks for 3 and has 5.

### 3. Properties

Invariants the corpus cannot express: DCF value monotone increasing in growth
and decreasing in WACC; reverse DCF round-trips through forward DCF; sensitivity
axes symmetric about base.

### 4. Unit tests

For the arithmetic itself, as kosing already has.

## Working split

This overrides `kosing/CLAUDE.md`'s "the user writes the code" rule, for the
drudgery only.

| Claude writes | The investor writes |
| --- | --- |
| Zod wire schema transcription | selectors (`src/select/`) |
| corpus dump script (throwaway Python) | `reverse-dcf`, `sensitivity`, `nav`, `normalised-earnings`, `multiples`, `fx` |
| test harness and fixture loading | Zod rewrite of `dcf` and `wacc` parse layers |

Mutual review. Existing kosing code is a style guide, not a contract: match
TypeScript community convention while keeping functional style and
impossible-states thinking where it is reasonable.

## Deferred, not rejected

### A kosing-native dossier format

Considered and deferred, in a different form than first proposed.

A kosing-specific on-disk format with a translation facade was rejected,
because the facade is already the valuable part and is being built. `src/dossier/`
is the representation boundary, `Company` is the kosing-native shape, `decode()`
is the translation. A separate persisted format would buy only a simpler
decoder, which is written once and rarely touched.

More fundamentally, the dossier's shape is optimised for its *author* — a
language model doing web research. Flat JSON with explicit field names and
sibling optional blocks is something a model emits reliably; a discriminated
union with a `method` tag it has to get right is harder to produce than to
consume. A format better fitted to kosing would be worse fitted to the thing
that writes it. The boundary exists precisely so the two can optimise
independently, and the 1:1 mirror is correct on its own terms rather than being
a concession to the test corpus.

Sequencing rules it out near-term regardless: Python's engine and renderer read
the current format, so changing it before kosing owns `assess` means two readers
or a converter.

### Dossier schema 3.0

The narrower version of that idea is worth doing later. Not a kosing-native
format — a better dossier format, still model-friendly, that removes the
impossible states the research model currently has to avoid by hand:

- `is_ltm: boolean` plus `fy: number | null` becomes two arrays. Deletes two
  `if`/`then` rules and a class of model error.
- `base_dcf` / `base_holdco` / `base_cyclical` as three sibling optionals
  becomes one tagged block. Deletes three `if`/`then` and both `not`
  constraints.
- `revenue_base_policy` plus conditional `revenue_base_years` becomes one tagged
  object.

Better for both sides: fewer ways for the model to be wrong, less for the
decoder to resolve. The natural moment is when kosing emits the schema from Zod,
since the brief is being regenerated then anyway.

**Gate**: kosing owns `assess`, so Python no longer reads dossiers.

**Cost note, important**: the project's precedent is that superseded dossiers
are not migrated — `assess_dossier` refuses schema 2.0 outright with "Re-run the
research, do not repair the file." That was right because 2.0 to 2.1 was a
*semantic* change: base cases written under the retired pessimistic-realistic
rule were substantively wrong, not merely differently shaped. A purely
structural 3.0 can be migrated with a script and no re-research. The existing
precedent should not be read as "format change means re-researching 46 names".

### Later phases

In rough order, each needing its own design:

1. Assessment engine (`workbench/assessment/`, 978 lines) — the point at which
   kosing produces `analysis.json` end to end.
2. A CLI or HTTP adapter, deliberately thin: path resolution, file reads and
   stdout are adapters, not library functions, so the core stays deployable as
   lambdas.
3. Profile and report rendering (982 lines), golden-testable against 45
   existing profiles.
4. Schema 3.0, gated as above.
5. The ledger, possibly never.

## Risks

- **The corpus enshrines Python's behaviour, bugs included.** Mitigated by
  `known-deviations.md`, which must be written as deviations are found rather
  than retrofitted.
- **Real dossiers skew to `garp` and `quality_compounder`** (37 of 46). Holdco
  has 3 cases and deferred has 2, so those branches get thin corpus coverage and
  lean harder on hand-written tests.
- **The research model loses schema guidance** on the cross-field rules once the
  schema is generated. Mitigated by restating them in the brief; not an issue
  in phase one, which does not replace the schema file.
- **Two decode layers coexist** for the whole of phase one, since Python keeps
  validating for real while kosing validates for tests. Accepted: it is the
  price of leaving `invest` untouched, and it ends when kosing owns `assess`.
