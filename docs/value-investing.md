# Value investing in brief

## Price is not value

A share is a small piece of ownership in a business. What the piece is worth
depends on the cash the business will hand its owners over its life: the
dividends, the buybacks, and the earnings it keeps and reinvests on their
behalf. The price is what someone on the exchange will trade it for today.

Most of the time the two are close. Sometimes they are not, because the market
is frightened, euphoric, or simply not paying attention to a small company.
Value investing is the practice of estimating the value independently, then
buying only when the price is well below it.

That sounds simple. The difficulty is that the value is an estimate of the
future, and every estimate is wrong by some amount. Most of what follows, and
most of what Kosing does, is about making that estimate honest and then
protecting yourself from its errors.

## Money later is worth less than money now

A krona in ten years is worth less than a krona today. You could put today's
krona in a government bond and have more than a krona in ten years, with
almost no risk. A business's future cash is also uncertain, so you want more
than the bond pays to take it on.

The rate that captures both, the safe return plus a premium for risk, is the
**discount rate**. Dividing a future amount by `(1 + rate)^years` turns it into
its **present value**: what it is worth to you today. Add up the present
values of all the cash a business will produce and you have its value. That
is a discounted cash flow, or **DCF**, and it is Kosing's main method.

Two things follow from the arithmetic, and they explain a lot of investing:

- **The discount rate matters enormously.** At 8% a krona in 20 years is
  worth 21 öre today; at 10% it is worth 15 öre. Small changes to the rate
  move the value of long-lived businesses a lot. See
  [Cost of capital](cost-of-capital.md).
- **Distant years dominate.** For a business expected to last, most of the
  value sits beyond any forecast horizon you can see clearly. Kosing reports
  how much of a value comes from that far future, so you know how much of it is
  faith.

## A range, not a number

Because the estimate is uncertain, Kosing values a company three times:

- **Bear:** things go wrong in the way they plausibly could.
- **Base:** the most likely outcome. Not a cautious number, not a hopeful one.
- **Bull:** things go right in the way they plausibly could.

The base case must be what you actually believe. A common mistake is to shade
the base case down "to be safe" and then also demand a discount on top of it,
counting the same caution twice. Kosing keeps the caution in one place: the
margin of safety.

## The margin of safety

Benjamin Graham's idea: buy only when the price is far enough below your
estimate of value that you still do fine if the estimate is wrong. The gap
absorbs errors you cannot see.

Kosing makes this a rule. Each company gets a **required discount**, and the
**entry price** is the base value less that discount. A price above the entry
price does not allow buying more, however good the story, unless the advice
gives a written reason to break the rule.

The required discount is larger where estimates are less reliable:

| Kind of company | Required discount |
|---|---|
| Quality compounder (durable, high returns, predictable) | 25% |
| Bank or insurer | 25% |
| Growth at a reasonable price | 30% |
| Holding company | 30% |
| Special situation | 35% |
| Cyclical | 40% |

On top of that, exposure to the AI investment cycle adds 0 to 15 percentage
points, because a company whose fortunes depend on that cycle is harder to
forecast. The table belongs to the investor and lives in the data repo's
`lenses/investor.md`; the code applies it. See
[The valuation math](valuation.md#the-required-discount).

> [!NOTE]
> The **required discount** here is not the **discount rate** from
> [Money later is worth less](#money-later-is-worth-less-than-money-now). The discount rate is a yearly percentage that turns future
> cash into a present value, inside the valuation. The required discount is a
> one-off percentage taken off the finished value to set the most you will pay.
> A third "discount", the NAV discount of a holding company, is a different
> thing again (see [The valuation math](valuation.md#holding-companies-nav)).
> And the "margin" in margin of safety is not a profit margin such as the EBIT
> margin.

## What is the market assuming?

Instead of asking "what is it worth?", you can ask "what must I believe to pay
today's price?" That is a **reverse DCF**: it solves for the growth rate that
makes the DCF value equal the price. If the answer is 15% a year for a decade
and the business has never grown faster than 5%, the price assumes something
you would need a good reason to believe.

This is often the more useful question. It turns a debate about one number
into a debate about one assumption, and it makes you say what the market
believes before you claim it is wrong.

## Mr. Market

Graham described the market as a manic-depressive business partner who offers
every day to buy your share or sell you his, at a price that swings with his
mood. You are free to ignore him. His offers are opportunities, not advice.

The practical lesson: a falling price is not evidence that the value fell, and
a rising price is not evidence you were right. The value changes when the
business changes. Kosing reassesses on new reports, not on price moves, and
the analyst writes down before each report what figures would confirm or break
the case.

## Know what you know

Some businesses you can understand well enough to estimate; many you cannot.
Warren Buffett calls the first set your circle of competence, and says the
skill is knowing where its edge is, not how large it is. A business you cannot
explain in a few honest sentences goes on the "too hard" pile, and Kosing has a
verdict for exactly that: `tooHard`.

Kosing also refuses some kinds of business outright. Real estate trusts and
utilities, pre-profit software companies and commodity producers have no
valuation method in Kosing, because the methods it has would give a confident
number with no real basis.

## Different businesses, different methods

A DCF assumes you can forecast the cash a business produces. That works for a
steady software company. It works badly for:

- **A cyclical** (a steel maker, a staffing firm), whose profit swings with the
  economy, so this year's profit says little about the long run. Kosing values
  these on normalised, mid-cycle earnings.
- **A holding company**, whose value is the stakes it owns. Kosing adds up the
  parts and subtracts the holding company's own debt.
- **A bank or insurer**, for which debt is raw material rather than financing,
  so "free cash flow" means little. Kosing values these on how much they earn
  on their book equity above the return shareholders require.

The company's **classification** decides the method. See
[The valuation math](valuation.md).

## Math in code, judgement in prose

Kosing splits the work in two:

- **The math is deterministic code.** Given the same inputs it gives the same
  numbers, every time, and it is tested. No one does arithmetic by hand or in
  their head.
- **The judgement is Claude's.** Which facts matter, what the business will
  look like in ten years, whether the market is wrong, how the investor's
  principles apply: these are written as reasoned prose, with sources.

The split protects against two failures. Arithmetic done in prose drifts and
errs quietly. And assumptions tuned after seeing the result turn a valuation
into a justification. Kosing's rule is that once you have seen the value, an
assumption changes only for a written reason, never to move the value toward
the price.

## Further reading

- Benjamin Graham, *The Intelligent Investor*, chapters 8 and 20 (Mr. Market;
  the margin of safety).
- Aswath Damodaran, *The Little Book of Valuation*, and his free data pages,
  which Kosing uses for equity risk premiums, country premiums and sector
  betas.
- Michael Mauboussin and Alfred Rappaport, *Expectations Investing*, on the
  reverse DCF.
