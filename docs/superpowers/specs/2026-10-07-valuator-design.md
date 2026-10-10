# The valuator: inputs, math, results

Date: 2026-10-07
Status: approved design, not yet planned or implemented
Supersedes: `2026-10-07-kosing-decode-and-math-design.md`

## Purpose

Kosing is the investment workbench, replacing `invest` piece by piece until
nothing is left there. It is a funnel of four roles: a researcher, an analyst,
a valuator and an advisor. This spec covers the valuator, the one deterministic
role among four: what a researcher writes, what an analyst writes, the math
that runs over both, and what an advisor reads. The three AI roles and the
prose they draw on (wisdom, checklist, theses) migrate in later specs. Invest
is not modified on the way; it is abandoned.

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

An oracle that is not trusted is not an oracle. The algorithms the valuator implements
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
3. **The analyst** (AI) writes the case: which valuation applies and on what
   assumptions. A different job from research, with a different half-life: a
   case for SAP that rests on AI not disrupting it outlives many quarterly refreshes
   of SAP's price and guidance.
4. **The valuator** computes and outputs results. It takes the method as given
   and decides nothing. The only role that is not an AI.
5. **The advisor** (AI) reads the results against your wisdom, checklist and
   theses, and recommends.

A screen is step 2 alone: facts in, what-is-priced-in out. Full research adds
step 3. The valuator has no screen mode; it computes whatever the inputs it was given
support.

## Scope

In scope:

- `facts.json` and `case.json`, defined as Zod schemas with JSON Schema
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
- No revision bookkeeping. Facts and case are files under version control;
  git is the revision history. The `revision_history` block, `price_refresh`
  kinds, `fields_changed` lists and the `co_invalidation` check are gone.
- No `Money` type. Decode normalises everything to reporting currency,
  millions; the math is plain float arithmetic.
- No opinion in the core about what kind of company this is. Classification is
  an opinion the analyst writes and the advisor reads; the valuator validates the
  enum and never branches on it.

## Decisions

### Kosing owns the input format, and the JSON Schema is generated

Today `dossier.schema.json` is authoritative and hand-maintained, and consumers
mirror it in another language. Inverted: kosing's Zod schemas are the single
source of truth, and `kosing schema facts` / `kosing schema case` emit the
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

### Facts and case are two documents

Facts are what is observable about the company. The case is a judgement about
the company's future. They change for different reasons, and either can change
while the other stands still.

Facts move when the company reports: a new quarter, new guidance, a share
issue, a price. Waiting for an entry price is the common case: facts refresh
weekly, the case holds, the advisor re-reads new results against an unchanged
view.

The case moves when the world does, or when you do. Fukushima cut nuclear
construction across many countries in a week; nothing in any reactor builder's
accounts had changed. Russia's invasion of Ukraine repriced every defence name
before a single new contract was signed. A closed Strait of Hormuz changes what
the world expects to pay for oil in a day, and the oil companies are the same
companies with the same reserves. A case can also change because you changed
your mind about your own world view, with no event at all.

One document would couple two things with independent causes: a world event
would force re-emitting the facts, and a quarterly report would force
re-emitting the case, and a revision log would be needed to say which half
actually moved. Two files under version control record each change against the
cause that produced it.

The word "thesis" is reserved for something else: a world-view that is not
about any one company. "AI disruption is an overreaction for businesses with
high switching costs" covers SAP and ServiceNow both; SAP also rests on
"European digital sovereignty", ServiceNow on "long-run USD depreciation". Many
companies rest on one thesis; one company rests on many. A case therefore
*cites* the theses it rests on, by slug, and the valuator carries the citations
through to results without reading them. The theses themselves are prose for
the advisor, and the questions they enable ("which holdings are exposed if this
thesis is wrong?") belong to the advisor's spec.

### The case names the method; the math decides nothing

The old dossier said `primary_type: garp` and Python inferred "garp means DCF",
expecting a `base_dcf` block. Classification was doing two jobs: routing key for
the math and judgement about the company. Here the case says `method: dcf`
and supplies DCF assumptions; the type system makes a case with the wrong
assumptions unrepresentable. Classification survives as an opinion for the
advisor. The `methodFor` switch and `DeferredClassification` do not exist. A
bank has no case the math can run yet, which is a statement about the
tooling, not about the bank.

### Facts contain no derived numbers

Market cap, enterprise value and current multiples are arithmetic on other
facts, and the old dossier asked the model to perform it. The valuator derives; the
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

### Conventional JSON naming

Keys and enum values are camelCase: `totalDebt`, `sourceRefs`,
`normalisedEarnings`, `evEbit`. The old dossier used snake_case because Python
wrote and read it. Nothing in kosing does, and the TypeScript already names the
same things in camelCase, so carrying Python's convention into the format
would mean renaming at every boundary for no reason.


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
            facts.json               case.json
                |                         |
                +-----------+-------------+
                            |
   ======================= the valuator ========================
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
   ============================================================
                            |
                       results.json
                            |
                       advisor (AI)
```

Dependencies point one way. The arrows are functions at the boundary, not
imports crossing it.

## `facts.json`

Aggregate monetary figures (financial rows, the balance sheet, holdings,
estimates of revenue and EBIT) are in `currency` and `unit`. Per-share figures
are never scaled by `unit`, and come in two kinds: **quoted** figures (`price`,
the 52-week range, the historical share-price bands) are in `market.priceCurrency`,
the currency of the exchange the researcher read them from, and decode converts
them into `currency` through the spot rate; **reported** figures (`eps`) are in
`currency` already, because the company reports them. Share counts are always
millions and the field names say so. Percentages are fractions (`0.21`, not
`21`). Every block that reports something cites sources by id.

```
schemaVersion   "1.0"
company          { ticker, exchange, name, isin: string|null, country: AA }
asOf            date — when these facts were gathered
currency         ISO 4217 — reporting currency
unit             "millions" | "thousands" | "ones"

market {
  price                  number > 0
  priceCurrency         ISO 4217 — trading currency; equals `currency` unless dual-listed
  asOf                  date
  sharesOutstandingM   number >= 0
  sharesDilutedM       number >= 0 | null
  week52High            number >= 0 | null
  week52Low             number >= 0 | null
  sourceRefs            [id, ...] non-empty
}

financials {
  fiscalYears   [FiscalYearRow, ...] non-empty, any order; decode sorts
  ltm            LtmRow | null
  quarters       [QuarterRow, ...] | null
}
FiscalYearRow {
  fy             integer 1900..2200
  endDate       date
  revenue, ebit, netIncome, ebitda, depreciationAmortization,
  cogs, grossProfit, opex, interestExpense, taxExpense,
  ocf, capex, fcf, dividendsPaid                     number | null, each
  sharesBasicM, sharesDilutedM                     number >= 0 | null
  sourceRef     id
}
LtmRow      FiscalYearRow without `fy`
QuarterRow  { fq: /^[12][0-9]{3}Q[1-4]$/, endDate, revenue, ebit, netIncome,
              ocf, capex, fcf: number|null each, sourceRef }

balanceSheet {
  asOf                        date
  cashAndEquivalents         number
  shortTermInvestments       number | null
  totalDebt                   number >= 0
  shortTermDebt              number >= 0 | null
  longTermDebt               number >= 0 | null
  operatingLeaseLiabilities  number >= 0 | null
  pensionObligations          number | null
  goodwill                     number | null
  intangiblesExGoodwill      number | null
  totalEquity                 number | null
  sourceRef                   id
}

costOfCapital {
  riskFreeRate        number
  riskFreeBasis       string non-empty — e.g. "Swedish 10-year government bond"
  erp                   number >= 0 — the convention the researcher looked up
  countryPremium       number | null
  betaCompany          number | null
  betaSector           number | null
  taxRateEffective    0..1
  taxRateStatutory    0..1 | null
  pretaxCostOfDebt   number >= 0
  equityWeight         0..1
  debtWeight           0..1
  weightsAsOf         date
  sourceRefs           [id, ...] non-empty
}

historicalRanges {
  sharePrice   RangeBand
  peTrailing   RangeBand
  evEbit       RangeBand
  evEbitda     RangeBand
  priceBook    RangeBand
  sourceRefs   [id, ...] non-empty
} | null
RangeBand { y5Low, y5High, y10Low, y10High: number | null each }

peers [{
  name          string
  ticker        string | null
  peTrailing, evEbit, evEbitda, evRevenue   number | null each
  sourceRef    id
}, ...] | null

estimates [{
  fy            integer
  revenue, ebit, eps    number | null each
  sourceRef    id
}, ...] | null

holdings {
  items   [{ name, fairValue: number|null, basis: "listed"|"unlisted", sourceRef }, ...]
  parentNetDebt     number
  lookThroughNav    number | null
  sourceRefs         [id, ...] non-empty
} | null

fx {
  spotRates   [{ pair: /^[A-Z]{6}$/, rate: number > 0, asOf: date, sourceRef }, ...]
  exposures    [{ currency: ISO 4217, revenueShare: 0..1|null, costShare: 0..1|null }, ...]
} | null

sources [{
  id          /^S[0-9]+$/, unique within the document
  kind        "annualReport" | "interimReport" | "quarterlyReport" | "pressRelease"
              | "irPage" | "brokerEstimate" | "aggregator" | "regulator"
              | "macroReference" | "marketDataFeed"
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

- every `sourceRef` and every member of every `sourceRefs` resolves to a
  `sources[].id`;
- `fiscalYears[].fy` values are distinct;
- `equityWeight + debtWeight` is 1 within 1e-6;
- `priceCurrency` differing from `currency` requires an `fx.spotRates` entry
  for the pair in either direction.

## `case.json`

The case for investing in one company: which valuation applies, on what
assumptions, and which world-view theses it rests on. In code, `case` is a
reserved word, so the file is `case.ts`, the schema `CaseSchema`, the type
`Case`, and any variable `investmentCase`.

```
schemaVersion    "1.0"
ticker            string — must equal facts.company.ticker
factsAsOf       date | null — the facts snapshot this was written against
classification    "qualityCompounder" | "garp" | "valueCyclical" | "holdingCompany"
                  | "bankInsurer" | "reitUtility" | "saasPreProfit"
                  | "commodityProducer" | "specialSituation"
                  — an opinion for the advisor; the valuator validates it and never reads it
theses            [slug, ...] — the world-view theses this case rests on, e.g.
                  ["ai-disruption-overreaction", "eu-digital-sovereignty"]; may be empty;
                  the valuator validates the shape and passes it through, never resolves it

method   one of:
  {
    kind                        "dcf"
    revenueGrowthPath         [number × 10]
    ebitMarginPath            [number × 10]
    capexPctRevenuePath      [number × 10]
    daPctRevenuePath         [number × 10]
    workingCapitalPctRevenue number
    terminal                    { kind: "perpetuityGrowth", growth: number, basis: string }
                              | { kind: "exitMultiple", multiple: number > 0,
                                  on: "evEbit" | "evEbitda" | "evFcff", basis: string }
    rationale                   string non-empty
    sourceRefs                 [id, ...] — ids in facts.sources
  }
  {
    kind                "normalisedEarnings"
    revenueBase        { kind: "ltm" } | { kind: "averageFy", years: integer >= 1 }
    ebitMargin         { bear, base, bull }
    evEbitMultiple    { bear, base, bull }
    multipleCeiling    number | null
    rationale           string non-empty
    sourceRefs         [id, ...]
  }
  {
    kind                "nav"
    warrantedDiscount  0..0.9
    rationale           string non-empty
    sourceRefs         [id, ...]
  }

overrides {
  beta        number | null
  wacc        number | null — replaces the computed WACC outright
  rationale   string | null — required when either is non-null
}

sensitivity {
  waccSteps              [number, ...] — absolute deltas around the computed WACC, e.g. [-0.01, -0.005, 0, 0.005, 0.01]
  terminalGrowthSteps   [number, ...] — likewise; only meaningful for perpetuity growth
} | null — null means the default grid of ±1pp / ±0.5pp
```

Wire-level rules:

- `bear <= base <= bull` on each scenario triple;
- no scenario multiple above `multipleCeiling` when it is set;
- `overrides.rationale` is non-null when either override is;
- `sensitivity` steps each contain `0`;
- `overrides` are all null and `sensitivity` is null unless `method.kind` is
  `dcf`: only a DCF discounts, so only a DCF can have its discount rate
  overridden or swept.

The `terminal` union matches what `src/dcf.ts` already computes:
`perpetuityGrowth` and `exitMultiple` over `evEbit | evEbitda | evFcff`.

## Decode

`decode(facts: unknown, investmentCase: unknown | undefined)` parses each document with
its schema, maps every Zod issue to a `DecodeError` naming the file and the
dotted path, then builds the domain. It returns

```ts
type Decoded = {
  company: Company;              // from facts alone; always constructible from valid facts
  valuation: Valuation | null;   // from facts + case; null when no case was given
  classification: Classification | null;  // passed through for the advisor
  caseFactsAsOf: IsoDate | null;          // echoed in results
  theses: readonly string[];              // passed through for the advisor; empty without a case
  resolutions: Resolution[];
  warnings: Warning[];
};

decode(facts, investmentCase): Result<Decoded, DecodeError[]>

type DecodeError = {
  file: "facts" | "case";
  layer: "schema" | "semantic";
  rule: string;       // "schema.violation", "semantic.holdingWithoutValue"
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
| `betaFromSector` | `betaCompany` is null and `betaSector` is not |
| `betaOverridden` | `overrides.beta` is set |
| `waccOverridden` | `overrides.wacc` is set |
| `sharesFromOutstanding` | `sharesDilutedM` is null |
| `taxRateFromEffective` | `taxRateStatutory` is null; the discounting rate falls back |
| `unitRescaled` | `unit` is `thousands` or `ones`; carries the factor and the row count |
| `priceConvertedToReporting` | `priceCurrency` differs from `currency`; carries the pair and rate used |
| `netDebtDerived` | always; carries the components used, so the convention is visible |
| `revenueBaseFromLtm` | normalised earnings with the `ltm` policy |
| `revenueBaseAveraged` | normalised earnings with `averageFy`; carries the window |
| `dcfBasePeriodFromFiscalYear` | the DCF selector used the latest fiscal year because `ltm` is null |
| `reverseDcfUnavailable` | no usable base period exists, meaning none with non-null revenue, EBIT, capex and depreciationAmortization, which a projection needs; carries one of `noUsableBasePeriod`, `terminalGrowthNotBelowWacc`, `noGrowthInBracketMatchesPrice` |
| `dcfUnavailable` | the case's terminal growth is not below the WACC that applies; carries the reason |
| `fxUnavailable` | facts carry `fx` but there is no DCF valuation to revalue |

Share count fallback and beta fallback use explicit null checks, never `||`. A
share count of `0` is a share count.

### Cross-document rules

Each is a `semantic.*` error. Together they are the reason the domain's
`Valuation` can require what the wire leaves nullable.

| Rule | Requires |
| --- | --- |
| `semantic.tickerMismatch` | `case.ticker === facts.company.ticker` |
| `semantic.noBeta` | a non-null beta from `betaCompany` or `betaSector`; an override replaces a beta, it cannot stand in for none, because the screen needs one with no case present |
| `semantic.periodMissingFigure` | for `dcf` and `normalisedEarnings`: every fiscal year and the LTM row, if present, has non-null `revenue` and `ebit` |
| `semantic.revenueBaseUnsatisfiable` | `ltm` policy with `financials.ltm` present; `averageFy(n)` with at least `n` fiscal years |
| `semantic.navRequiresHoldings` | `nav` with `facts.holdings` non-null and `items` non-empty |
| `semantic.holdingWithoutValue` | every holding has a non-null `fairValue`; the error names the holding |
| `semantic.zeroShares` | the resolved share count is not 0; the error names the field that supplied it |
| `semantic.sourceRef` | every `sourceRefs` entry in the case resolves in `facts.sources` |

### Warnings

Advisory, never fatal, computed over the decoded `Company` with fixed paths.

| Rule | Fires when |
| --- | --- |
| `casePredatesFacts` | `case.factsAsOf` is set and earlier than `facts.asOf` |
| `ltmOlderThanFiscalYear` | `financials.ltm.endDate` is earlier than the latest fiscal year's `endDate` |

Python's `rf_basis_consistency` warning (a substring heuristic matching
`risk_free_basis` against a per-currency table of country hints) is not
carried over. The advisor is the only reader of warnings, and a heuristic it
did not ask for is more likely to mislead than to help; if it wants one, the
advisor's spec defines it.

## Domain model

```ts
type Company = {
  identity: Identity;              // ticker, exchange, name, isin, country
  currency: Currency;              // one, for everything below
  asOf: IsoDate;
  market: Market;                  // price in reporting currency, shares resolved, 52w range
  financials: Financials;          // rows with nullable figures; a holdco has no revenue
  balanceSheet: BalanceSheet;
  netDebt: number;                 // derived: totalDebt - cash - shortTermInvestments
  otherClaims: OtherClaims;        // leases, pensions, reported separately, not in netDebt
  costOfCapital: CostOfCapital;    // from facts alone: beta resolved, both tax rates, no overrides
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
};

/** As reported: every figure nullable, because a holding company has no revenue. */
type ReportedPeriod = { revenue: number | null; ebit: number | null; /* ... the rest, nullable */ };
type ReportedFiscalYear = ReportedPeriod & { fy: number; endDate: IsoDate };
type ReportedLtm = ReportedPeriod & { endDate: IsoDate };   // dated, so the staleness warning can compare it
type Financials = {
  ltm: ReportedLtm | null;
  fiscalYears: NonEmpty<ReportedFiscalYear>;   // sorted oldest to newest
};

/** A period the math can use: revenue and EBIT are present by construction. */
type Period = { revenue: number; ebit: number; netIncome: number | null; ebitda: number | null;
                depreciationAmortization: number | null; ocf: number | null;
                capex: number | null; fcf: number | null };
type FiscalYear = Period & { fy: number; endDate: IsoDate };
type OperatingLtm = Period & { endDate: IsoDate };
type OperatingFinancials = { ltm: OperatingLtm | null; fiscalYears: NonEmpty<FiscalYear> };

type Valuation =
  | { method: "dcf"; financials: OperatingFinancials; assumptions: DcfAssumptions;
      costOfCapital: CostOfCapital;    // facts' cost of capital with overrides.beta applied
      waccOverride: number | null;     // overrides.wacc, replacing the computed WACC outright
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
`normalisedEarnings` case against rows that lack them. The same split applies
to `Holding.fairValue`: nullable in `Company.holdings`, required on the `nav`
branch.

`Valuation["method"]` is never given a named type alias. Closed string sets are
`as const` arrays in `src/domain/types.ts`; the input layer builds `z.enum()`
from them. Wire-only vocabularies (source kinds, tiers) live in the input layer.

The net debt convention: `totalDebt - cashAndEquivalents - shortTermInvestments`,
with `shortTermInvestments` treated as `0` when null. Operating leases and
pension obligations are carried as `otherClaims` and appear in results beside
`netDebt`, so the advisor sees both; whether to treat them as debt is a
judgement the case does not yet express. See "Deferred".

## Math

Each module takes its own input type and knows nothing about the domain. The
formula comes from the textbook. Python is consulted only for which inputs the
analyst conventionally supplied.

| Module | Inputs from | Computes |
| --- | --- | --- |
| `wacc` | `Company`, or the `dcf` branch's cost of capital | cost of equity (CAPM with country premium), after-tax cost of debt, WACC; the `dcf` branch's `waccOverride` replaces the result |
| `reverse-dcf` | `Company` | the constant revenue growth over the horizon that makes DCF value equal the current price, holding the base period's EBIT margin, capex and D&A ratios and the computed WACC; `null` with a reason when no usable base period exists; horizon and terminal growth are selector options echoed in results; unsolvable with a reason when the bracket [-0.5, 1.0] does not straddle the price |
| `multiples` | `Company` | current P/E, EV/EBIT, EV/EBITDA, EV/revenue, P/B from derived figures; position of each against its historical band and the peer set |
| `fx` | `Company` + the `dcf` valuation's inputs | value per share under spot moves of ±5 %, ±10 % on each exposure in a currency other than the reporting one, as a translation shock through the DCF; `null` with `fxUnavailable` when there is no DCF valuation |
| `dcf` | `Company` + `dcf` valuation | ten-year projection, terminal value by the chosen method, EV, equity value, value per share, terminal-value share of EV; terminal value reported both undiscounted and at present value; a typed `undefined` outcome when terminal growth is not below WACC |
| `sensitivity` | the `dcf` inputs + axes | value per share over the WACC × terminal-growth grid, with the base case at the centre; cells the Gordon formula cannot define are `null`; with an exit-multiple terminal the growth axis is `null` and the grid is n × 1 |
| `normalised-earnings` | `Company` + `normalisedEarnings` valuation | revenue base × margin × multiple → EV → equity → per share, for bear, base and bull; LTM margin as a comparison reference when present |
| `nav` | `Company` + `nav` valuation | sum of fair values, less parent net debt, less the warranted discount, per share; look-through NAV reported beside it when supplied |

No shared path helper exists yet; the case supplies ten-number paths and the reverse DCF uses constant growth.
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
schemaVersion   "1.0"
inputs {
  ticker, factsAsOf, caseFactsAsOf: date|null, classification: string|null, theses: [slug, ...]
  company          the decoded Company, echoed, so the advisor reads one file
}
derived {
  marketCap, enterpriseValue, netDebt, otherClaims
  multiples   { peTrailing, evEbit, evEbitda, evRevenue, priceBook: number|null each }
  wacc        { costOfEquity, afterTaxCostOfDebt, wacc }   — from facts alone, never overridden
}
pricedIn {
  reverseDcf   { impliedGrowth, basePeriod: { kind: "ltm"|"fiscalYear", fy: number|null, endDate },
                 horizonYears, terminalGrowth } | null
  multiples     [{ metric, current, band5y, band10y, position: "below"|"within"|"above"|null,
                   peerMedian: number|null }, ...]
}
valuation   null | one of:
  { method: "dcf", basePeriod, wacc: { costOfEquity, afterTaxCostOfDebt, wacc, overridden: boolean },
    valuePerShare, enterpriseValue, equityValue, terminalValue, pvTerminalValue,
    terminalValuePctOfEv, pvExplicitPeriod, projection: [YearRow × 10],
    terminal: { kind, ... }, notes: [...] }
  { method: "normalisedEarnings", revenueBase: { kind, value, window|null },
    scenarios: { bear, base, bull: { ebit, ev, equity, valuePerShare } },
    ltmEbitMargin: number|null }
  { method: "nav", grossAssetValue, parentNetDebt, nav, discountApplied,
    valuePerShare, lookThroughNav: number|null, holdings: [...] }
sensitivity   { axes: { wacc: [...], terminalGrowth: [...] | null }, grid: [[number | null]], base: [i, j] } | null
fx            [{ pair, moves: [{ pct, valuePerShare: number | null }, ...] }, ...] | null
              — null without fx or without a DCF valuation; [] with fx but no relevant exposure
resolutions   [Resolution, ...]
warnings      [Warning, ...]
```

Nothing in results is a formatted sentence. The advisor turns resolutions and
warnings into prose; the valuator does not.

## CLI

`src/cli.ts`, the only file that knows about files and streams.

```
kosing value --facts F [--case C]     results.json on stdout, exit 0
                                        DecodeError[] on stderr as JSON, exit 1
kosing schema facts | case            the generated JSON Schema on stdout
```

Nothing in `src/input/`, `src/domain/`, `src/select/`, `src/math/` or
`src/results/` imports `node:fs` or writes to a stream. The library is callable
in-process, which is how the tests call it and how a lambda would.

## Test strategy

Four layers, in the order they catch things. No layer reads anything from
`../invest`.

### Types

Impossible states cannot be constructed. The instrument is `@ts-expect-error`
on a line that must not compile: a case with two methods, a `FiscalYear`
without `fy`, an empty holdings list on the `nav` branch, a `Period` without
revenue. If such a line ever compiles, `tsc` reports the unused directive and
the build fails.

### Properties

Invariants the formulas imply, checked over deterministic grids. No generative
library: monotonicity, round-trips and symmetry do not need shrinking, and a
grid keeps the dependency count at zero. If a generative property is ever
wanted ("no case produces NaN"), `fast-check` is the tool, added then.

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

Hand-written `facts.json` and `case.json` fixtures under `tests/fixtures/`:
one valid pair per method and one for facts alone; one invalid fixture per
decode rule, each test asserting the rule name and the path. Plus the schema
round-trip: a valid fixture validates against the emitted JSON Schema (using
`ajv` in tests only), and a test lists exactly which wire-level rules the
emitted schema cannot express.

### End to end

One real name, with facts and case written by hand against a current report,
through `kosing value`, checked for shape. It proves the whole thing runs, and
it is the first worked example of what the researcher skill has to produce.

## Repository layout

```
src/
  input/              INPUT
    primitives.ts       Iso4217, IsoDateString, YearMonth, ScenarioTriple, TenNumberPath, RangeBand, SourceEntry
    facts.ts            FactsSchema and its blocks
    case.ts           CaseSchema and the method union
    schema.ts           JSON Schema emission
    decode.ts           both documents to Decoded
    errors.ts           DecodeError, Resolution, Warning
  domain/             DOMAIN
    types.ts            Brand, Currency, IsoDate, NonEmpty, the as-const vocabularies
    company.ts          Company and its blocks
    financials.ts       Financials, Period, FiscalYear, OperatingFinancials
    valuation.ts        Valuation, CyclicalRevenueBase, Holding, the assumption types
  select/             DOMAIN to MATH, pure and total
    base-period.ts  wacc.ts  derived.ts  multiples.ts  reverse-dcf.ts
    dcf.ts (with sensitivity)  normalised-earnings.ts  nav.ts  fx.ts
  math/               MATH, pure, own input types
    wacc.ts  dcf.ts  reverse-dcf.ts  sensitivity.ts  multiples.ts
    normalised-earnings.ts  nav.ts  fx.ts
  results/
    types.ts            Results and its sections, ValuatorOptions
    priced-in.ts        multiples rows, reverse DCF section
    assemble.ts         Decoded + options to results.json
  valuate.ts          facts + case to results, in-process
  cli.ts
  cli.e2e.test.ts     spawns the real process
  exhaustive.ts
  test-utils.ts
  index.ts
tests/
  fixtures/
    valid/              one facts + case pair per method, one facts alone
    invalid/            one per decode rule
```

Files are sized to their content. `Holding` is twenty lines used by one branch
and sits in `valuation.ts`; `financials.ts` earns its own file by being larger
and shared by two branches.

## What survives from the current repository

**As-is.** `src/domain/types.ts` minus `DeferredClassification`.
`src/exhaustive.ts`, `src/test-utils.ts`. The arithmetic in `dcf.ts` and
`wacc.ts` moved to `src/math/` and lost its parse layers (plan 2).

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

Claude writes the code; the user reviews at checkpoints, approves and gives
feedback. The goal is a working, reliable core as soon as possible. Rulings
made where the spec or a plan is silent are recorded in the plan's ledger and
surfaced at the next checkpoint. Review runs both ways: the user reads what
was built, and Claude says what it is unsure of.

## Plans

Two plans from this spec, core first. The skills spec cannot start until plan 1
has emitted a schema for the researcher to target.

1. **Inputs and decode.** Done: `docs/superpowers/plans/2026-10-08-valuator-inputs-and-decode.md`. `src/input/`, `src/domain/`, `kosing schema`,
   fixtures, boundary tests. Done when a hand-written valid pair decodes into
   `Decoded` and every invalid fixture is rejected by rule name and path.
2. **Math, results, CLI.** Done: `docs/superpowers/plans/2026-10-10-valuator-math-and-results.md`. The six remaining math modules, selectors,
   `src/results/`, `kosing value`, properties, worked examples, the end-to-end
   run. Done when the end-to-end test passes and the Nova golden is gone.

## Deferred, not rejected

- **Thesis documents and the queries over them.** A case cites theses by slug;
  nothing yet defines a thesis document, checks that a slug resolves, or asks
  which cases rest on a given thesis. All three belong to the advisor's spec,
  since the advisor is the only reader.
- **Leases and pensions as debt.** `otherClaims` is reported beside `netDebt`
  and the case cannot yet say "treat leases as debt". When a name needs it,
  the case gains an `adjustments` block and decode folds the chosen claims
  into `netDebt`, recording a resolution.
- **A structured `gaps.field`.** It is a free string today. When the schema is
  stable, a test can assert each `field` is a real path in the document.
- **Multiple methods per case.** A cyclical with a DCF cross-check. The
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
  stated, recorded in a resolution on every run, and the case will be able to
  override it. The risk is a valuation read without noticing which convention
  applied, which the resolution exists to prevent.
- **Dual-currency price conversion is new behaviour.** Python rejected the
  case. The property that conversion is the identity for a single currency
  protects the common path; the dual-listed path has a fixture and no corpus.
