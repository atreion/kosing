# The documents

Each company has five documents. Three are JSON that the valuator reads or
writes; two are prose for a person to read.

| Document | Written by | Holds |
|---|---|---|
| `facts.json` | researcher | What is observable: reported figures, price, debt, cost-of-capital inputs, sources |
| `research.md` | researcher | The business described: model, moat, management, risks |
| `case.json` | analyst | What is believed about the future: the valuation assumptions and their reasons |
| `results.json` | valuator | Every computed number |
| `advice.md` | analyst | The verdict, the reasoning and the tests for the next report |

## Facts and case

The most important line in Kosing's design is the one between the facts and
the case.

**The facts are what anyone could look up.** Revenue last year, the share
count, the bond yield, the published beta. Two careful people researching the
same company on the same day should produce nearly the same facts. Every
figure cites a source; nothing is estimated, computed or opinionated. When
something cannot be sourced, it is null, and the `gaps` list says why.

**The case is what the analyst believes.** Revenue growth for the next ten
years, where margins settle, what a bad outcome looks like. Two careful people
can disagree about every number in it, and the disagreement is the point:
every assumption carries a written rationale, so you can see where you would
differ and why.

Keeping them apart does four things:

- **Disagreement is about the right thing.** If you think the value is wrong,
  you can tell whether you dispute a fact (fixable by checking the source) or
  a belief (a matter of judgement).
- **Opinions do not leak into data.** A researcher who already likes the stock
  cannot nudge an "adjusted" figure into the facts, because the facts take
  reported figures and say which basis they are on.
- **Facts can be refreshed without rethinking.** A new price updates the facts
  only. The valuator reruns on the same case, and the entry price moves only if
  the beliefs do.
- **The case records what it was written against.** `factsAsOf` names the
  facts it was built on, and the valuator warns when newer facts arrive.

## The schemas

Both input documents have a JSON Schema, printed by `kosing schema facts` and
`kosing schema case`. The schema is the contract: the researcher and analyst
read it before writing, and the descriptions in it carry the conventions
(which beta, which tax rate, how to sign a cash outflow).

Some rules cannot be expressed in JSON Schema, so the valuator enforces them
when it decodes: source ids are unique and every reference resolves; fiscal
years are distinct; capital-structure weights sum to one; bear ≤ base ≤ bull;
excess return is used for banks and insurers, and only for them. A document that breaks a rule is
rejected with the path of each bad field, rather than producing a number from
bad input.

### Conventions worth knowing

- **Units.** `unit` (usually millions) applies to every aggregate figure. Share
  counts are always in millions, and per-share figures and prices are never
  scaled.
- **Percentages are fractions.** 7% is written `0.07`.
- **Signs follow the statements.** Capital spending, tax and dividends paid are
  negative, as the cash-flow statement shows them. The case writes capex as a
  positive share of revenue.
- **Currencies.** `currency` is the reporting currency. The price can be in a
  different one (`priceCurrency`), and then the facts must carry the exchange
  rate.

## facts.json

| Section | What it holds |
|---|---|
| `company`, `asOf`, `currency`, `unit` | Identity, the period end of the latest report reflected, and units |
| `market` | Price and its date, shares outstanding and diluted, 52-week range |
| `financials` | Fiscal years, the last twelve months (LTM) and quarters: revenue, EBIT, EBITDA, net income, D&A, cash flow, capex, free cash flow, dividends |
| `balanceSheet` | Cash, debt, leases, pensions, goodwill and intangibles, equity |
| `costOfCapital` | Risk-free rate, equity risk premium, country premium, company and sector beta, tax rates, cost of debt, capital weights (see [Cost of capital](cost-of-capital.md)) |
| `historicalRanges` | Where the valuation multiples have traded over five and ten years |
| `peers` | Comparable companies and their multiples |
| `estimates` | Analyst consensus, marked as reported or adjusted basis |
| `holdings` | For a holding company, the stakes it owns and their fair values |
| `fx` | Spot rates, and which currencies the company earns and spends in |
| `financialInstitution` | Banks and insurers only: tangible book, capital ratios, net interest income and its rate sensitivity, credit losses, combined ratio |
| `sources` | Every document cited, with a tier: primary (the company or regulator), secondary (brokers, consensus) or tertiary (aggregators) |
| `gaps` | Every null field and why it is null |

`asOf` is the end of the reporting period, not the day the report came out,
and it does not move on a price refresh. `market.asOf` is the price's date.

**LTM**, the last twelve months, is built from the latest quarterly or
half-year report: the last full year, plus this year to date, less the same
period last year. It is the freshest full-year picture, and when it exists it
is the starting point for the valuation.

## case.json

| Field | What it holds |
|---|---|
| `factsAsOf` | The facts' `asOf` the case was written against |
| `classification` | The kind of company, which decides the method |
| `aiExposure` | The strongest channel of exposure to the AI cycle |
| `method` | The method and its assumptions, scenarios, rationale and sources |
| `overrides` | A replacement beta, WACC or tax rate, each with a reason; DCF only |
| `sensitivity` | Custom steps for the sensitivity grid, or null for the default |

The classification and its method. Only the bank-and-insurer pairing is
enforced by the valuator; the rest is the analyst's convention, stated in the
schema:

| Classification | Method |
|---|---|
| `qualityCompounder`, `garp` | `dcf` |
| `valueCyclical` | `normalisedEarnings` |
| `holdingCompany` | `nav` |
| `bankInsurer` | `excessReturn` |
| `commodityProducer` | `nav` with at least one `mine` part |
| `specialSituation` | any of `dcf`, `normalisedEarnings`, `nav` |
| `reitUtility`, `saasPreProfit` | none; no case is written |

The AI-cycle exposure levels, from most to least exposed: `direct` (revenue
depends on AI compute or model economics), `picksAndShovels` (a material share
comes from data-centre spending), `wealthEffect` (demand from customers'
investment gains), `disruption` (AI could replace the product or squeeze its
pricing), and `secondOrderOnly` (only the general recession channel).

The methods and their assumptions are described in
[The valuation math](valuation.md).

> [!NOTE]
> "Case" has two meanings in Kosing. **The case** is this document,
> `case.json`, with all its assumptions. A **bear, base or bull case** is one
> of the scenarios inside it; the code calls those scenarios. The **base case**
> is the analyst's most likely outcome, and its value is the **base value**
> that the entry price is computed from.

## results.json

| Section | What it holds |
|---|---|
| `inputs` | What was valued, on what date, against which facts and case |
| `derived` | Market capitalisation, enterprise value, net debt, current multiples, WACC |
| `pricedIn` | What the price implies: reverse DCF growth, implied return on tangible equity for a bank, multiples against their history and peers |
| `valuation` | The method's output: value per share, the projection year by year, terminal value, scenarios, and the value on the alternative beta |
| `hurdle` | Required discount, base value, entry price, price, and whether the price clears it |
| `sensitivity` | Value per share over a grid of discount rates and terminal growth rates |
| `fx` | Value per share if each exposed currency moved 5% or 10% |
| `resolutions` | How the valuator filled in something not given directly, for example "beta taken from the sector" or "net debt derived from debt less cash" |
| `warnings` | Things that look wrong: a stale price, a case older than the facts, a bank close to its capital requirement |

`resolutions` and `warnings` are worth reading every time. A resolution is the
valuator telling you which of two possible inputs it used; a warning is it
telling you not to trust the result until you have looked.

## research.md and advice.md

These are prose, with a light structure, and cite the same source ids as the
facts.

`research.md` describes; it does not recommend. It covers how the business
makes money, the moat and competition, management, customers, risks and
AI-cycle exposure, and it explains any figure in the facts that needed a
judgement call (which share count, which segment, why one source over
another).

`advice.md` leads with the verdict, conviction, entry price and price, then
gives the analysis: a short explanation of the business, the values, what the
price implies, the lenses, what would change the verdict, and dated tests for
the next report.
