# Valuing commodity producers: a mine part in the NAV

Status: implemented, 2026-10-26. The investor accepted the recommendation on
all six decisions.

`commodityProducer` has no method, so every miner is too hard by construction.
This adds a `mine` part to the existing sum-of-the-parts NAV and routes
`commodityProducer` to `nav`. A mine is valued as a finite cash flow:
production times price, less costs, capex, royalty and tax, discounted to
today, with no terminal value. The uranium screen (Kazatomprom, Paladin, Boss)
is the first use, Cameco's uranium segment the second, gold miners later.

## Why the existing methods fail

Normalised earnings assumes a steady business in perpetuity: a mine depletes,
a ramping producer's trailing EBIT means nothing, and the commodity price hides
inside a margin. The DCF's terminal value is wrong for a depleting asset. The
NAV's `segment` and `analystValue` parts work, but the judgement that matters
(the price) is made by hand, outside the code.

## Shape

The method carries one **price deck**: a flat bear, base and bull price in
today's USD, held for the life of every mine. A flat deck because the thesis is
about a level (the term price), not a path; a curve adds precision nobody has.
Each `mine` part carries: stage, ownership share, a production schedule (year,
volume) from the company's life-of-mine plan, unit cash cost and royalty,
sustaining and remaining initial capex, closure cost, tax rate, and a contract
book (decision 2). Tax is charged on margin after straight-line depreciation
of capex over the mine life. All cited, like every other part.

Results add, per scenario, the NAV and price-to-NAV, plus the **implied
price** (decision 5) and the base NAV at 8% real for comparison with broker
notes, which quote "NAV8".

## Decisions

**1. Discount rate.** (a) The company's WACC from Kosing's CAPM, with the US
10-year as risk-free because the cash flows are in USD, converted to real with
one stated inflation input (default: the US 10-year breakeven). (b) The
industry convention, a fixed 8% real for uranium (5% for gold).
*Recommend (a).* It keeps one discount-rate framework across the portfolio, so
a miner's entry price is comparable to every other name's. The 8% is a
convention, not a required return, and it varies by commodity for no stated
reason. Showing NAV8 alongside keeps broker comparisons possible. Cost: at
today's rates (US 10-year 5.19%, 2.84% real) a miner with a beta of 1.2-1.5
gets about 9-10% real, so Kosing values the same mine 10-20% below NAV8 on the
same price deck. The 8% convention dates from near-zero real yields and has
not moved with them; the WACC does.

**2. Contract book.** (a) One realised share of the market price per scenario
("realises 85%"). (b) Aggregate contract blocks: volume per year through a year,
either fixed-price or market-related with a floor and a ceiling; the rest sells
at the deck. *Recommend (b).* Who captures USD 96 term is the thesis, and the
book is where producers differ: Boss sells mostly uncontracted, Paladin carries
legacy ceilings, Kazatomprom is mostly spot-linked. With (a) the implied price
is ill-defined (which share?). Producers in scope disclose the book in
aggregate. Where one doesn't, a single market-related block with no floor or
ceiling reduces (b) to (a).

**3. Currency.** (a) Model each mine in USD at today's spot rates, convert the
NAV at spot, and treat currency through the existing currency add-on and FX
sensitivity (costs in AUD, CAD or KZT as the cost share). (b) An exchange rate
per scenario. *Recommend (a).* A rate per scenario is a second macro forecast
stacked on the price forecast. The natural hedge (a strong USD tends to come
with weak AUD and CAD, lowering local costs) is real, and the FX sensitivity
shows its size without forecasting it.

**4. Undeveloped assets.** (a) A fixed risk factor by stage: producing 1.0,
in construction 0.85, permitted and financed 0.6, feasibility 0.35, resource
only excluded. (b) An analyst factor per mine. *Recommend (a), with the first
production year as a scenario triple so the bear case can be late.*
Developers are where hope lives, and a per-mine factor invites the optimism the
method exists to remove. The numbers are a starting convention, close to what
sell-side risking uses; you can set them. A factor may be lowered with a
written reason, never raised.

**5. Implied price.** (a) Solve on base-case inputs: the flat uncontracted
price at which the base NAV equals today's market cap. (b) Solve per scenario.
*Recommend (a).* One number to set against the term price: "the market prices
USD 70 uranium while term is 96". Per scenario, the three answers differ only
through cost and timing inputs and read as noise.

**6. Required discount.** (a) 40%, as `valueCyclical`. (b) 35%, as
`specialSituation`. *Recommend (a).* A producer is a cyclical with
single-price risk on top. The NAV is already struck at a stated deck, so the
margin of safety's job is covering a wrong deck and cost overruns, which is the
full cyclical risk. AI add-on as usual (`secondOrderOnly` for pure plays).

## Not in scope

Streaming and royalty companies, by-product credits beyond a single cost
offset, hedging books, and a price path. The analysing skill gains guidance on
anchoring the deck: bear near the incentive price for new supply, base at or
below the current term price, bull with a reason.
