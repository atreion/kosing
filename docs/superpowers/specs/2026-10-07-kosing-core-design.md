# Kosing core: inputs, math, results

Date: 2026-10-07
Status: approved design, not yet planned or implemented
Supersedes: `2026-10-07-kosing-decode-and-math-design.md`

## Purpose

Kosing becomes the investment workbench, replacing `invest` piece by piece
until nothing is left there. This spec covers the first piece, the
deterministic core: what a researcher writes, what an analyst writes, the math
that runs over both, and what an advisor reads. The AI roles around the core
(researcher, analyst, advisor) and the prose they draw on (wisdom, checklist,
theses) migrate in later specs. Invest is not modified on the way; it is
abandoned.

### Why this replaces the previous design

The previous spec framed kosing as the application layer over invest's
dossiers, proved correct by a differential corpus: 46 dossiers through seven
Python adapters, reproduced at relative tolerance 1e-9. Implementing its first
plan established three things:

- Eight of the 46 dossiers are schema 2.0, which Python itself refuses. The
  corpus was 38, and nobody had counted.
- The corpus contained data defects (duplicated 52-week figures where
  ten-year ranges belong, orphaned source attributions, a month where a date
  was required) that Python's validator cannot see, because `jsonschema`
  leaves `format` and `additionalProperties` unenforced wherever the schema is
  silent.
- The spec itself listed six latent bugs in the adapters the corpus would
  have enshrined.

An oracle that is not trusted is not an oracle. The algorithms kosing implements
(DCF, reverse DCF, WACC, NAV, normalised earnings, multiples) are textbook
finance; the authority on what they compute is the textbook, and Python was only
ever another implementation. Dropping the corpus removes the one commitment that
made this a port, and with it the obligation to mirror a 36 KB JSON Schema and
the defects in the data written against it.

### The funnel

1. **You** pick a name: an idea, a tip, an article.
2. **The researcher** (AI) finds, collects and writes what is observable about
   the company. Its only job. The math stays out of AI hands because AI is
   unreliable at arithmetic.
3. **The analyst** (AI) writes the thesis: which valuation applies and on what
   assumptions. A different job from research, with a different half-life: a
   thesis about SAP not being disrupted by AI outlives many quarterly refreshes
   of SAP's price and guidance.
4. **Kosing** computes and outputs results. It takes the method as given and
   decides nothing.
5. **The advisor** (AI) reads the results against your wisdom, checklist and
   theses, and recommends.

A screen is step 2 alone: facts in, what-is-priced-in out. Full research adds
step 3. Kosing has no screen mode; it computes whatever the inputs it was given
support.

## Scope

In scope:

- `facts.json` and `thesis.json`, defined as Zod schemas with JSON Schema
  generated from them for the AI roles to fill in;
- decode from both documents into a domain model in which the cross-document
  rules are unrepresentable rather than checked;
- the math: `wacc`, `reverse-dcf`, `multiples`, `fx`, `dcf`, `sensitivity`,
  `normalised-earnings`, `nav`;
- `results.json`, the structured output the advisor reads;
- a thin CLI so Claude can invoke the core.

Out of scope, for later specs:

- the researcher, analyst and advisor skills and the prose they use;
- rendering of any kind;
- the ledger, broker parsers, prices, and anything else in invest that is not
  the funnel.

## Non-goals

- No reading of existing dossiers. They were inputs to an oracle that no longer
  exists. At most they are reference material for what a researcher tends to
  find.
- No revision bookkeeping. Facts and thesis are files under version control;
  git is the revision history. The `revision_history` block, `price_refresh`
  kinds, `fields_changed` lists and the `co_invalidation` check are gone.
- No `Money` type. Decode normalises everything to reporting currency,
  millions; the math is plain float arithmetic.
- No opinion in the core about what kind of company this is. Classification is
  an opinion the analyst writes and the advisor reads; kosing validates the
  enum and never branches on it.

## Decisions

### Kosing owns the input format, and the JSON Schema is generated

Today `dossier.schema.json` is authoritative and hand-maintained, and consumers
mirror it in another language. Inverted: kosing's Zod schemas are the single
source of truth, and `kosing schema facts` / `kosing schema thesis` emit the
JSON Schema the researcher and analyst fill in. The researcher still gets a
flat, model-friendly document; it stops being maintained separately from the
thing that consumes it.

Zod cannot express `.refine()` predicates in emitted JSON Schema. This matters
less than it did: most of the old schema's refinements patched impossible
states (`is_ltm` with `fy`, three sibling `base_*` blocks) that this format does
not have. The ones that remain (ordering of scenario triples, the multiple
ceiling, weights summing to one) are listed in a test so the set of rules the
schema cannot carry is maintained, not discovered, and the skills spec restates
them in English for the AI roles.

### Facts and thesis are two documents

Facts are what is observable and are refreshed mechanically: a new report, a new
price, new guidance. The thesis is judgement and changes when the view changes.
Waiting for an entry price is the common case: facts refresh weekly, the thesis
holds, the advisor re-reads new results against an unchanged view. One document
would force the stable part to be re-emitted every time the volatile part moved,
and would need a revision log to say which part changed.

### The thesis names the method; the math decides nothing

The old dossier said `primary_type: garp` and Python inferred "garp means DCF",
expecting a `base_dcf` block. Classification was doing two jobs: routing key for
the math and judgement about the company. Here the thesis says `method: dcf`
and supplies DCF assumptions; the type system makes a thesis with the wrong
assumptions unrepresentable. Classification survives as an opinion for the
advisor. The `methodFor` switch and `DeferredClassification` do not exist. A
bank has no thesis the math can run yet, which is a statement about the
tooling, not about the bank.

### Facts contain no derived numbers

Market cap, enterprise value and current multiples are arithmetic on other
facts, and the old dossier asked the model to perform it. Kosing derives; the
researcher copies what a report says. Net debt is derived from the balance
sheet by a stated convention rather than copied from a company's own
definition, which varies.

### Every key is present; unknown is null

A field the researcher could not establish is `null`, with an entry in `gaps`
saying why. No field is optional. For a model this is the easier contract
(always emit every key) and for the decoder it removes the optional-versus-
nullable distinction entirely: `exactOptionalPropertyTypes` has nothing to
distinguish. Blocks that do not apply to a company (`holdings` for a company
that holds nothing) are `null` as a whole.

### Zod 4, carried forward

Hand-written decoders were rejected in the previous spec for the right reason:
a conventional codebase over custom boilerplate. `safeParse` is the community's
`Result`; `.brand<>()` replaces hand-rolled brands at the wire. The domain keeps
its own `Brand` with a `unique symbol` so Zod never appears in `src/domain/`,
and the one `as` cast per branded primitive, inside a `.transform()`, is the
sanctioned bridge.

### Strictness

Every object is `z.strictObject()`. Across one session of transcription, strict
objects found three real defects in supposedly validated data. A misspelled
field is an error the researcher sees, not silently dropped data.

### The domain root is `Company`

Carried forward. All 46 dossiers were companies, the schema structurally cannot
admit an ETF, and when non-company subjects need pricing the shape is a root
union in which the member is still called `Company`.

## Architecture

```
          researcher (AI)            analyst (AI)
                |                         |
            facts.json               thesis.json
                |                         |
                +-----------+-------------+
                            |
   INPUT   src/input/       |   Zod schemas, JSON Schema emission, decode.
                            |   Knows field names and every input rule.
                            |   Knows nothing about valuation.
                            |  decode()
   DOMAIN  src/domain/      |   Plain types. No optionality that is not a real
                            |   domain state. No knowledge of JSON.
                            |  selectors (pure, total)
   MATH    src/math/        |   Own input types. Knows nothing about the domain.
                            |
   RESULTS src/results/     |   Assembles results.json from math outputs.
                            |
   CLI     src/cli.ts       |   Paths, stdin/stdout, exit codes. Nothing else.
                            |
                       results.json
                            |
                       advisor (AI)
```

Dependencies point one way. The arrows are functions at the boundary, not
imports crossing it.

## `facts.json`

Monetary figures are in `currency` and `unit` throughout. Share counts are
always millions and the field names say so. Percentages are fractions (`0.21`,
not `21`). Every block that reports something cites sources by id.

```
schema_version   "1.0"
company          { ticker, exchange, name, isin: string|null, country: AA }
as_of            date — when these facts were gathered
currency         ISO 4217 — reporting currency
unit             "millions" | "thousands" | "ones"

market {
  price                  number > 0
  price_currency         ISO 4217 — trading currency; equals `currency` unless dual-listed
  as_of                  date
  shares_outstanding_m   number >= 0
  shares_diluted_m       number >= 0 | null
  week52_high            number >= 0 | null
  week52_low             number >= 0 | null
  source_refs            [id, ...] non-empty
}

financials {
  fiscal_years   [FiscalYearRow, ...] non-empty, any order; decode sorts
  ltm            LtmRow | null
  quarters       [QuarterRow, ...] | null
}
FiscalYearRow {
  fy             integer 1900..2200
  end_date       date
  revenue, ebit, net_income, ebitda, depreciation_amortization,
  cogs, gross_profit, opex, interest_expense, tax_expense,
  ocf, capex, fcf, dividends_paid                     number | null, each
  shares_basic_m, shares_diluted_m                     number >= 0 | null
  source_ref     id
}
LtmRow      FiscalYearRow without `fy`
QuarterRow  { fq: /^[12][0-9]{3}Q[1-4]$/, end_date, revenue, ebit, net_income,
              ocf, capex, fcf: number|null each, source_ref }

balance_sheet {
  as_of                        date
  cash_and_equivalents         number
  short_term_investments       number | null
  total_debt                   number >= 0
  short_term_debt              number >= 0 | null
  long_term_debt               number >= 0 | null
  operating_lease_liabilities  number >= 0 | null
  pension_obligations          number | null
  goodwill                     number | null
  intangibles_ex_goodwill      number | null
  source_ref                   id
}

cost_of_capital {
  risk_free_rate        number
  risk_free_basis       string non-empty — e.g. "Swedish 10-year government bond"
  erp                   number >= 0 — the convention the researcher looked up
  country_premium       number | null
  beta_company          number | null
  beta_sector           number | null
  tax_rate_effective    0..1
  tax_rate_statutory    0..1 | null
  pretax_cost_of_debt   number >= 0
  equity_weight         0..1
  debt_weight           0..1
  weights_as_of         date
  source_refs           [id, ...] non-empty
}

historical_ranges {
  share_price   RangeBand
  pe_trailing   RangeBand
  ev_ebit       RangeBand
  ev_ebitda     RangeBand
  price_book    RangeBand
  source_refs   [id, ...] non-empty
} | null
RangeBand { y5_low, y5_high, y10_low, y10_high: number | null each }

peers [{
  name          string
  ticker        string | null
  pe_trailing, ev_ebit, ev_ebitda, ev_revenue   number | null each
  source_ref    id
}, ...] | null

estimates [{
  fy            integer
  revenue, ebit, eps    number | null each
  source_ref    id
}, ...] | null

holdings {
  items   [{ name, fair_value: number|null, basis: "listed"|"unlisted", source_ref }, ...]
  parent_net_debt     number
  look_through_nav    number | null
  source_refs         [id, ...] non-empty
} | null

fx {
  spot_rates   [{ pair: /^[A-Z]{6}$/, rate: number > 0, as_of: date, source_ref }, ...]
  exposures    [{ currency: ISO 4217, revenue_share: 0..1|null, cost_share: 0..1|null }, ...]
} | null

sources [{
  id          /^S[0-9]+$/, unique within the document
  kind        "annual_report" | "interim_report" | "quarterly_report" | "press_release"
              | "ir_page" | "broker_estimate" | "aggregator" | "regulator"
              | "macro_reference" | "market_data_feed"
  issuer      string
  title       string
  url         URL
  published   date | YYYY-MM | null — a month, when that is all the source states
  retrieved   date
  pages       string | null
  tier        "primary" | "secondary" | "tertiary"
}, ...] non-empty

gaps [{ field: string — a path such as "financials.ltm", reason: string }, ...]
```

Wire-level rules, all producing an error with a path into this file:

- every `source_ref` and every member of every `source_refs` resolves to a
  `sources[].id`;
- `fiscal_years[].fy` values are distinct;
- `equity_weight + debt_weight` is 1 within 1e-6;
- `price_currency` differing from `currency` requires an `fx.spot_rates` entry
  for the pair in either direction.

## `thesis.json`

```
schema_version    "1.0"
ticker            string — must equal facts.company.ticker
facts_as_of       date | null — the facts snapshot this was written against
classification    "quality_compounder" | "garp" | "value_cyclical" | "holding_company"
                  | "bank_insurer" | "reit_utility" | "saas_pre_profit"
                  | "commodity_producer" | "special_situation"
                  — an opinion for the advisor; kosing validates it and never reads it

method   one of:
  {
    kind                        "dcf"
    revenue_growth_path         [number × 10]
    ebit_margin_path            [number × 10]
    capex_pct_revenue_path      [number × 10]
    da_pct_revenue_path         [number × 10]
    working_capital_pct_revenue number
    terminal                    { kind: "perpetuity_growth", growth: number, basis: string }
                              | { kind: "exit_multiple", multiple: number > 0,
                                  on: "ev_ebit" | "ev_ebitda" | "ev_fcff", basis: string }
    rationale                   string non-empty
    source_refs                 [id, ...] — ids in facts.sources
  }
  {
    kind                "normalised_earnings"
    revenue_base        { kind: "ltm" } | { kind: "average_fy", years: integer >= 1 }
    ebit_margin         { bear, base, bull }
    ev_ebit_multiple    { bear, base, bull }
    multiple_ceiling    number | null
    rationale           string non-empty
    source_refs         [id, ...]
  }
  {
    kind                "nav"
    warranted_discount  0..0.9
    rationale           string non-empty
    source_refs         [id, ...]
  }

overrides {
  beta        number | null
  wacc        number | null — replaces the computed WACC outright
  rationale   string | null — required when either is non-null
}

sensitivity {
  wacc_steps              [number, ...] — absolute deltas around the computed WACC, e.g. [-0.01, -0.005, 0, 0.005, 0.01]
  terminal_growth_steps   [number, ...] — likewise; only meaningful for perpetuity growth
} | null — null means the default grid of ±1pp / ±0.5pp
```

Wire-level rules:

- `bear <= base <= bull` on each scenario triple;
- no scenario multiple above `multiple_ceiling` when it is set;
- `overrides.rationale` is non-null when either override is;
- `sensitivity` steps each contain `0`.

The `terminal` union matches what `src/dcf.ts` already computes:
`perpetuityGrowth` and `exitMultiple` over `evEbit | evEbitda | evFcff`.

## Decode

`decode(facts: unknown, thesis: unknown | undefined)` parses each document with
its schema, maps every Zod issue to a `DecodeError` naming the file and the
dotted path, then builds the domain. It returns

```ts
type Decoded = {
  company: Company;              // from facts alone; always constructible from valid facts
  valuation: Valuation | null;   // from facts + thesis; null when no thesis was given
  classification: Classification | null;  // passed through for the advisor
  resolutions: Resolution[];
  warnings: Warning[];
};

decode(facts, thesis): Result<Decoded, DecodeError[]>

type DecodeError = {
  file: "facts" | "thesis";
  layer: "schema" | "semantic";
  rule: string;       // "schema.violation", "semantic.holding_without_value"
  path: string;       // dotted path into that file
  message: string;
};
```

Error paths point at the file a human or model edits. Value refinements run
inside the Zod pipeline so `ctx.addIssue` carries the right path for free.

### Resolutions

Every fallback is data, formatted into a sentence only when an AI reads it.

| Kind | Fires when |
| --- | --- |
| `betaFromSector` | `beta_company` is null and `beta_sector` is not |
| `betaOverridden` | `overrides.beta` is set |
| `waccOverridden` | `overrides.wacc` is set |
| `sharesFromOutstanding` | `shares_diluted_m` is null |
| `taxRateFromEffective` | `tax_rate_statutory` is null; the discounting rate falls back |
| `unitRescaled` | `unit` is `thousands` or `ones`; carries the factor and the row count |
| `priceConvertedToReporting` | `price_currency` differs from `currency`; carries the pair and rate used |
| `netDebtDerived` | always; carries the components used, so the convention is visible |
| `revenueBaseFromLtm` | normalised earnings with the `ltm` policy |
| `revenueBaseAveraged` | normalised earnings with `average_fy`; carries the window |
| `dcfBasePeriodFromFiscalYear` | the DCF selector used the latest fiscal year because `ltm` is null |
| `reverseDcfUnavailable` | no usable base period exists, meaning none with non-null revenue, EBIT, capex and depreciation_amortization, which a projection needs; carries the reason |

Share count fallback and beta fallback use explicit null checks, never `||`. A
share count of `0` is a share count.

### Cross-document rules

Each is a `semantic.*` error. Together they are the reason the domain's
`Valuation` can require what the wire leaves nullable.

| Rule | Requires |
| --- | --- |
| `semantic.ticker_mismatch` | `thesis.ticker === facts.company.ticker` |
| `semantic.no_beta` | a non-null beta from `beta_company`, `beta_sector` or `overrides.beta` |
| `semantic.period_missing_figure` | for `dcf` and `normalised_earnings`: every fiscal year and the LTM row, if present, has non-null `revenue` and `ebit` |
| `semantic.revenue_base_unsatisfiable` | `ltm` policy with `financials.ltm` present; `average_fy(n)` with at least `n` fiscal years |
| `semantic.nav_requires_holdings` | `nav` with `facts.holdings` non-null and `items` non-empty |
| `semantic.holding_without_value` | every holding has a non-null `fair_value`; the error names the holding |
| `semantic.source_ref` | every `source_refs` entry in the thesis resolves in `facts.sources` |

### Warnings

Advisory, never fatal, computed over the decoded `Company` with fixed paths.

| Rule | Fires when |
| --- | --- |
| `thesisPredatesFacts` | `thesis.facts_as_of` is set and earlier than `facts.as_of` |
| `rfBasisMismatch` | `risk_free_basis` does not mention a country hint for `currency` (table carried over from `semantic.py`) |
| `ltmOlderThanFiscalYear` | `financials.ltm.end_date` is earlier than the latest fiscal year's `end_date` |

## Domain model

```ts
type Company = {
  identity: Identity;              // ticker, exchange, name, isin, country
  currency: Currency;              // one, for everything below
  asOf: IsoDate;
  market: Market;                  // price in reporting currency, shares resolved, 52w range
  financials: Financials;          // rows with nullable figures; a holdco has no revenue
  balanceSheet: BalanceSheet;
  netDebt: number;                 // derived: total_debt - cash - short_term_investments
  otherClaims: OtherClaims;        // leases, pensions, reported separately, not in netDebt
  costOfCapital: CostOfCapital;    // beta resolved, both tax rates, overrides applied
  historicalRanges: HistoricalRanges | null;
  peers: readonly Peer[];
  estimates: readonly Estimate[];
  holdings: Holdings | null;
  fx: Fx | null;
};

type CostOfCapital = {
  riskFree: number; erp: number; beta: number; countryPremium: number;
  preTaxCostOfDebt: number; equityWeight: number; debtWeight: number;
  taxRateForDiscounting: number;   // statutory ?? effective
  taxRateForCashFlows: number;     // effective, always present
  waccOverride: number | null;
};

/** As reported: every figure nullable, because a holding company has no revenue. */
type ReportedPeriod = { revenue: number | null; ebit: number | null; /* ... the rest, nullable */ };
type ReportedFiscalYear = ReportedPeriod & { fy: number; endDate: IsoDate };
type Financials = {
  ltm: ReportedPeriod | null;
  fiscalYears: NonEmpty<ReportedFiscalYear>;   // sorted oldest to newest
};

/** A period the math can use: revenue and EBIT are present by construction. */
type Period = { revenue: number; ebit: number; netIncome: number | null; ebitda: number | null;
                depreciationAmortization: number | null; ocf: number | null;
                capex: number | null; fcf: number | null };
type FiscalYear = Period & { fy: number; endDate: IsoDate };
type OperatingFinancials = { ltm: Period | null; fiscalYears: NonEmpty<FiscalYear> };

type Valuation =
  | { method: "dcf"; financials: OperatingFinancials; assumptions: DcfAssumptions;
      sensitivity: SensitivityAxes }
  | { method: "normalisedEarnings"; financials: OperatingFinancials;
      revenueBase: CyclicalRevenueBase; assumptions: CyclicalAssumptions }
  | { method: "nav"; holdings: NonEmpty<Holding>; parentNetDebt: number;
      lookThroughNav: number | null; assumptions: NavAssumptions };

type CyclicalRevenueBase =
  | { kind: "ltm"; period: Period }
  | { kind: "averageFy"; window: NonEmpty<FiscalYear> };

type Holding = { name: string; fairValue: number; basis: Basis };
```

`Company.financials` keeps nullable figures because a holding company's rows
genuinely lack revenue. `Valuation` carries `OperatingFinancials`, whose figures
are non-null, because decode has already rejected a `dcf` or
`normalised_earnings` thesis against rows that lack them. The same split applies
to `Holding.fairValue`: nullable in `Company.holdings`, required on the `nav`
branch.

`Valuation["method"]` is never given a named type alias. Closed string sets are
`as const` arrays in `src/domain/types.ts`; the input layer builds `z.enum()`
from them. Wire-only vocabularies (source kinds, tiers) live in the input layer.

The net debt convention: `total_debt - cash_and_equivalents - short_term_investments`,
with `short_term_investments` treated as `0` when null. Operating leases and
pension obligations are carried as `otherClaims` and appear in results beside
`netDebt`, so the advisor sees both; whether to treat them as debt is a
judgement the thesis does not yet express. See "Deferred".

## Math

Each module takes its own input type and knows nothing about the domain. The
formula comes from the textbook. Python is consulted only for which inputs the
analyst conventionally supplied.

| Module | Inputs from | Computes |
| --- | --- | --- |
| `wacc` | `Company` | cost of equity (CAPM with country premium), after-tax cost of debt, WACC; honours `waccOverride` |
| `reverse-dcf` | `Company` | the constant revenue growth over the horizon that makes DCF value equal the current price, holding the base period's EBIT margin, capex and D&A ratios and the computed WACC; `null` with a reason when no usable base period exists |
| `multiples` | `Company` | current P/E, EV/EBIT, EV/EBITDA, EV/revenue, P/B from derived figures; position of each against its historical band and the peer set |
| `fx` | `Company` | value per share under spot moves of ±5 %, ±10 % on each relevant pair, when `fx` is present |
| `dcf` | `Company` + `dcf` valuation | ten-year projection, terminal value by the chosen method, EV, equity value, value per share, terminal-value share of EV; the existing `computeDcf` |
| `sensitivity` | the `dcf` inputs + axes | value per share over the WACC × terminal-growth grid, with the base case at the centre |
| `normalised-earnings` | `Company` + `normalised_earnings` valuation | revenue base × margin × multiple → EV → equity → per share, for bear, base and bull; LTM margin as a comparison reference when present |
| `nav` | `Company` + `nav` valuation | sum of fair values, less parent net debt, less the warranted discount, per share; look-through NAV reported beside it when supplied |

`linearFade(from, to, years)` remains a shared helper for building paths.
`require_positive` and every other re-check inside the math disappears: inputs
arrive branded from decode and the math never re-validates.

### Selectors

Pure, total functions in `src/select/` from `Decoded` to each module's input.
Nothing between decode and math can fail; decode already rejected anything
that would make a selector partial. The DCF base period is `ltm ?? latest
fiscal year`, resolved here rather than in decode because `fiscalYears` is
`NonEmpty` and the fallback always lands; it records
`dcfBasePeriodFromFiscalYear`. Caller choices (a target price for a reverse
DCF variant, a different sensitivity grid) are selector arguments, never hidden
state.

## `results.json`

One shape regardless of what ran. Sections that could not run are `null` with
the reason in `resolutions`.

```
schema_version   "1.0"
inputs {
  ticker, facts_as_of, thesis_facts_as_of: date|null, classification: string|null
  company          the decoded Company, echoed, so the advisor reads one file
}
derived {
  market_cap, enterprise_value, net_debt, other_claims
  multiples   { pe_trailing, ev_ebit, ev_ebitda, ev_revenue, price_book: number|null each }
  wacc        { cost_of_equity, after_tax_cost_of_debt, wacc, overridden: boolean }
}
priced_in {
  reverse_dcf   { implied_growth, base_period: { kind, fy|null, end_date }, horizon_years } | null
  multiples     [{ metric, current, band_5y, band_10y, position: "below"|"within"|"above"|null,
                   peer_median: number|null }, ...]
}
valuation   null | one of:
  { method: "dcf", value_per_share, enterprise_value, equity_value, terminal_value,
    terminal_value_pct_of_ev, pv_explicit_period, projection: [YearRow × 10],
    terminal: { kind, ... }, notes: [...] }
  { method: "normalised_earnings", revenue_base: { kind, value, window|null },
    scenarios: { bear, base, bull: { ebit, ev, equity, value_per_share } },
    ltm_ebit_margin: number|null }
  { method: "nav", gross_asset_value, parent_net_debt, nav, discount_applied,
    value_per_share, look_through_nav: number|null, holdings: [...] }
sensitivity   { axes: { wacc: [...], terminal_growth: [...] }, grid: [[number]], base: [i, j] } | null
fx            [{ pair, moves: [{ pct, value_per_share }, ...] }, ...] | null
resolutions   [Resolution, ...]
warnings      [Warning, ...]
```

Nothing in results is a formatted sentence. The advisor turns resolutions and
warnings into prose; kosing does not.

## CLI

`src/cli.ts`, the only file that knows about files and streams.

```
kosing value --facts F [--thesis T]     results.json on stdout, exit 0
                                        DecodeError[] on stderr as JSON, exit 1
kosing schema facts | thesis            the generated JSON Schema on stdout
```

Nothing in `src/input/`, `src/domain/`, `src/select/`, `src/math/` or
`src/results/` imports `node:fs` or writes to a stream. The library is callable
in-process, which is how the tests call it and how a lambda would.

## Test strategy

Four layers, in the order they catch things. No layer reads anything from
`../invest`.

### Types

Impossible states cannot be constructed. The instrument is `@ts-expect-error`
on a line that must not compile: a thesis with two methods, a `FiscalYear`
without `fy`, an empty holdings list on the `nav` branch, a `Period` without
revenue. If such a line ever compiles, `tsc` reports the unused directive and
the build fails.

### Properties

Invariants the formulas imply, checked over deterministic grids. No generative
library: monotonicity, round-trips and symmetry do not need shrinking, and a
grid keeps the dependency count at zero. If a generative property is ever
wanted ("no thesis produces NaN"), `fast-check` is the tool, added then.

- DCF value is increasing in each growth-path entry and in terminal growth,
  decreasing in WACC, and continuous in all three.
- Reverse DCF round-trips: the growth it solves for, fed through forward DCF,
  recovers the price within 1e-9 relative.
- Sensitivity's grid has the base case at its centre and is monotone along each
  axis.
- Normalised earnings orders bear ≤ base ≤ bull whenever its inputs do.
- NAV is linear in holdings value and decreasing in the warranted discount.
- WACC lies between the after-tax cost of debt and the cost of equity.
- Unit rescaling is the identity for millions and exactly ÷1,000 and
  ÷1,000,000 otherwise.
- Price conversion is the identity when `price_currency === currency`.

### Worked examples

One published example per algorithm: stated inputs, stated answer, cited
source, tolerance matching the source's rounding. Candidates: the DCF article
on Wikipedia, Damodaran's worked spreadsheets for DCF, WACC and implied growth,
any textbook NAV example. This is the only layer that asserts an absolute
number, and the authority is never Python. The existing Nova golden, pinned to
Python's output, is deleted.

### Boundary

Hand-written `facts.json` and `thesis.json` fixtures under `tests/fixtures/`:
one valid pair per method and one for facts alone; one invalid fixture per
decode rule, each test asserting the rule name and the path. Plus the schema
round-trip: a valid fixture validates against the emitted JSON Schema (using
`ajv` in tests only), and a test lists exactly which wire-level rules the
emitted schema cannot express.

### End to end

One real name, with facts and thesis written by hand against a current report,
through `kosing value`, checked for shape. It proves the whole thing runs, and
it is the first worked example of what the researcher skill has to produce.

## Repository layout

```
src/
  input/              INPUT
    primitives.ts       Iso4217, IsoDateString, YearMonth, ScenarioTriple, TenNumberPath, RangeBand, SourceEntry
    facts.ts            FactsSchema and its blocks
    thesis.ts           ThesisSchema and the method union
    schema.ts           JSON Schema emission
    decode.ts           both documents to Decoded
    errors.ts           DecodeError, Resolution, Warning
  domain/             DOMAIN
    types.ts            Brand, Currency, IsoDate, NonEmpty, the as-const vocabularies
    company.ts          Company and its blocks
    financials.ts       Financials, Period, FiscalYear, OperatingFinancials
    valuation.ts        Valuation, CyclicalRevenueBase, Holding, the assumption types
  select/             DOMAIN to MATH, pure and total
    wacc.ts  reverse-dcf.ts  multiples.ts  fx.ts  dcf.ts  sensitivity.ts  normalised-earnings.ts  nav.ts
  math/               MATH, pure
    wacc.ts  reverse-dcf.ts  multiples.ts  fx.ts  dcf.ts  sensitivity.ts  normalised-earnings.ts  nav.ts
    linear-fade.ts
  results/
    assemble.ts         Decoded + math outputs to results.json
  cli.ts
  exhaustive.ts
  test-utils.ts
  index.ts
tests/
  fixtures/
    valid/              one facts + thesis pair per method, one facts alone
    invalid/            one per decode rule
```

Files are sized to their content. `Holding` is twenty lines used by one branch
and sits in `valuation.ts`; `financials.ts` earns its own file by being larger
and shared by two branches.

## What survives from the current repository

**As-is.** `src/domain/types.ts` minus `DeferredClassification`.
`src/exhaustive.ts`, `src/test-utils.ts`. The arithmetic in `dcf.ts` and
`wacc.ts`, which move to `src/math/` and lose their parse layers.

**Reshaped.** The three wire files written against the old schema
(`src/dossier/primitives.ts`, `financials.ts`, `market.ts`) are raw material for
`src/input/`: the primitives carry over, the fiscal-year row loses `is_ltm` and
its refinement, cost of capital and the balance sheet carry over with renamed
weights, market data loses its derived fields, the FX block is reshaped around
`price_currency`. The `dossier/` directory is retired with the word.

**Deleted.** `src/result.ts`, `src/validate.ts`, `src/dcf-parse.ts` and their
tests. `RevisionEntry`. The Nova golden. The plan
`docs/superpowers/plans/2026-10-07-kosing-wire-domain-decode.md` and its
`.superpowers` workspace. The superseded spec stays with a header pointing here,
because it records reasoning that still holds.

## Working split

Per `CLAUDE.md`: the user writes code whose writing is how the TypeScript gets
learned; Claude writes the mechanical remainder.

| Claude writes | The user writes |
| --- | --- |
| the Zod schemas from this spec | the domain model and its `@ts-expect-error` tests |
| JSON Schema emission | decode and the cross-document rules |
| fixtures, valid and invalid | selectors |
| the CLI | the math modules |
| property-test grids and harness | the property assertions |
| results assembly | worked-example lookups and their goldens |

Review runs both ways.

## Plans

Two plans from this spec, core first. The skills spec cannot start until plan 1
has emitted a schema for the researcher to target.

1. **Inputs and decode.** `src/input/`, `src/domain/`, `kosing schema`,
   fixtures, boundary tests. Done when a hand-written valid pair decodes into
   `Decoded` and every invalid fixture is rejected by rule name and path.
2. **Math, results, CLI.** The six remaining math modules, selectors,
   `src/results/`, `kosing value`, properties, worked examples, the end-to-end
   run. Done when the end-to-end test passes and the Nova golden is gone.

## Deferred, not rejected

- **Leases and pensions as debt.** `otherClaims` is reported beside `netDebt`
  and the thesis cannot yet say "treat leases as debt". When a name needs it,
  the thesis gains an `adjustments` block and decode folds the chosen claims
  into `netDebt`, recording a resolution.
- **A structured `gaps.field`.** It is a free string today. When the schema is
  stable, a test can assert each `field` is a real path in the document.
- **Multiple methods per thesis.** A cyclical with a DCF cross-check. The
  `Valuation` union becomes a non-empty set and results carries each. Not
  needed until the analyst skill wants it.
- **Non-company subjects.** The root union, when funds or certificates need
  pricing.
- **A `kosing screen` alias.** `kosing value --facts F` already is the screen.
  An alias is only worth adding if the skills find the distinction useful.

## Risks

- **The researcher skill is on the critical path and does not exist.** Until it
  is rewritten against the emitted schema, the only `facts.json` files are
  hand-written. Plan 1 ends with a schema; the skills spec starts there.
- **Textbook examples use simplified inputs.** A worked DCF from a textbook has
  one growth rate, not four ten-year paths. The golden exercises the formula;
  the properties exercise the paths. Neither alone is enough, which is why both
  layers exist.
- **Net debt convention.** Reasonable people fold leases in. The convention is
  stated, recorded in a resolution on every run, and the thesis will be able to
  override it. The risk is a valuation read without noticing which convention
  applied, which the resolution exists to prevent.
- **Dual-currency price conversion is new behaviour.** Python rejected the
  case. The property that conversion is the identity for a single currency
  protects the common path; the dual-listed path has a fixture and no corpus.
