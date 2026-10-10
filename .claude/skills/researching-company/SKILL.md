---
name: researching-company
description: Research a listed company into Kosing's facts.json and research.md, or refresh them (price, quarterly, annual or governance scope). Use when the user asks to research a company, refresh its market data or filings, or repair facts that kosing value rejects.
---

# Researching Company

Write one company's `facts.json` and `research.md` in the data repo. This is
the only skill that does web research feeding a company's documents. It
records what is observable and what the company is; it never values,
recommends, or judges whether to own it.

## Start here

Run every command from the Kosing repo root. Read before searching or writing:

- `references/researcher-brief.md`: units, signs, cost of capital, FX, the source hierarchy, the AI-cycle exposure levels, and what never goes in.
- `references/source-registry.md`: where to look, per market.

## Workflow

1. **Name the company.** Settle the ticker and exchange as the exchange quotes
   them. The id is `TICKER.EXCHANGE`, for example `ACME.STO` or `BRK.B.NYSE`.
   Run `npm run --silent kosing -- where <ID>`. It prints the company's
   directory. An error naming `DATA_PATH` means the data repo is not
   configured: stop and say so. If the directory exists, this is a refresh
   (see Refreshes); otherwise create it with `mkdir -p`.
2. **Read the contract.** Run `npm run --silent kosing -- schema facts`. Field
   names, types, enums and required keys come from it, not from memory. These
   rules are not in the schema, and decode enforces them:
   - every `sourceRef` and every member of every `sourceRefs` is an id in
     `sources`, and source ids are unique;
   - `financials.fiscalYears[].fy` values are distinct;
   - `costOfCapital.equityWeight + costOfCapital.debtWeight` is 1;
   - when `market.priceCurrency` differs from `currency`, `fx.spotRates` has
     that pair in either direction;
   - the share count decode uses (`market.sharesDilutedM`, or
     `market.sharesOutstandingM` when diluted is null) is not 0.
3. **Write `facts.json`.** Every key is present. Anything unknown is `null`
   and also gets a `gaps` entry with the field's path and the reason. Every
   figure cites a source by id. Units and signs follow the brief. A figure
   taken from a `tertiary` source also gets a `gaps` entry saying why the
   primary source could not be used.

   Research may be split across several agents. Each writes its own sources;
   before writing `facts.json`, merge them into one `S1`, `S2`, … sequence in
   which one document (one URL) has one id, and renumber every reference,
   including the citations in `research.md`.
4. **Write `research.md`** with exactly these sections, citing the same `S`
   ids as the facts inline:
   - `## What the business does`: products, customers, how it makes money, segments.
   - `## Moat and competition`
   - `## Management, ownership and governance`
   - `## Customers and revenue quality`: concentration, recurring share, contract length where reported.
   - `## Risks`
   - `## AI-cycle exposure`: the first line is exactly `Level: <level>`, one
     of `direct`, `picks_and_shovels`, `wealth_effect`, `disruption`,
     `second_order_only` (defined in the brief), followed by the revenue share
     or customer concentration behind it. Required for every company.
     `second_order_only` is a valid, sourced answer; omitting the section is not.
   - `## Source conflicts`: each conflict, the competing values, which one went
     into the facts and why. `None.` when there were none.
5. **Validate by screening.** Run `npm run --silent kosing -- value <ID>`.
   Exit 0 writes `results.json`: that is the screen, and it means the facts
   decode. Exit 1 prints `DecodeError[]` as JSON: fix `facts.json` at each
   `path` and run again. Never weaken or invent a figure to get past an error.
   If the honest answer is unknown, it is `null` with a gap. Exit 3 means
   `results.json` could not be written: nothing in the facts is wrong; report
   the message and stop.
6. **Commit in the data repo**, only the files this skill wrote:

   ```
   D="$(npm run --silent kosing -- where <ID>)"
   git -C "$D" add facts.json research.md results.json
   git -C "$D" commit -m "research(<ID>): <created|price|quarterly|annual|governance> as of <facts asOf>"
   ```

   Never push.
7. **Report**: created or refreshed, the facts' `asOf`, the gaps, the source
   conflicts, and the resolutions in `results.json` (the fallbacks decode
   applied). Hand off to `building-case`. No valuation figures and no opinion
   on the price.

## Refreshes

Read the existing `facts.json` and `research.md` first. Change only what the
scope covers, set `asOf` to today, and keep every other value and its source.

| Scope | Changes |
| --- | --- |
| `price` | `market`, `fx.spotRates` |
| `quarterly` | `financials.ltm`, `financials.quarters`, `market`, `estimates`, `fx.spotRates` |
| `annual` | a new `financials.fiscalYears` row, `balanceSheet`, `costOfCapital`, `historicalRanges`, `peers`, and everything `quarterly` covers |
| `governance` | the `## Management, ownership and governance` section of `research.md` only |

New figures get new source ids with today's `retrieved` date; never reuse an
old id for a new retrieval. Remove a source only when nothing cites it any
more. Git history is the revision log.

## Boundaries

- No verdicts, recommendations, target prices or entry prices. No WACC, DCF,
  margins or growth rates computed by hand: `kosing value` computes them.
- No `case.json`. Classification and assumptions belong to `building-case`.
- If web access is unavailable, say so and stop. Never present remembered
  figures as researched ones.
- Never write to `../invest`.
