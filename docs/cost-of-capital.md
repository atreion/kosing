# Cost of capital

The discount rate turns future cash into today's value, and the value of a
long-lived business is very sensitive to it. This page explains what goes into
Kosing's discount rate, where each input comes from, and how much each one
moves the answer.

> [!NOTE]
> "Discount" on this page always means discounting: turning future cash into
> present value at a yearly rate. It is not the **required discount** of the
> margin of safety, which is taken off the finished value, nor the **NAV
> discount** of a holding company. See [The valuation math](valuation.md).

## Whose money is it?

A business is financed by two groups: shareholders, who own it, and lenders,
who are owed interest and principal. Each expects a return for the risk it
takes.

Kosing's DCF values the cash the business generates before any of it is paid
to either group: **free cash flow to the firm**, or FCFF. That cash belongs to
both groups, so it is discounted at a blend of what both require: the
**weighted average cost of capital**, WACC.

```
WACC = E × cost of equity + D × cost of debt × (1 − tax rate)
```

`E` and `D` are the shares of equity and debt in the company's financing, at
market value. The result is the value of the whole business, the **enterprise
value**. The lenders' claim (net debt) is subtracted afterwards to leave the
shareholders' part. See [The valuation math](valuation.md#from-enterprise-value-to-a-share).

## Cost of equity: CAPM

Shareholders have no contract saying what they will earn, so their required
return has to be estimated. The standard model is the capital asset pricing
model, CAPM. Kosing uses it in this form:

```
cost of equity = risk-free rate + beta × (equity risk premium + country premium)
```

Read it as: the safe return, plus a premium for owning shares rather than
bonds, scaled by how risky this particular share is.

### Risk-free rate

What you could earn with no risk: the yield on the 10-year government bond **in
the company's reporting currency**. A German company reporting in euros uses
the German Bund; a Swedish one reporting in kronor uses the Swedish 10-year.

The currency matters because cash flows and the discount rate must be in the
same currency. A krona-denominated forecast discounted at a dollar rate would
mix two different inflation rates. The facts record which bond and on what
date in `riskFreeBasis`.

**Why it matters:** it is the floor under every other return. When bond yields
rise, every company's required return rises with them, which is why share
prices tend to fall when rates rise even if nothing about the businesses has
changed.

### Equity risk premium (ERP)

How much more than the risk-free rate investors demand for holding the stock
market as a whole. Historically it has been somewhere around 4% to 6%. Kosing
takes it from Aswath Damodaran's current country table, which he updates
regularly from what market prices imply, rather than from a long-run average
that might no longer apply. The data repo keeps each edition of his tables
under `reference/damodaran/<YYYY-MM>/`; the latest month is the current one.

**Why it matters:** it is multiplied by beta and applies to every company, so
it moves every valuation in the same direction. Kosing does not let the
analyst pick a convenient ERP; it comes from the table.

### Beta

How much a share's price tends to move with the market. A beta of 1 moves with
it; 1.5 moves half as much again (rising more in good markets and falling more
in bad ones); 0.7 moves less. In CAPM, a higher beta means a higher required
return.

Kosing has two sources:

- **Company beta** (`betaCompany`): five years of the company's own price
  history against the market, as published by a named data provider. The
  researcher never calculates it.
- **Sector beta** (`betaSector`): Damodaran's average for companies in the same
  industry and region.

The company beta is used when there is one. The sector beta is used when no
provider publishes one, or when the published one is implausible, for
example when it would put the cost of equity below the yield on the
company's own bonds. A single company's beta is a noisy measure: five years of
one share's moves is a small sample, and a takeover rumour or a one-off crash
can distort it. The sector average is steadier but ignores what is special
about the company.

Because neither is clearly right, Kosing values the company on both when both
exist. `results.json` reports the value and the entry price on the beta it did
not use, under `alternativeBeta`, so you can see how much the choice matters.

**Why it matters:** beta multiplies the whole premium. For Acme, a beta of 1.2
instead of 1.1 raises the cost of equity by about half a percentage point and
cuts the value per share by about 9%.

### Country premium

Investors demand more to own businesses exposed to riskier economies. Kosing
takes Damodaran's country risk premiums and weights them **by where the
company earns its revenue**, not where it is headquartered. A Swedish company
selling mostly in emerging markets carries more country risk than its
domicile suggests; a company listed in a riskier country but selling mostly in
Europe carries less. `research.md` shows the weights. For a company selling
only in countries with a zero premium (most of Western Europe and the US), it
is zero.

Kosing scales the country premium by beta along with the equity risk premium.
That is one of the approaches Damodaran describes; it assumes a company's
exposure to country risk is in proportion to its exposure to market risk.

## Cost of debt

What the company pays to borrow: the yield on its traded bonds, or its
reported average borrowing rate. Interest is tax-deductible, so the real cost
is lower:

```
after-tax cost of debt = pre-tax cost of debt × (1 − tax rate)
```

That reduction is the **tax shield**. It is one reason a company with some
debt can have a lower WACC than one with none.

### Two tax rates

Kosing uses two tax rates for two different jobs:

- **Statutory rate** (the rate the company's own tax reconciliation uses, or
  the headline rate) for the tax shield in the WACC. The deduction is worth the
  marginal rate.
- **Effective rate** (tax actually paid over profit) for the cash flows, since
  that is what the company will really pay.

## Weights

`equityWeight` is market capitalisation divided by market capitalisation plus
debt, on a stated date; `debtWeight` is the rest. They are market values, not
book values, because they describe what investors have at stake today.

## Acme, worked through

Acme's facts give a Swedish 10-year yield of 2.5%, an ERP of 5.5%, no country
premium, no published company beta (so the sector beta of 1.1), a 4% pre-tax
cost of debt, a statutory tax rate of 20.6%, and weights of 90% equity and
10% debt.

```
cost of equity        = 2.5% + 1.1 × (5.5% + 0%)        = 8.55%
after-tax cost of debt = 4.0% × (1 − 0.206)              = 3.18%
WACC                  = 0.90 × 8.55% + 0.10 × 3.18%     = 8.01%
```

## How much it matters

Acme's base value is SEK 178 per share at a WACC of 8.01%. The same case at
other rates:

| WACC | Value per share | Change |
|---|---|---|
| 7.0% | SEK 219 | +23% |
| 7.5% | SEK 197 | +11% |
| 8.0% | SEK 178 | |
| 8.5% | SEK 162 | −9% |
| 9.0% | SEK 149 | −16% |

One percentage point either way moves the value by a fifth. Nothing about the
business changed; only the rate it is discounted at. This is why Kosing takes
the cost-of-capital inputs from published sources rather than letting anyone
choose them, why it shows the sensitivity grid with every valuation, and why
the margin of safety has to be wide.

Two things make the effect larger. A **longer-lived** business is more
sensitive, because more of its value sits in distant years. And a **terminal
growth rate close to the WACC** makes the value explode, because the terminal
formula divides by their difference (see
[Terminal value](valuation.md#terminal-value)).

## Overrides

A case can replace the beta or the WACC outright, or the tax rate, but only
for a DCF and only with a rationale. Overrides are for a company where the
published inputs clearly do not fit, for example a recent spin-off with no
price history. `results.json` marks an overridden WACC.

## Banks and insurers

For a bank, debt is not financing; it is the raw material, deposits lent on at
a margin. Mixing it into a WACC would make no sense. Kosing values banks and
insurers on equity alone, so their facts set debt to zero and equity weight to
one, and only the **cost of equity** is used. See
[Banks and insurers](valuation.md#banks-and-insurers-excess-return).
