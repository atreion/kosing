# Source Registry

Preferred data sources for the Researcher, grouped by region and data type. Always cite the primary source when available; fall back to secondary/tertiary only with `tier` recorded accordingly.

## Universal (regardless of region)

| Need | Source | Trust tier |
|---|---|---|
| Equity risk premium, country premium | Damodaran (`pages.stern.nyu.edu/~adamodar/`) | primary |
| Sector beta | Damodaran (industry betas page) | primary |
| Macro: ISO currency codes, country codes | ISO directly | primary |

## Sweden (SEK)

| Need | Source | Trust tier |
|---|---|---|
| Risk-free rate (Swedish 10y govt bond) | Riksbank (`riksbank.se`) | primary |
| FX fixings (SEK pairs) | Riksbank daily fixing | primary |
| Listed company filings | Company IR page; Finansinspektionen | primary |
| Financial history, ratios | Börsdata (`borsdata.se`) | secondary |
| Consensus estimates | Avanza, Handelsbanken research | secondary |
| Macro statistics | SCB (`scb.se`) | primary |
| Tax rules | Skatteverket (`skatteverket.se`) | primary |

## Germany / Eurozone (EUR)

| Need | Source | Trust tier |
|---|---|---|
| Risk-free rate (German 10y Bund) | Bundesbank | primary |
| Listed company filings | Company IR page; Bundesanzeiger | primary |
| Consensus estimates | Broker pages (Avanza, Bloomberg) | secondary |

## United States (USD)

| Need | Source | Trust tier |
|---|---|---|
| Risk-free rate (US 10y Treasury) | FRED (`fred.stlouisfed.org`), Treasury Direct | primary |
| Listed company filings | SEC EDGAR (`sec.gov/edgar`) | primary |
| Consensus estimates | Broker pages | secondary |

## United Kingdom (GBP)

| Need | Source | Trust tier |
|---|---|---|
| Risk-free rate (UK 10y Gilt) | Bank of England | primary |
| Listed company filings | Companies House; LSE RNS | primary |

## Norway (NOK)

| Need | Source | Trust tier |
|---|---|---|
| Risk-free rate (Norwegian 10y govt) | Norges Bank | primary |
| Listed company filings | Company IR; Oslo Børs | primary |

## Australia (AUD)

| Need | Source | Trust tier |
|---|---|---|
| Risk-free rate (Australian 10y govt) | RBA | primary |
| Listed company filings | ASX announcements; company IR | primary |

## Other markets

For markets not listed above, use:
1. The country's central bank for the local 10y govt-bond yield.
2. The primary stock exchange or regulator for filings.
3. Damodaran's country page for ERP and country premium.

When a primary source is genuinely unavailable, fall back to a tertiary aggregator (Yahoo Finance, Investing.com) and record `tier: "tertiary"` and add a `gaps` entry in `facts.json` explaining why the primary source couldn't be reached.

## Source ID convention

Within a single `facts.json`, assign `S1`, `S2`, … to sources in order of first introduction. Each `id` corresponds to one URL fetched in one researcher session. If the same publication is referenced in two refreshes, the new refresh gets a new `S` id (with a fresh `retrieved` date) — never reuse old ids with stale dates.
