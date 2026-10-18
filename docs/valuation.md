# The valuation math

Everything on this page is done by the valuator, in code, from `facts.json`
and `case.json`. The analyst chooses the assumptions; the code does the
arithmetic. Each section says what a number is, how it is computed, and what
to do with it.

The method depends on the company's classification:

| Method | For | Idea |
|---|---|---|
| [DCF](#discounted-cash-flow-dcf) | Compounders, growth at a reasonable price | Present value of future free cash flow |
| [Normalised earnings](#cyclicals-normalised-earnings) | Cyclicals | Mid-cycle profit times a fair multiple |
| [NAV](#holding-companies-nav) | Holding companies | Sum of the parts, less the holding company's own debt |
| [Excess return](#banks-and-insurers-excess-return) | Banks and insurers | Book equity plus the value of earning more on it than shareholders require |

Whatever the method, the valuator also runs a
[reverse DCF](#reverse-dcf-what-the-price-implies) where the facts allow one
(banks get an implied return instead) and computes
[multiples](#multiples), and every method ends in the
[required discount](#the-required-discount).

## Discounted cash flow (DCF)

### The projection

The DCF projects ten years. It starts from the **base period**, the last
twelve months if reported, else the latest fiscal year, and each year applies
the case's assumptions:

```
revenue      = last year's revenue × (1 + revenue growth)
EBIT         = revenue × EBIT margin
NOPAT        = EBIT × (1 − tax rate)
D&A          = revenue × D&A share of revenue
capex        = revenue × capex share of revenue
Δ working capital = working-capital share × (revenue − last year's revenue)

FCFF         = NOPAT + D&A − capex − Δ working capital
```

What each line means:

- **EBIT** (earnings before interest and tax) is operating profit: what the
  business earns before paying lenders and the tax authority. The margin path
  is where most of the analyst's view of competitive position shows.
- **NOPAT** (net operating profit after tax) is EBIT less the tax the business
  would pay with no debt. Debt is dealt with in the discount rate and the
  equity bridge, not here.
- **D&A** (depreciation and amortisation) is added back because it is an
  accounting charge, not a cash payment.
- **Capex** (capital expenditure) is subtracted because it is cash spent on
  the assets the business needs. Over the long run D&A and capex should be
  close for a business that is not growing; capex well above D&A means the
  business is investing to grow.
- **Working capital** is the cash tied up in stock and in customers who have
  not yet paid, less what is owed to suppliers. Growth usually ties up more of
  it. Some businesses (subscriptions billed in advance) receive cash before
  they deliver, and growth releases cash instead; their working-capital share
  is negative.
- **FCFF**, free cash flow to the firm, is what is left for both shareholders
  and lenders after the business has paid for everything it needs to keep
  operating and growing.

Each year's FCFF is divided by `(1 + WACC)^year` to give its present value.
Cash is assumed to arrive at the end of each year.

> [!NOTE]
> The **base period** is the latest reported year the projection starts
> from. It has nothing to do with the **base case**, the middle of the bear,
> base and bull scenarios. Every scenario starts from the same base period.

Acme's first year, from LTM revenue of SEK 11,400m:

| | SEK m | |
|---|---|---|
| Revenue | 12,198 | 11,400 × 1.07 |
| EBIT | 1,464 | 12% margin |
| NOPAT | 1,156 | after 21% tax |
| + D&A | 403 | 3.3% of revenue |
| − Capex | 488 | 4% of revenue |
| − Δ working capital | 80 | 10% of the SEK 798m revenue increase |
| **FCFF** | **991** | |
| Present value at 8.01% | 918 | × 0.926 |

The ten years' present values sum to SEK 8,977m.

### Terminal value

A business does not stop after ten years. The **terminal value** stands for
everything after the projection. Kosing offers two ways to compute it.

**Perpetuity growth** (the Gordon formula) assumes the final year's free cash
flow grows at a constant rate forever:

```
terminal value = FCFF in year 10 × (1 + g) / (WACC − g)
```

The terminal growth rate `g` should not exceed long-run nominal growth of the
economy, around 2% to 3% in Europe; otherwise the company would eventually be
bigger than the economy. It must be below the WACC, or the formula has no
answer. Watch the denominator: with WACC at 8% and growth at 2%, it is 6%; at
3% growth it is 5%, and the terminal value rises by a fifth.

**Exit multiple** assumes the business could be sold at the end of year ten at
a multiple of its EBIT, EBITDA or FCFF. It is simpler, but it imports
whatever the market is paying today into a value meant to be independent of
the market.

The terminal value is discounted with year ten's factor. For Acme:

```
terminal value = 1,721 × 1.02 / (8.01% − 2%) = 29,203
present value  = 29,203 × 0.463           = 13,511
```

`terminalValuePctOfEv` reports the terminal's share of the enterprise value.
For Acme it is 60%: most of the value lies beyond the years forecast in
detail, which is normal. Above 75% the valuator adds the note
`terminalValueDominates`. At that point the value is mostly a claim about the
very long run, and the ten-year projection is decoration.

### From enterprise value to a share

```
enterprise value = present value of ten years + present value of terminal
equity value     = enterprise value − net debt
value per share  = equity value / shares
```

The **enterprise value** (EV) is the value of the whole business, to lenders
and shareholders together. **Net debt** is interest-bearing debt less cash and
short-term investments; it is the lenders' claim, so it is subtracted to leave
the shareholders' part. A company with more cash than debt has negative net
debt, which adds to equity value.

Shares are diluted shares when the facts give them (counting options and
convertibles that would become shares), else shares outstanding.

Two claims are handled specially. **Lease liabilities** are not subtracted in a
DCF, so the case puts lease payments into its capex path instead; counting
them both ways would deduct them twice. **Pension deficits** are not
subtracted automatically; when one is material, the case says so in its
rationale.

For Acme:

```
enterprise value = 8,977 + 13,511   = 22,488
equity value     = 22,488 − 2,000   = 20,488
value per share  = 20,488 / 115     = SEK 178
```

The price is SEK 212. On this case, the market values Acme about a fifth
higher than the analyst does.

### Bear and bull

The bear and bull scenarios replace the revenue growth and margin paths and
keep everything else: the WACC, capex, D&A, working capital and terminal
assumptions. This keeps the scenarios about the business, not about the
discount rate. `results.json` gives each scenario's value per share and
enterprise value.

Read the bear value as the price at which you would be safe even if the bad
case happened. A price below the bear value is rare and usually worth acting
on.

### Sensitivity

The sensitivity grid recomputes the value for a range of WACCs and terminal
growth rates around the base case's own WACC and terminal growth, by default half and one
percentage point either way. Acme:

| WACC \ terminal growth | 1.0% | 1.5% | 2.0% | 2.5% | 3.0% |
|---|---|---|---|---|---|
| 7.0% | 192 | 205 | 219 | 237 | 260 |
| 7.5% | 175 | 185 | 197 | 211 | 228 |
| **8.0%** | 160 | 169 | **178** | 189 | 203 |
| 8.5% | 148 | 154 | 162 | 171 | 182 |
| 9.0% | 137 | 142 | 149 | 156 | 165 |

The grid shows how much of the conclusion depends on two numbers nobody can
know precisely. If the price is inside the grid, the valuation does not say
much about whether the stock is cheap. Acme's price of SEK 212 is reached only
in the top-right corner: a WACC of 7% with terminal growth of 2% or more, or
7.5% with 3%.

With an exit-multiple terminal, growth has no meaning, and the grid has one
column.

### Currency sensitivity

When the facts record which currencies a company earns and spends in, the
valuator reruns the DCF with each foreign currency 5% and 10% weaker and
stronger against the reporting currency. Revenue and costs in that currency
move by their shares, and the margin change is held for all ten years. A
company that sells in dollars but pays its staff in kronor gains margin when
the dollar strengthens; one with matched revenue and costs barely moves.

## Reverse DCF: what the price implies

The forward DCF asks what the company is worth on the analyst's assumptions.
The reverse DCF asks what growth the market must expect to justify today's
price.

It holds the base period's actual EBIT margin, capex and D&A shares of revenue
fixed, assumes no working-capital drag and a 2% terminal growth rate, and
searches for the constant ten-year revenue growth rate at which the DCF value
equals the price. It uses facts only, so the analyst's case cannot influence
it.

D&A above capex is capped at capex. The excess is usually amortisation of
acquired intangibles, which costs no cash, and holding it forever would count
phantom cash every year.

For Acme the answer is **7.6% a year for ten years**, at today's 12.1% EBIT
margin. The analyst's case has growth fading from 7% to 3%, averaging 5%, with
margins edging up to 13%. The market is paying for faster growth for longer
than the analyst believes in. Either the market knows something, or the
analyst does; the advice has to say which and why.

How to read the result:

- **Implied growth well above anything the company has achieved:** the price
  needs things to go better than they ever have. Possible, but it needs a
  reason.
- **Implied growth near zero or negative** for a business that is still
  growing: the market is pricing in decline. If you can see why it is wrong,
  that is the opportunity value investors look for.
- **No solution:** no growth rate between −50% and +100% reaches the price.
  This happens when the business has negative cash flow at today's margins; the
  price then depends on margins changing, not growth.

## Multiples

A multiple divides the price (or enterprise value) by a measure of what the
business earns or owns. Multiples are quick, widely quoted and easy to
compare, but each one hides assumptions about growth, risk and quality.
Kosing reports them as context, not as a value.

| Multiple | Is | Useful for |
|---|---|---|
| P/E | Market cap / net income | Shareholders' earnings; distorted by debt and one-offs |
| EV/EBIT | Enterprise value / EBIT | Operating profit, independent of how the company is financed |
| EV/EBITDA | Enterprise value / EBITDA | As EV/EBIT, before depreciation; flatters capital-heavy businesses |
| EV/Revenue | Enterprise value / revenue | Companies with little or no profit yet |
| P/B | Market cap / book equity | Asset-heavy businesses |
| P/TBV | Market cap / tangible book | Banks and insurers |
| Dividend yield | Dividends / market cap | Income |

For multiples, enterprise value includes lease liabilities, because reported
EBIT and EBITDA under IFRS 16 no longer carry the lease cost. A multiple over
zero or negative earnings is reported as null, not as a negative number that
could be misread as cheap.

Each multiple is placed against its own five-year range (`below`, `within`,
`above`), with the ten-year range and the peer median beside it. A multiple
below its history is not proof of cheapness: the business may have got worse.

> [!NOTE]
> This `position` (`below`, `within`, `above`) is where a multiple sits in its
> own history. It is not a position in the investor's sense, a holding
> recorded in `positions.md`.

## Cyclicals: normalised earnings

A cyclical's profit swings with the economy. Valuing it on peak profit makes
it look cheap at the top; valuing it on trough profit makes it look expensive
at the bottom, which is usually the time to buy. The fix is to value it on
**mid-cycle** profit:

```
EBIT          = revenue base × through-the-cycle EBIT margin
EV            = EBIT × EV/EBIT multiple
equity value  = EV − net debt − lease liabilities
```

The revenue base is either the last twelve months or an average of several
fiscal years, so a boom year does not set it. The case gives a margin and a
multiple for each of bear, base and bull, and can set a `multipleCeiling`
that no scenario may exceed, which stops the bull case from simply assuming the
market will pay more.

Here leases are subtracted, because the EBIT the multiple prices already
excludes the lease cost.

> [!NOTE]
> The **revenue base** is the revenue the calculation starts from, shared by
> all three scenarios. It is not the **base case**, and not the DCF's **base
> period**, though with the `ltm` setting it uses the same figures.

## Holding companies: NAV

A holding company's value is what it owns. **Net asset value** adds up the
parts and subtracts the holding company's own net debt:

```
NAV          = sum of the parts − parent net debt
equity value = NAV × (1 − warranted discount)
```

Each part is valued one of four ways:

- **Facts fair value:** the value the facts give for the holding, often its
  listed market value or the company's own reported fair value.
- **Look-through:** the holding's own Kosing value per share times the shares
  owned. A listed stake that Kosing has valued is counted at that value, not
  its price, so a holding company is not called cheap merely because its stakes
  are expensive.
- **Segment:** an operating business valued on a cited metric (say, EBITDA)
  times a multiple.
- **Analyst value:** an asset valued directly, with a rationale.

Every holding in the facts must appear in exactly one part or be explicitly
excluded, so nothing is left out quietly.

Holding companies usually trade below their NAV, for good reasons (costs,
taxes on disposal, a controlling owner's priorities) and bad ones. The
**warranted discount** is the analyst's view of how much of that discount is
deserved. The required discount is then applied on top.

> [!NOTE]
> The **warranted discount** (the NAV discount) is a judgement about how far
> below its assets a holding company deserves to trade. It is not a
> **discount rate**, since NAV does no discounting over time, and it is not
> the **required discount**, which comes after it and is the investor's
> margin of safety. A holding company passes through both: NAV, less the
> warranted discount, gives the base value; less the required discount, the
> entry price.

## Banks and insurers: excess return

A bank's debt is its stock in trade, so free cash flow and enterprise value do
not describe it. What matters is how much it earns on its shareholders' equity,
and whether that beats what the shareholders require.

```
earnings in a year   = ROTE × opening tangible book
excess return        = (ROTE − cost of equity) × opening tangible book
closing book         = opening book + earnings × (1 − payout ratio)

equity value = tangible book today
             + present value of ten years of excess return
             + present value of the excess return continuing after year ten
```

- **Tangible book** is shareholders' equity less goodwill and other
  intangibles, and less AT1 and other hybrid capital, which belongs to a
  different class of investor. It is the capital that actually absorbs losses.
- **ROTE**, return on tangible equity, is profit as a share of tangible book.
  The case gives a ten-year path.
- The **cost of equity** comes from CAPM, as in [Cost of capital](cost-of-capital.md).

A bank that earns exactly its cost of equity is worth its tangible book. One
that earns more is worth more, and one that earns less is worth less: it would
be better to hand the capital back.

The ROTE path is the analyst's most important call. It has to cover the rate
environments the bank has lived through, not extrapolate the last year, since
the high rates of recent years flattered bank earnings. A bank's bear case
carries a credit-loss cycle: a year or two of loan losses taking ROTE toward
zero, taken from the bank's own worst years, then recovery to a lower
normalised level. Lower rates alone are not a bear case for a levered
business.

The sensitivity grid for a bank varies the cost of equity and shifts the whole
ROTE path up or down by one and two percentage points.

**Implied ROTE.** The bank equivalent of the reverse DCF. A bank earning a
steady ROTE `r`, growing at `g`, with cost of equity `ke`, is worth
`(r − g) / (ke − g)` times its tangible book. Turned around, today's
price-to-tangible-book implies the steady ROTE the market expects:

```
implied ROTE = g + P/TBV × (ke − g)
```

A bank at 1.5 times tangible book, with a 10% cost of equity and 2% growth,
is priced for a steady 14% ROTE. If it has averaged 11% through a full cycle,
the market expects more than its history.

## The required discount

The last step turns the value into a decision rule.

> [!NOTE]
> The **required discount** is the margin of safety: a percentage taken once
> off the finished base value. It is not the **discount rate** (WACC or cost
> of equity) used inside the DCF and excess-return methods, and not the
> **warranted discount** of a holding company's NAV.

```
required discount = classification discount + AI-exposure add-on
entry price       = base value × (1 − required discount)
```

| Classification | Discount |
|---|---|
| `qualityCompounder` | 25% |
| `bankInsurer` | 25% |
| `garp` | 30% |
| `holdingCompany` | 30% |
| `specialSituation` | 35% |
| `valueCyclical` | 40% |

| AI exposure | Add-on |
|---|---|
| `direct` | +15 points |
| `picksAndShovels` | +10 points |
| `wealthEffect` | +5 points |
| `disruption` | +5 points |
| `secondOrderOnly` | 0 |

The discount is wider where the base value is less reliable: a cyclical's
mid-cycle margin is more of a guess than a compounder's, and a company tied to
the AI investment cycle could see its demand fall away if that cycle turns.

Acme is `garp` with `disruption` exposure: 30% + 5 = 35%.

```
entry price = 178 × (1 − 0.35) = SEK 116
```

The price is SEK 212, so it does not clear: `hurdle.clears` is false. The
advice cannot be `accumulate` unless it gives a written reason to break the
rule.

When the price is quoted in a different currency from the one the company
reports in, `hurdle.trading` restates the entry price in the quote currency.
When a company has both a company and a sector beta, the entry price on the
other beta is reported beside it, so you can see whether the decision depends
on that choice.

The table is the investor's, kept in the data repo's `lenses/investor.md`. The
code in `src/math/hurdle.ts` must match it; a change to one needs the same
change to the other.
