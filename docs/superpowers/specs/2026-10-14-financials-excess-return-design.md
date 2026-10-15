# Valuing banks and insurers: the excess-return method

Status: implemented, 2026-10-14.

Kosing has no method for `bankInsurer`, so every bank and insurer is too hard
by construction. This spec adds one valuation method for both, an
excess-return model on tangible book equity, so that Nordic, Swiss and other
Western European banks and insurers can be priced. SEB (SEB.A.STO) is the
first real run.

## Why not the DCF

A bank's debt is its raw material, not its financing, so free cash flow to the
firm and a WACC mean nothing. An insurer's float is the same. The standard
approach for both values the equity directly: book equity plus the present
value of what the company earns on it above what shareholders require. It is
deterministic, needs few inputs, and reads naturally against the price as a
price-to-tangible-book ratio.

## Decisions taken

- One method, `excessReturn`, for banks and insurers. Only the capital
  measure differs: CET1 for a bank, the Solvency II ratio for an insurer.
- The classification stays `bankInsurer`. Its required discount is 30%, plus
  the usual AI-exposure add-on.
- No new skill. The schema descriptions carry the conventions, and
  `analysing-company` names the method.

## Facts: the `financialInstitution` block

A new top-level key, `financialInstitution`, null for every other company. All
aggregate figures are in the document's `currency` and `unit`.

| Field | Meaning |
|---|---|
| `kind` | `bank` or `insurer` |
| `tangibleBookEquity` | Equity attributable to ordinary shareholders, less goodwill and other intangibles, excluding AT1 and other hybrid capital |
| `at1Capital` | AT1 and other hybrid capital carried in equity; null when none |
| `at1Coupons` | AT1 coupons for the base period, so earnings to ordinary shareholders can be read |
| `capitalRatio` | CET1 ratio (bank) or Solvency II ratio (insurer), as a fraction |
| `capitalRequirement` | The regulatory requirement including buffers, as a fraction (for an insurer, 1.0 for 100% SCR coverage) |
| `capitalTarget` | The company's own target or management buffer above the requirement, as a fraction; null when not stated |
| `riskWeightedAssets` | Bank only; null for an insurer |
| `netInterestIncome` | Bank only, the base period |
| `niiSensitivity` | Bank only: the disclosed change in annual net interest income for a one percentage point parallel rise in rates; null when not disclosed |
| `loanLossRatio` | Bank only: credit losses over loans, as reported |
| `costIncomeRatio` | Bank only, as reported |
| `combinedRatio` | Insurer only, non-life, as reported; null for a pure life insurer |
| `contractualServiceMargin` | Insurer only: the IFRS 17 CSM, recorded for the analyst's reading; not added to book |
| `sourceRefs` | Every source the block draws on |

Ratios here are reported KPIs, not computed by the researcher.

When the block is present, the parts of the facts that assume an operating
company carry fixed values, stated in the schema descriptions:
`balanceSheet.totalDebt` is 0, `costOfCapital.debtWeight` is 0,
`equityWeight` is 1, and `pretaxCostOfDebt` is 0. Decode enforces this, so a
bank's deposits are never read as debt.

The researcher records why the rate cycle matters in `research.md`: net
interest income through the zero-rate years (2015-2021) and since, and the
disclosed sensitivity. That history is what the analyst normalises over.

## Case: the `excessReturn` method

```
{
  "kind": "excessReturn",
  "rotePath": [ten fractions],
  "payoutRatio": fraction,
  "terminal": { "growth": fraction, "basis": "..." },
  "scenarios": { "bear": { "rotePath": [...], "rationale": "..." },
                 "bull": { "rotePath": [...], "rationale": "..." } } | null,
  "rationale": "...",
  "sourceRefs": [...]
}
```

- `rotePath`: return on tangible equity for each of ten years, as fractions.
  The base path is normalised across the rate regimes the company has lived
  through, not extrapolated from the latest year.
- `payoutRatio`: the share of earnings paid out as dividends or buybacks. Book
  grows by what is retained.
- `terminal.growth`: growth after year ten, below the cost of equity.
- Bear and bull replace the ROTE path; everything else is shared, as with the
  DCF's scenarios.
- Overrides stay dcf-only, so every override field is null; a cost-of-equity
  override may be added later if a case needs one. `sensitivity` is null: the
  grid below always runs on its default steps.

`classification` `bankInsurer` takes `excessReturn`; the method is allowed for
no other classification. The classification description in the case schema is
updated.

## The math

With tangible book `B0` from the facts, cost of equity `ke` from the facts'
cost of capital (risk-free plus beta times equity risk premium plus country
premium, no debt), ROTE `r_t` and payout `p`:

```
earnings_t   = r_t × B_{t-1}
B_t          = B_{t-1} + earnings_t × (1 − p)
excess_t     = (r_t − ke) × B_{t-1}
terminal     = (r_10 − ke) × B_10 / (ke − g)          (requires ke > g)
equity value = B0 + Σ excess_t / (1 + ke)^t + terminal / (1 + ke)^10
value/share  = equity value / shares
```

The terminal treats year ten's return on equity as steady and book growing at
`g`; consistency between `g` and retention is the analyst's to argue in the
basis, not enforced.

Outputs, per scenario: value per share, equity value, the implied
price-to-tangible-book (value over `B0`), and the share of value from the
terminal. `ke <= g` is reported as unavailable, as the DCF does.

**Reverse reading.** The steady-state ROTE the price implies:
`r* = g + (P / TBV) × (ke − g)`, with `P / TBV` the market's price over
tangible book per share and `g` the reverse DCF's default terminal growth. This
replaces the reverse DCF for a financial.

**Sensitivity.** A grid of cost of equity (±1pp in 0.5pp steps) against a
parallel shift in the base ROTE path (±2pp in 1pp steps).

## Results

- `valuation` gains an `excessReturn` section: per scenario as above, the
  cost of equity and its inputs, and the projected book and excess return by
  year.
- `pricedIn` for a financial: the implied ROTE in place of the reverse DCF;
  multiples are P/E, price to tangible book, and dividend yield, with history
  and peers where the facts carry them. EV-based multiples and the FX
  translation rows are not computed, and `derived.enterpriseValue` is null.
- `hurdle`: base value is the excess-return base value per share;
  `bankInsurer` takes 30%.
- A new warning, `capitalNearRequirement`, when the capital ratio is below
  the requirement plus the company's own target buffer (or plus 1pp when no
  target is stated).

## Testing

- The excess-return math against a published worked example of the
  residual-income model, cited in the test.
- Properties: with ROTE equal to the cost of equity every year, value equals
  tangible book; value rises with ROTE and falls with the cost of equity; the
  reverse reading inverts the steady-state value.
- Decode: the block's fixed values are enforced; `excessReturn` is rejected
  for any classification but `bankInsurer`; the block's kind-specific fields
  are null for the other kind.
- A bank and an insurer fixture, and the existing fixtures unchanged.
- SEB end to end with the two skills. A sanity check, not a test: the implied
  price-to-tangible-book and the implied ROTE should sit near what the market
  and brokers state for SEB.

## Out of scope

- Embedded value, dividend-discount and sum-of-the-parts approaches for
  insurers.
- Adding the CSM to book for life insurers; recorded, not used, until a case
  needs it.
- A cost-of-equity override.
- Pensions, which remain unhandled for operating companies too.

## Risks

- **Normalised ROTE carries the case.** As the mid-cycle margin does for a
  cyclical, one path decides most of the value. The rate history and the
  disclosed NII sensitivity are there so the bear case is a regime the bank
  has lived through, not a forecast of rates.
- **Tangible book differs by bank.** Treatment of AT1, minority interests and
  insurance subsidiaries varies; the schema says what to exclude and the
  researcher notes departures under source conflicts.
- **Bank betas.** Published betas have failed the check four times on
  operating companies. Damodaran's European bank and insurance sector betas
  are the fallback, as for any company.
