# Researcher brief

What goes into `facts.json` and `research.md`, and what never does. The schema
from `kosing schema facts` is authoritative on shape; this brief is
authoritative on meaning.

## Units and signs

- `currency` is the reporting currency. `unit` (`millions`, `thousands`,
  `ones`) applies to every aggregate figure: financial rows, the balance sheet,
  holdings, estimates of revenue and EBIT. Use the unit the source reports in;
  decode rescales.
- Per-share figures are never scaled by `unit`. Quoted ones (`market.price`,
  the 52-week range, `historicalRanges.sharePrice`) are in
  `market.priceCurrency`, the currency the exchange quotes. Reported ones
  (`estimates[].eps`) are in `currency`.
- Share counts are millions, whatever `unit` says.
- Percentages are fractions: `0.21`, not `21`.
- Figures keep the sign the statements give them: `capex`, `dividendsPaid`,
  `interestExpense` and `taxExpense` are negative when they are outflows.
- `totalDebt` is interest-bearing debt. Operating leases and pensions have
  their own fields and stay out of `totalDebt`.
- `totalEquity` is book equity attributable to shareholders.
- `ltm` is the trailing twelve months to the latest reported quarter. Leave it
  null when the company does not report quarters.

## Cost of capital

- `riskFreeRate`: the 10-year government bond yield in the reporting currency;
  `riskFreeBasis` says which bond and when.
- `erp` and `countryPremium` from Damodaran's current country table;
  `countryPremium` is null when the table shows none.
- **Sanity-check the beta before recording it.** After a large
  narrative-driven derating, measured 5-year regression betas are often
  artifacts (observed twice on large European compounders in August 2026:
  0.35 and 0.19). A beta that prices the cost of equity below the company's
  own bond coupon is implausible. Cross-check against Damodaran's sector beta.
  When the measured beta fails, set `betaCompany` to null and `betaSector` to
  the sector figure, so decode records the substitution, and write both values
  under `## Source conflicts`.
- `taxRateEffective` from the latest annual report; `taxRateStatutory` is the
  country's corporate rate.
- `equityWeight` and `debtWeight` at market values on `weightsAsOf`: market
  capitalisation against total debt.

## FX

`market.priceCurrency` differs from `currency` only when the shares are quoted
in a currency the company does not report in. Then `fx.spotRates` carries that
pair, in either direction, dated and sourced. `fx.exposures` lists each
currency with a material share of revenue or costs, with the shares the
company reports; an unreported share is null. `fx` is null for a company with
one currency and no material foreign exposure.

## Source hierarchy

When sources conflict on a figure, prefer, in order:

1. The most recent primary filing (annual, interim or quarterly report) from
   the company's IR page or the regulator.
2. An older primary filing.
3. Broker estimate pages and consensus.
4. Aggregator pages.

Set `tier` to `primary`, `secondary` or `tertiary` accordingly. Use the
highest-tier value and record the conflict in `research.md` under
`## Source conflicts`.

Source ids are `S1`, `S2`, … in order of first use. One id is one document
retrieved once.

## AI-cycle exposure levels

The level is the first line of `## AI-cycle exposure` in `research.md`:
`Level: <level>`. The advisor keys the required-discount add-on on it, so it
is a structured line, not a sentence buried in the risks.

- `direct`: revenue depends on AI compute demand or AI model economics. Chip
  vendors, hyperscalers, model labs, neoclouds.
- `picks_and_shovels`: a material revenue share from datacentre capex. Power,
  grid, cooling, construction, semicap, cabling.
- `wealth_effect`: demand driven by customers' financial-asset gains. Luxury,
  premium autos, brokers, high-end housing.
- `disruption`: AI substitutes for the product or compresses its pricing.
  Seat-priced software, IT services, media, education.
- `second_order_only`: exposed through the general recession channel only.
  Consumer staples, domestic utilities, most insurers, defence. Not zero
  exposure, just the weakest channel.

Cite the revenue share or customer concentration behind the level.

## What never goes in

- Computed metrics: margins, growth rates, ROIC, FCF conversion, multiples.
  `kosing value` computes them.
- Valuation outputs: WACC, DCF, reverse DCF, target or entry prices, margins of
  safety.
- Recommendations: action, position size, broker, wrapper.
- Verdict-shaped sentences in `research.md`: "the company has a wide moat",
  "management is strong", "FX exposure is immaterial", "the stock is cheap".
  Describe what is observable and cite it. Judging it is the advisor's work.
